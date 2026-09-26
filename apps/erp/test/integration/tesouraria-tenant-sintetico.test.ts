/**
 * ORÁCULO de integração da spec 22 (tasks 3.4-ter/3.5-bis, 4.9 e o seam do L4)
 * — escrito pelo `verificador-fluxo-caixa`, nunca por um agente `feat-*`.
 * Qualquer alteração a este ficheiro por quem implementa é BLOCKER (doutrina
 * 00 §2).
 *
 * UM tenant sintético numa DB efémera (Testcontainers), semeado PELOS
 * SERVIÇOS — `registarTenant` (provisioning real, com bootstrap do plano de
 * contas, diários e séries), `abrirExercicio`, `criarContaBancaria`,
 * `criarLancamento`/`confirmarLancamento`, `clienteService.criar`,
 * `emitirFatura`/`registarPagamento`, `PayrollService` — dentro de
 * `runWithTenantContext`. NUNCA por INSERT directo: um teste que fabrica
 * estado por INSERT afirma que aquele estado é alcançável, e deixa de o
 * provar quando o caminho real ganha uma regra que o INSERT não conhece.
 *
 * O que a golden fixture do seed demo NÃO consegue provar, e este tenant
 * prova:
 *  (a) o ramo bancário do `saldoTesourariaAte` com DUAS contas bancárias
 *      activas na MESMA conta PGC — a desduplicação do §2-bis (3.4-ter e
 *      3.5-bis; no demo `contasBancarias: 0`);
 *  (b) o deslocamento por cenário com perfil de atraso ≠ 0 — no demo a média
 *      e o desvio são 0 e `BASE == OTIMISTA` por vacuidade;
 *  (c) o seam `perfilAtraso` → `projetarTesouraria` → `distribuirCompromissos`:
 *      um `projetarTesouraria` que trocasse média e desvio ficava verde no
 *      property test (que exercita a função pura directamente) E na fixture
 *      (perfil zero). Aqui a amostra tem média 6 e σ = √(320/19) ≈ 4,104 —
 *      round(6) = 6 ≠ round(4,104) = 4 — e o dia de aterragem da entrada no
 *      BASE denuncia a troca;
 *  (d) o §12 do ADR-0036: `Payroll` `PROCESSADO` com `dataPagamento` nula
 *      cai no último dia ÚTIL do mês de referência, num mês que acaba a
 *      sábado E noutro que acaba a domingo (4.9; no demo o payroll é todo
 *      `PENDENTE`).
 *
 * NOTA (para o handoff): o `CompromissoTesouraria` MENSAL pedido para este
 * tenant NÃO pode ser semeado pelos serviços hoje — `criarCompromisso` é o nó
 * L5 e ainda só existe no contrato (`projecao.interface.ts`). O teste
 * respectivo detecta a ausência em runtime e salta COM RUÍDO (aparece como
 * skipped, nunca como verde); activa-se sozinho quando o L5 entregar.
 * Contornar com INSERT directo afirmaria que o estado é alcançável antes de
 * haver escritor — exactamente o que este oráculo existe para não fazer.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { EmitirFaturaSchema, RegistarPagamentoFaturaSchema } from '@/lib/validations/faturacao';
import {
  CriarContaBancariaSchema,
  CriarLancamentoSchema,
  AbrirExercicioSchema,
} from '@/lib/validations/contabilidade';
import { CreateClienteSchema } from '@/lib/validations/clientes';
import { CreateColaboradorSchema } from '@/lib/validations/rh';
import {
  TabelaINSSSchema,
  CriarEscaloesIRPSSchema,
  ProcessarFolhaSchema,
} from '@/lib/validations/payroll';
import {
  FiltroProjecaoSchema,
  CriarCompromissoSchema,
  type Cenario,
} from '@/lib/validations/tesouraria';
import type {
  Bucket,
  ProjecaoTesouraria,
} from '@/server/services/financas/projecao.interface';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// O `prismaBase` lê DATABASE_URL no import; o container só existe depois do
// globalSetup — por isso a URL fixa-se aqui e os módulos com estado importam-se
// DINAMICAMENTE no beforeAll (mesmo padrão de registo-publico.test.ts).
if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

// ---------------------------------------------------------------------------
// Dublês de fronteira (não de domínio): Keycloak, Stripe e a sessão.
// O Postgres é real; o que aqui se prova é o domínio, não a Admin API.
// ---------------------------------------------------------------------------

const ErroKeycloakReal = vi.hoisted(
  () =>
    class ErroKeycloak extends Error {
      constructor(
        readonly status: number,
        mensagem: string,
      ) {
        super(mensagem);
        this.name = 'ErroKeycloak';
      }
    },
);

const kc = vi.hoisted(() => {
  let n = 0;
  return {
    procurarPorEmail: vi.fn(async () => null),
    garantirUtilizador: vi.fn(async () => ({
      sub: `kc-oraculo-22-${(n += 1)}-${Date.now()}`,
      criado: true,
    })),
    definirPalavraPasse: vi.fn(async () => {}),
    eliminarUtilizador: vi.fn(async () => {}),
  };
});

vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: ErroKeycloakReal,
  procurarPorEmail: kc.procurarPorEmail,
  garantirUtilizador: kc.garantirUtilizador,
  definirPalavraPasse: kc.definirPalavraPasse,
  eliminarUtilizador: kc.eliminarUtilizador,
}));

// Trial no Stripe: efeito externo best-effort, fora do âmbito.
vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  criarSubscricaoTrial: vi.fn(async () => ({ criada: false })),
}));

// `emitirFatura` exige sessão com e-mail confirmado (travão de emissão da
// spec 21). A sessão é fronteira, não domínio — dobra-se.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

// ---------------------------------------------------------------------------
// Aritmética de dias civis (própria do oráculo — não importa a do serviço).
// Convenção da casa: NUNCA `new Date('aaaa-mm-dd')`; meio-dia local garante o
// mesmo dia civil em Africa/Maputo para qualquer fuso de runner razoável.
// ---------------------------------------------------------------------------

const DIA_MS = 86_400_000;
const D = (v: string | number) => new Prisma.Decimal(v);

function serialDe(ano: number, mes: number, dia: number): number {
  return Date.UTC(ano, mes - 1, dia) / DIA_MS;
}

function civilDoSerial(serial: number): { ano: number; mes: number; dia: number } {
  const d = new Date(serial * DIA_MS);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** Materializa um dia civil como Date a meio-dia local. */
function dataDoSerial(serial: number): Date {
  const { ano, mes, dia } = civilDoSerial(serial);
  return new Date(ano, mes - 1, dia, 12);
}

/** 0 = domingo … 6 = sábado (dia da semana de um dia CIVIL não depende de fuso). */
function diaSemanaDoSerial(serial: number): number {
  return new Date(serial * DIA_MS).getUTCDay();
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Derivação PRÓPRIA do §12 (ADR-0036): último dia do mês que não é sábado nem
 * domingo, sem feriados. Reescrita aqui a partir da letra do ADR, não copiada
 * da implementação — e os testes ainda asseram, por cima, dois factos apurados
 * à mão: o dia é uma SEXTA-FEIRA e difere do último dia civil.
 */
function ultimoDiaUtilSerial(ano: number, mes: number): number {
  let dia = ultimoDiaDoMes(ano, mes);
  while ([0, 6].includes(diaSemanaDoSerial(serialDe(ano, mes, dia)))) dia -= 1;
  return serialDe(ano, mes, dia);
}

/** Fim do dia civil em Maputo como instante UTC (23:59:59.999+02:00). */
function instanteFimDoDia(serial: number): Date {
  const { ano, mes, dia } = civilDoSerial(serial);
  return new Date(Date.UTC(ano, mes - 1, dia, 21, 59, 59, 999));
}

// ---------------------------------------------------------------------------
// Constantes do tenant sintético — TODOS os números esperados derivam daqui,
// à mão, nunca da implementação.
// ---------------------------------------------------------------------------

/** Saldo do razão da conta 121 (um único lançamento manual LANCADO). */
const SALDO_121 = '250000.00';
/** O dobro — o que uma soma por conta BANCÁRIA (bug do §2-bis) devolveria. */
const SALDO_121_DUPLICADO = '500000.00';

/**
 * Amostra do perfil de atraso: 20 facturas PAGAS, 10 com atraso de 2 dias e
 * 10 com atraso de 10 dias. À mão:
 *   média = (10×2 + 10×10) / 20 = 6  →  deslocamento BASE = round(6) = 6
 *   σ amostral = √(Σ(x−6)²/19) = √(320/19) ≈ 4,10391
 *              →  deslocamento PESSIMISTA = round(6 + 4,10391) = 10
 * A troca média↔desvio daria BASE = round(4,10391) = 4 ≠ 6 — visível no dia
 * de aterragem. O σ POPULACIONAL seria √(320/20) = 4 exacto; o amostral
 * (divisor n−1, ADR-0036 §10) distingue-se dele na asserção do perfil.
 */
const ATRASOS = [...Array<number>(10).fill(2), ...Array<number>(10).fill(10)];
const MEDIA_ESPERADA = 6;
const DESVIO_AMOSTRAL_ESPERADO = Math.sqrt(320 / 19);
const DESLOC_BASE = 6;
const DESLOC_PESSIMISTA = 10;

/** Facturas em aberto: A vence hoje+2 (10 000,00) e B hoje+10 (5 000,00). */
const VALOR_A = '10000.00';
const VALOR_B = '5000.00';
const VENC_A_DIAS = 2;
const VENC_B_DIAS = 10;

const HORIZONTE = 30;

// ---------------------------------------------------------------------------
// Estado partilhado (preenchido no beforeAll)
// ---------------------------------------------------------------------------

let db: (typeof import('@/server/db/client'))['prismaBase'];
let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
let contab: typeof import('@/server/services/financas/contabilidade.service');
let proj: typeof import('@/server/services/financas/projecao.service');

let ctx: { tenantId: string; userId: string };
let sHoje = 0; // dia civil de Maputo no momento do seed
let faturaAId = '';
let faturaBId = '';
/** Payroll PROCESSADO por mês-alvo: [mês que acaba a sábado, mês que acaba a domingo]. */
let mesesPayroll: Array<{ ano: number; mes: number; acabaA: 'sabado' | 'domingo' }> = [];

async function projetar(cenario: Cenario, horizonteDias = HORIZONTE): Promise<ProjecaoTesouraria> {
  return runCtx(ctx, () =>
    proj.projetarTesouraria(
      FiltroProjecaoSchema.parse({
        horizonteDias,
        granularidade: 'DIARIA',
        cenario,
      }),
      ctx,
    ),
  );
}

/** Índices (0-based) dos buckets DIÁRIOS onde a ocorrência `origemId` aparece. */
function bucketsCom(res: ProjecaoTesouraria, origemId: string): number[] {
  const out: number[] = [];
  res.buckets.forEach((b: Bucket, i: number) => {
    if (b.ocorrencias.some((o) => o.origemId === origemId)) out.push(i);
  });
  return out;
}

function serialCivilMaputo(data: Date): number {
  const { ano, mes, dia } = contab.diaCivilEmMaputo(data);
  return serialDe(ano, mes, dia);
}

describe.skipIf(skip)('spec 22 — tenant sintético semeado pelos serviços (oráculo L4)', () => {
  beforeAll(async () => {
    process.env.CAPTCHA_PROVIDER = 'none';

    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    proj = await import('@/server/services/financas/projecao.service');
    const { registarTenant } = await import('@/server/provisioning/registo-publico');
    const { clienteService } = await import('@/server/services/comercial/cliente.service');
    const { ColaboradorService } = await import('@/server/services/pessoas-projetos/rh.service');
    const { PayrollService } = await import('@/server/services/pessoas-projetos/payroll.service');
    const fat = await import('@/server/services/financas/faturacao.service');

    // ── 1. Tenant pelo caminho de produção (bootstrap de PGC, diários, séries)
    const marca = Date.now();
    const email = `oraculo-22+${marca}@tesouraria.mz`;
    const registo = await registarTenant(
      {
        empresa: { nome: 'Tesouraria Sintética, Lda', nuit: String(400_000_000 + (marca % 99_999_999)) },
        admin: { nome: 'Olga Verificadora', email },
        senha: 'oraculo-spec22-verde',
        confirmacao: 'oraculo-spec22-verde',
        planoId: 'PROFISSIONAL',
        provincia: 'Maputo Cidade',
        captchaToken: 'dev',
      },
      { ip: '41.222.33.44', idempotencyKey: `oraculo-22-${marca}` },
    );
    if (!registo.ok) {
      throw new Error(`registarTenant recusou o tenant sintético: ${JSON.stringify(registo)}`);
    }
    const tenant = await db.tenant.findFirst({ where: { slug: registo.tenantSlug } });
    const admin = await db.user.findFirst({ where: { tenantId: tenant!.id, email } });
    if (!tenant || !admin) throw new Error('Tenant ou admin não encontrados após o registo.');
    ctx = { tenantId: tenant.id, userId: admin.id };

    sHoje = serialCivilMaputo(new Date());
    const { ano: anoHoje, mes: mesHoje } = civilDoSerial(sHoje);

    // ── 2. Exercícios abertos (o corrente e o anterior: as datas do seed são
    //       relativas a hoje e podem atravessar a fronteira do ano)
    await runCtx(ctx, () => contab.abrirExercicio(AbrirExercicioSchema.parse({ ano: anoHoje - 1 }), ctx));
    await runCtx(ctx, () => contab.abrirExercicio(AbrirExercicioSchema.parse({ ano: anoHoje }), ctx));

    // ── 3. DUAS contas bancárias ACTIVAS na MESMA conta PGC 121 (§2-bis)
    const conta121 = await db.contaPGC.findFirst({ where: { tenantId: ctx.tenantId, codigo: '121' } });
    const conta711 = await db.contaPGC.findFirst({ where: { tenantId: ctx.tenantId, codigo: '711' } });
    const diarioOP = await db.diario.findFirst({ where: { tenantId: ctx.tenantId, codigo: 'OP' } });
    if (!conta121 || !conta711 || !diarioOP) {
      throw new Error('Bootstrap incompleto: falta 121, 711 ou o diário OP.');
    }
    for (const sufixo of ['alfa', 'beta']) {
      await runCtx(ctx, () =>
        contab.criarContaBancaria(
          CriarContaBancariaSchema.parse({
            banco: 'BANCO ORACULO 22',
            agencia: '001',
            numeroConta: `sintetico-${sufixo}`,
            tipoConta: 'CORRENTE',
            contaContabilId: conta121.id,
          }),
          ctx,
        ),
      );
    }

    // ── 4. Movimento real no razão do 121: 250 000,00 a débito, LANCADO
    const lanc = await runCtx(ctx, () =>
      contab.criarLancamento(
        CriarLancamentoSchema.parse({
          data: new Date(),
          diarioId: diarioOP.id,
          historico: 'Abertura de tesouraria do oráculo (débito 121)',
          partidas: [
            { contaId: conta121.id, tipo: 'DEBITO', valor: 250000 },
            { contaId: conta711.id, tipo: 'CREDITO', valor: 250000 },
          ],
        }),
        ctx,
      ),
    );
    await runCtx(ctx, () => contab.confirmarLancamento(lanc.id, ctx));

    // ── 5. Cliente e série de facturação
    const cliente = await runCtx(ctx, () =>
      clienteService.criar(
        CreateClienteSchema.parse({
          nome: 'Cliente Pontualmente Atrasado, SA',
          tipo: 'JURIDICA',
          nuit: '400111222',
          email: 'financeiro@cliente-atrasado.mz',
          telefone: '841112223',
          enderecos: [
            {
              tipo: 'FACTURACAO',
              rua: 'Av. 24 de Julho',
              numero: '1',
              bairro: 'Polana',
              cidade: 'Maputo',
              provincia: 'Maputo Cidade',
              principal: true,
            },
          ],
        }),
        ctx,
      ),
    );
    // #93: a emissão já não recebe série — usa a activa do ano. Esta leitura só
    // falha cedo, com mensagem clara, se o bootstrap não a tiver criado.
    const serieFatura = await db.serieDocumento.findFirst({
      where: { tenantId: ctx.tenantId, tipo: 'FATURA', ano: anoHoje, ativo: true },
    });
    if (!serieFatura) throw new Error('Série FATURA do ano corrente não encontrada no bootstrap.');

    const emitir = (dataEmissao: Date, dataVencimento: Date, preco: number) =>
      runCtx(ctx, () =>
        fat.emitirFatura(
          EmitirFaturaSchema.parse({
            clienteId: cliente.id,
            dataEmissao,
            dataVencimento,
            linhas: [
              {
                descricao: 'Serviços de consultoria',
                quantidade: 1,
                precoUnitario: preco,
                taxaIva: 0, // isento — mantém os totais redondos, apurados à mão
              },
            ],
          }),
          ctx,
        ),
      );

    // ── 6. Vinte facturas PAGAS com atrasos POSITIVOS e VARIADOS (média 6, σ>0)
    //       Vencimento hoje−60; pagamento no vencimento + atraso — tudo dentro
    //       da janela dos 180 dias do perfil.
    const sVencPagas = sHoje - 60;
    for (const [i, atraso] of ATRASOS.entries()) {
      const fatura = await emitir(dataDoSerial(sVencPagas - 10), dataDoSerial(sVencPagas), 1000);
      await runCtx(ctx, () =>
        fat.registarPagamento(
          RegistarPagamentoFaturaSchema.parse({
            faturaId: fatura.id,
            valor: 1000,
            dataPagamento: dataDoSerial(sVencPagas + atraso),
          }),
          ctx,
        ),
      );
      if (i === ATRASOS.length - 1) {
        // sanity local do seed, não asserção do sistema
        const paga = await db.fatura.findFirst({ where: { id: fatura.id } });
        if (paga?.status !== 'PAGA') throw new Error('Seed degradado: factura da amostra não ficou PAGA.');
      }
    }

    // ── 7. Duas facturas EM ABERTO, futuras — as entradas que o cenário desloca
    const fatA = await emitir(dataDoSerial(sHoje), dataDoSerial(sHoje + VENC_A_DIAS), 10000);
    const fatB = await emitir(dataDoSerial(sHoje), dataDoSerial(sHoje + VENC_B_DIAS), 5000);
    faturaAId = fatA.id;
    faturaBId = fatB.id;

    // ── 8. Payroll PROCESSADO com dataPagamento NULA em dois meses passados:
    //       um a acabar a SÁBADO e outro a DOMINGO (ADR-0036 §12, task 4.9)
    await runCtx(ctx, () =>
      PayrollService.criarTabelaINSS(
        TabelaINSSSchema.parse({
          vigenciaInicio: dataDoSerial(sHoje - 730),
          taxaTrabalhador: 0.03,
          taxaEntidade: 0.04,
        }),
        ctx,
      ),
    );
    await runCtx(ctx, () =>
      PayrollService.criarEscaloesIRPS(
        CriarEscaloesIRPSSchema.parse({
          vigenciaInicio: dataDoSerial(sHoje - 730),
          escaloes: [
            { ordem: 1, limiteInferior: 0, limiteSuperior: null, taxa: 0.1, parcelaAbater: 0, numeroDependentes: 0 },
          ],
        }),
        ctx,
      ),
    );
    await runCtx(ctx, () =>
      ColaboradorService.criar(
        CreateColaboradorSchema.parse({
          codigo: 'COL-001',
          nome: 'Trabalhadora Única',
          dataNascimento: new Date(1990, 4, 10, 12),
          genero: 'FEMININO',
          estadoCivil: 'SOLTEIRO',
          nacionalidade: 'Moçambicana',
          naturalidadeProvincia: 'Maputo Cidade',
          naturalidadeDistrito: 'KaMpfumo',
          bi: '110100123456A',
          nuit: '400333444',
          email: 'trabalhadora@tesouraria.mz',
          telefone: '842223334',
          enderecoRua: 'Rua da Se',
          enderecoNumero: '10',
          enderecoBairro: 'Central',
          enderecoCidade: 'Maputo',
          enderecoProvincia: 'Maputo Cidade',
          emergenciaNome: 'Maria Contacto',
          emergenciaParentesco: 'Irmã',
          emergenciaTelefone: '843334445',
          dataAdmissao: dataDoSerial(sHoje - 1000),
          status: 'ACTIVO',
          tipoContrato: 'EFECTIVO',
          regimeTrabalho: 'TEMPO_INTEGRAL',
          salarioBase: 50000,
        }),
        ctx,
      ),
    );

    // Procurar, nos 24 meses ANTERIORES, o mais recente a acabar a sábado e o
    // mais recente a acabar a domingo. Meses passados ⇒ a saída é vencida ⇒
    // entra no primeiro bucket em qualquer horizonte, sem dependência da data
    // em que a suite corre.
    const alvos: typeof mesesPayroll = [];
    for (let k = 1; k <= 24 && alvos.length < 2; k += 1) {
      const mesAbs = (anoHoje * 12 + (mesHoje - 1)) - k;
      const ano = Math.floor(mesAbs / 12);
      const mes = (mesAbs % 12) + 1;
      const dow = diaSemanaDoSerial(serialDe(ano, mes, ultimoDiaDoMes(ano, mes)));
      if (dow === 6 && !alvos.some((a) => a.acabaA === 'sabado')) alvos.push({ ano, mes, acabaA: 'sabado' });
      if (dow === 0 && !alvos.some((a) => a.acabaA === 'domingo')) alvos.push({ ano, mes, acabaA: 'domingo' });
    }
    if (alvos.length !== 2) {
      throw new Error('Não encontrei, em 24 meses, um mês a acabar a sábado e outro a domingo.');
    }
    mesesPayroll = alvos;

    for (const { ano, mes } of mesesPayroll) {
      const { folhaId } = await runCtx(ctx, () =>
        PayrollService.processarFolhaMes(ProcessarFolhaSchema.parse({ mes, ano }), ctx),
      );
      await runCtx(ctx, () => PayrollService.marcarProcessada(folhaId, ctx));
    }
  }, 120_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  // -------------------------------------------------------------------------
  // 3.4-ter / 3.5-bis — o alias do §2-bis tem um guardião
  // -------------------------------------------------------------------------

  it('duas ContaBancaria ACTIVAS na mesma ContaPGC ⇒ o saldo do razão entra UMA vez (§2-bis)', async () => {
    // Anti-vacuidade: o estado que falsifica a duplicação existe mesmo.
    const ativas = await db.contaBancaria.findMany({
      where: { tenantId: ctx.tenantId, ativo: true },
      select: { contaContabilId: true },
    });
    expect(ativas).toHaveLength(2);
    expect(new Set(ativas.map((c) => c.contaContabilId)).size).toBe(1);

    const saldo = await runCtx(ctx, () => proj.saldoTesourariaAte(instanteFimDoDia(sHoje), ctx));

    // 250 000,00 apurados à mão do único lançamento LANCADO no 121. Uma soma
    // por conta BANCÁRIA (o erro de categoria do §2-bis) devolveria o dobro.
    expect(
      saldo.equals(D(SALDO_121)),
      `saldoTesourariaAte devolveu ${saldo.toString()}; o razão do 121 tem ${SALDO_121} e ` +
        `uma soma por conta bancária (alias duplicado) daria ${SALDO_121_DUPLICADO}.`,
    ).toBe(true);
    expect(saldo.equals(D(SALDO_121_DUPLICADO))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (b) + (c) — o deslocamento por cenário chega ao pipeline, e média e desvio
  // não são trocáveis
  // -------------------------------------------------------------------------

  it('I3 estrito: saldo_PESSIMISTA(d) < saldo_BASE(d) < saldo_OTIMISTA(d) nalgum d, ao cêntimo', async () => {
    const [otimista, base, pessimista] = await Promise.all([
      projetar('OTIMISTA'),
      projetar('BASE'),
      projetar('PESSIMISTA'),
    ]);

    // Perfil apurado à mão da amostra semeada: média 6 exacta; desvio AMOSTRAL
    // √(320/19) — o populacional seria 4,0 exacto e falharia aqui (dias, não
    // dinheiro: a comparação de Decimal fica para os saldos).
    expect(base.perfilAtraso.amostra).toBe(20);
    expect(base.perfilAtraso.amostraInsuficiente).toBe(false);
    expect(base.perfilAtraso.atrasoMedioDias).toBe(MEDIA_ESPERADA);
    expect(Math.abs(base.perfilAtraso.desvioPadraoDias - DESVIO_AMOSTRAL_ESPERADO)).toBeLessThan(1e-9);
    expect(base.cenarioAplicado).toBe('BASE');

    // Saldo de abertura igual nos três cenários e igual ao apurado à mão.
    for (const res of [otimista, base, pessimista]) {
      expect(res.saldoAbertura.equals(D(SALDO_121))).toBe(true);
      expect(res.buckets).toHaveLength(HORIZONTE + 1);
    }

    const s0 = serialCivilMaputo(base.dataReferencia);
    const fatA = await db.fatura.findFirst({ where: { id: faturaAId }, select: { dataVencimento: true } });
    const fatB = await db.fatura.findFirst({ where: { id: faturaBId }, select: { dataVencimento: true } });
    const idxA = serialCivilMaputo(fatA!.dataVencimento) - s0; // 2, salvo virada de dia
    const idxB = serialCivilMaputo(fatB!.dataVencimento) - s0; // 10

    // Aterragens exactas por cenário — é isto que mata a troca média↔desvio:
    // com o perfil trocado, o BASE aterraria em idxA+round(4,104)=idxA+4.
    expect(bucketsCom(otimista, faturaAId)).toEqual([idxA]);
    expect(bucketsCom(otimista, faturaBId)).toEqual([idxB]);
    expect(bucketsCom(base, faturaAId)).toEqual([idxA + DESLOC_BASE]);
    expect(bucketsCom(base, faturaBId)).toEqual([idxB + DESLOC_BASE]);
    expect(bucketsCom(pessimista, faturaAId)).toEqual([idxA + DESLOC_PESSIMISTA]);
    expect(bucketsCom(pessimista, faturaBId)).toEqual([idxB + DESLOC_PESSIMISTA]);

    // O dia d da desigualdade ESTRITA: um dia depois de B aterrar no OTIMISTA.
    //   OTIMISTA já recebeu A e B; BASE só A; PESSIMISTA nenhuma.
    const d = idxB + 1;
    const sOtm = otimista.buckets[d]!.saldoFinal;
    const sBase = base.buckets[d]!.saldoFinal;
    const sPes = pessimista.buckets[d]!.saldoFinal;

    expect(sPes.lessThan(sBase), `PESSIMISTA(${d})=${sPes} devia ser < BASE(${d})=${sBase}`).toBe(true);
    expect(sBase.lessThan(sOtm), `BASE(${d})=${sBase} devia ser < OTIMISTA(${d})=${sOtm}`).toBe(true);

    // …e as diferenças são EXACTAS, ao cêntimo, iguais às facturas que faltam.
    expect(sBase.minus(sPes).equals(D(VALOR_A))).toBe(true);
    expect(sOtm.minus(sBase).equals(D(VALOR_B))).toBe(true);

    // As SAÍDAS nunca se deslocam nem se excluem por cenário (§6/§8): o
    // primeiro bucket (payroll vencido) é igual nos três.
    expect(otimista.buckets[0]!.saidas.equals(base.buckets[0]!.saidas)).toBe(true);
    expect(base.buckets[0]!.saidas.equals(pessimista.buckets[0]!.saidas)).toBe(true);
    expect(base.buckets[0]!.saidas.isZero()).toBe(false);

    // Registo para o handoff: o d concreto e os três saldos.
    const { ano, mes, dia } = civilDoSerial(s0 + d);
    console.info(
      `[oraculo-22] d = ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano} ` +
        `(bucket ${d}): PESSIMISTA=${sPes.toString()} < BASE=${sBase.toString()} < OTIMISTA=${sOtm.toString()}`,
    );
  });

  // -------------------------------------------------------------------------
  // 4.9 — ADR-0036 §12: último dia ÚTIL, num mês a acabar a sábado e noutro a
  // acabar a domingo
  // -------------------------------------------------------------------------

  it('Payroll PROCESSADO sem dataPagamento cai no último dia ÚTIL do mês — sexta-feira, nos dois meses', async () => {
    const rows = await db.payroll.findMany({
      where: { tenantId: ctx.tenantId, status: 'PROCESSADO' },
      select: { id: true, mesReferencia: true, anoReferencia: true, dataPagamento: true, custoTotalEntidade: true },
    });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      // Anti-vacuidade: é mesmo o fallback do §12 que está em jogo.
      expect(r.dataPagamento).toBeNull();
      expect(r.custoTotalEntidade.greaterThan(0)).toBe(true);
    }

    const res = await projetar('OTIMISTA');
    const ocorrencias = res.buckets.flatMap((b: Bucket) => b.ocorrencias).filter((o) => o.origem === 'PAYROLL');
    expect(ocorrencias).toHaveLength(2);

    let totalPayroll = D(0);
    for (const alvo of mesesPayroll) {
      const row = rows.find((r) => r.anoReferencia === alvo.ano && r.mesReferencia === alvo.mes);
      expect(row, `falta o Payroll de ${alvo.mes}/${alvo.ano} (${alvo.acabaA})`).toBeDefined();

      const esperado = ultimoDiaUtilSerial(alvo.ano, alvo.mes);
      // Factos apurados à mão para meses a acabar a sábado/domingo:
      // o dia útil é SEXTA-FEIRA e NÃO é o último dia civil do mês.
      expect(diaSemanaDoSerial(esperado)).toBe(5);
      const recuo = alvo.acabaA === 'sabado' ? 1 : 2;
      expect(civilDoSerial(esperado).dia).toBe(ultimoDiaDoMes(alvo.ano, alvo.mes) - recuo);

      const o = ocorrencias.find((oc) => oc.origemId === row!.id);
      expect(o, `ocorrência PAYROLL de ${alvo.mes}/${alvo.ano} ausente da projecção`).toBeDefined();
      expect(o!.tipo).toBe('SAIDA');
      expect(o!.vencida).toBe(true); // mês passado ⇒ assinalada, nunca omitida (R2.4)
      expect(serialCivilMaputo(o!.data)).toBe(esperado);
      expect(o!.valor.equals(row!.custoTotalEntidade)).toBe(true);
      totalPayroll = totalPayroll.plus(row!.custoTotalEntidade);
    }

    // Vencidas ⇒ primeiro bucket, e são as ÚNICAS saídas deste tenant.
    expect(res.buckets[0]!.saidas.equals(totalPayroll)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Caso que TEM de lançar — R4.1: horizonte acima do tecto da granularidade
  // recusa, nunca trunca em silêncio
  // -------------------------------------------------------------------------

  it('horizonte 365 com granularidade DIARIA lança na validação (R4.1)', () => {
    expect(() =>
      FiltroProjecaoSchema.parse({ horizonteDias: 365, granularidade: 'DIARIA', cenario: 'BASE' }),
    ).toThrow();
  });

  // -------------------------------------------------------------------------
  // CompromissoTesouraria MENSAL — À ESPERA DO L5 (ver nota no cabeçalho):
  // salta com ruído enquanto `criarCompromisso` não existir no serviço.
  // -------------------------------------------------------------------------

  it('compromisso MENSAL a atravessar o horizonte produz uma ocorrência por mês civil (§9)', async (t) => {
    const criarCompromisso = (proj as unknown as Record<string, unknown>).criarCompromisso;
    if (typeof criarCompromisso !== 'function') {
      t.skip(); // L5 ainda não entregue — registado no handoff; NÃO se contorna com INSERT
      return;
    }

    const compromisso = (await runCtx(ctx, () =>
      (criarCompromisso as (i: unknown, c: typeof ctx) => Promise<{ id: string }>)(
        CriarCompromissoSchema.parse({
          descricao: 'Renda mensal do oráculo',
          tipo: 'SAIDA',
          valor: 777.77,
          dataPrevista: dataDoSerial(sHoje + 5),
          recorrencia: 'MENSAL',
        }),
        ctx,
      ),
    )) as { id: string };

    // Horizonte de 60 dias: a recorrência ATRAVESSA-O — a primeira ocorrência
    // é a hoje+5 e há pelo menos mais uma no mês civil seguinte (I5: nunca
    // zero, nunca duplicada; §9: âncora no dia original).
    const res = await projetar('OTIMISTA', 60);
    const ocorrencias = res.buckets.flatMap((b: Bucket) => b.ocorrencias).filter((o) => o.origemId === compromisso.id);
    expect(ocorrencias.length).toBeGreaterThanOrEqual(2);
    for (const o of ocorrencias) {
      expect(o.valor.equals(D('777.77'))).toBe(true);
      expect(o.tipo).toBe('SAIDA');
    }
    const dias = ocorrencias.map((o) => serialCivilMaputo(o.data)).sort((a, b) => a - b);
    expect(dias[0]).toBe(sHoje + 5);
    // Uma ocorrência por mês civil, sem duplicados (ano-mês distintos).
    const meses = dias.map((s) => {
      const { ano, mes } = civilDoSerial(s);
      return `${ano}-${mes}`;
    });
    expect(new Set(meses).size).toBe(dias.length);
  });
});
