import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { Prisma } from '@prisma/client';
import type { Ocorrencia, PerfilAtraso } from '../projecao.interface';
// ---------------------------------------------------------------------------
// ORÁCULO do nó L3 (P3, verificador-fluxo-caixa) — spec 22 · ADR-0036.
//
// `saldoTesourariaAte`, `perfilAtraso`, `marcarVencidas` e
// `calcularPerfilAtraso` AINDA NÃO EXISTEM. O import é deliberado: enquanto o
// L3 não os entregar, cada teste rebenta com «is not a function» — e essa é a
// prova vermelha de que o oráculo foi escrito antes da solução. Qualquer
// alteração a este ficheiro por um agente feat-* é BLOCKER (doutrina 00 §2).
//
// Nota de contrato (para o handoff): `marcarVencidas` e `calcularPerfilAtraso`
// não constam do L1 (`projecao.interface.ts`). São a superfície mínima que
// torna testáveis, sem base de dados, a re-marcação R2.4 (task 3.3-bis) e o
// truncamento por observação (ADR-0036 §10, design §4.1-bis). Assinaturas
// propostas:
//   marcarVencidas(ocorrencias: Ocorrencia[], dataReferencia: Date): Ocorrencia[]
//   calcularPerfilAtraso(atrasosBrutosDias: number[]): PerfilAtraso
//     — recebe os atrasos CRUS em dias (dataPagamento − dataVencimento,
//       possivelmente negativos); o truncamento em zero acontece LÁ DENTRO,
//       observação a observação, senão a regra do §10 não é falsificável.
// ---------------------------------------------------------------------------
import {
  expandirRecorrencia, // L2, já existe — produz as ocorrências cruas
  saldoTesourariaAte, // L3 — não existe ainda
  perfilAtraso, // L3 — não existe ainda
  marcarVencidas, // L3 — não existe ainda (proposta de contrato, ver acima)
  calcularPerfilAtraso, // L3 — não existe ainda (proposta de contrato, ver acima)
} from '../projecao.service';
import {
  diaCivilEmMaputo,
  gerarBalancete,
} from '../contabilidade.service';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';

const hasDB = Boolean(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Helpers de data — convenção da casa: NUNCA `new Date('aaaa-mm-dd')` (lê como
// UTC e, a leste de Greenwich, cai no dia anterior). Meio-dia local garante o
// mesmo dia civil em Africa/Maputo para qualquer fuso de runner razoável.
// ---------------------------------------------------------------------------

function dia(ano: number, mes: number, diaDoMes: number): Date {
  return new Date(ano, mes - 1, diaDoMes, 12);
}

/**
 * Fim do dia civil de HOJE em Africa/Maputo (UTC+2, sem DST), como instante
 * UTC: 23:59:59.999 em Maputo == 21:59:59.999 UTC. Usar o MESMO instante nos
 * dois lados da igualdade elimina qualquer ambiguidade de fronteira entre
 * «lte instante» e «inclusive do dia civil».
 */
function fimDoDiaCivilDeHojeEmMaputo(): Date {
  const hoje = diaCivilEmMaputo(new Date());
  return new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia, 21, 59, 59, 999));
}

const D = (v: string | number) => new Prisma.Decimal(v);

// ---------------------------------------------------------------------------
// I1 — horizonte zero: saldo de abertura == balancete (tenant demo)
//
// O lado direito NÃO chama `saldoTesourariaAte` nem `saldoContabilAte`: deriva
// o saldo esperado pelo BALANCETE (`gerarBalancete`, caminho da contabilidade,
// já trancado por `balancete.test.ts`) mais as sessões de caixa ABERTAS pela
// fórmula do ADR-0036 (§Decisão-2): fundoInicial + totalEntradas − totalSaidas.
// Se os dois lados fossem a mesma função, o teste provaria que ela é igual a
// si própria — e não provaria nada.
// ---------------------------------------------------------------------------

describe.skipIf(!hasDB)(
  'I1 — horizonte zero: saldoTesourariaAte == balancete + sessões ABERTAS (tenant demo)',
  () => {
    let ctx: { tenantId: string; userId: string };
    const contasBancariasCriadas: string[] = [];

    /**
     * Valor-veneno em `ContaBancaria.saldoAtual`: a coluna não tem escritor em
     * produção (ADR-0036 §Decisão-2) e é PROIBIDO lê-la. Se a implementação a
     * ler — na conta activa ou na inactiva — o saldo vem contaminado por
     * 999 999 999,99 e a igualdade com o balancete rebenta ao cêntimo.
     */
    const SALDO_ATUAL_VENENO = '999999999.99';
    const MARCA = `oraculo-l3-${Date.now()}`;

    beforeAll(async () => {
      const tenant = await prismaBase.tenant.findFirst({
        where: { slug: 'demo' },
      });
      if (!tenant) {
        throw new Error('Tenant demo não encontrado. Executa pnpm db:seed primeiro.');
      }
      const admin = await prismaBase.user.findFirst({
        where: { tenantId: tenant.id, email: 'admin@demo.mz' },
      });
      if (!admin) {
        throw new Error('Utilizador admin@demo.mz não encontrado no tenant demo.');
      }
      ctx = { tenantId: tenant.id, userId: admin.id };

      // O seed demo não cria contas bancárias — sem isto o I1 seria vácuo do
      // lado do razão. Ancoramos DUAS contas bancárias ACTIVAS na conta PGC
      // `121 Depósitos à ordem`, que tem movimento real semeado (recebimentos
      // de facturas), e uma INACTIVA na mesma conta (task 3.4-ter):
      //  - se a implementação somar por conta BANCÁRIA em vez de por conta
      //    PGC distinta (ADR-0036 §2-bis), conta o razão do 121 a dobrar;
      //  - se ignorar `ativo`, conta-o a triplicar.
      const conta121 = await prismaBase.contaPGC.findFirst({
        where: { tenantId: tenant.id, codigo: '121' },
      });
      if (!conta121) {
        throw new Error('Conta PGC 121 (Depósitos à ordem) não encontrada no tenant demo.');
      }

      const ativa = await prismaBase.contaBancaria.create({
        data: {
          tenantId: tenant.id,
          banco: 'BANCO ORACULO L3',
          agencia: '001',
          numeroConta: `${MARCA}-ativa`,
          tipoConta: 'CORRENTE',
          contaContabilId: conta121.id,
          ativo: true,
          saldoAtual: SALDO_ATUAL_VENENO,
        },
      });
      const ativa2 = await prismaBase.contaBancaria.create({
        data: {
          tenantId: tenant.id,
          banco: 'BANCO ORACULO L3',
          agencia: '001',
          numeroConta: `${MARCA}-ativa2`,
          tipoConta: 'CORRENTE',
          contaContabilId: conta121.id,
          ativo: true,
          saldoAtual: SALDO_ATUAL_VENENO,
        },
      });
      const inativa = await prismaBase.contaBancaria.create({
        data: {
          tenantId: tenant.id,
          banco: 'BANCO ORACULO L3',
          agencia: '001',
          numeroConta: `${MARCA}-inativa`,
          tipoConta: 'CORRENTE',
          contaContabilId: conta121.id,
          ativo: false,
          saldoAtual: SALDO_ATUAL_VENENO,
        },
      });
      contasBancariasCriadas.push(ativa.id, ativa2.id, inativa.id);
    });

    afterAll(async () => {
      if (contasBancariasCriadas.length > 0) {
        await prismaBase.contaBancaria.deleteMany({
          where: { id: { in: contasBancariasCriadas } },
        });
      }
      await prismaBase.$disconnect();
    });

    it('iguala ao cêntimo o saldo derivado do balancete e das sessões ABERTAS', async () => {
      const dataReferencia = fimDoDiaCivilDeHojeEmMaputo();

      // ------------------- lado direito: derivação independente -------------------
      const esperado = await runWithTenantContext(ctx, async () => {
        const contasAtivas = await prismaBase.contaBancaria.findMany({
          where: { tenantId: ctx.tenantId, ativo: true },
          select: { contaContabilId: true },
        });
        // Anti-vacuidade da 3.4-ter: há PELO MENOS duas activas ancoradas na
        // MESMA conta PGC — é o estado que falsifica a soma por conta bancária.
        expect(contasAtivas.length).toBeGreaterThanOrEqual(2);
        const contasPGCDistintas = [...new Set(contasAtivas.map((cb) => cb.contaContabilId))];
        expect(contasPGCDistintas.length).toBeLessThan(contasAtivas.length);

        const balancete = await gerarBalancete(
          {
            dataInicio: new Date(Date.UTC(1970, 0, 1)),
            dataFim: dataReferencia,
            incluirZeradas: true,
          },
          ctx,
        );
        const saldoPorConta = new Map(
          balancete.contas.map((l) => [l.conta.id, l.saldoAtual]),
        );

        // Σ por conta PGC DISTINTA (ADR-0036 §2-bis, que revogou a leitura
        // por conta bancária de uma versão anterior do §Decisão-2): uma conta
        // PGC entra se ≥ 1 bancária ancorada nela estiver activa, e entra UMA
        // vez, pelo saldo inteiro — o saldo de uma conta partilhada não se
        // reparte nem se multiplica por conta bancária.
        let total = contasPGCDistintas.reduce(
          (acc, contaId) => acc.plus(saldoPorConta.get(contaId) ?? D(0)),
          D(0),
        );

        const sessoesAbertas = await prismaBase.sessaoCaixa.findMany({
          where: { tenantId: ctx.tenantId, status: 'ABERTA' },
          select: { fundoInicial: true, totalEntradas: true, totalSaidas: true },
        });
        for (const s of sessoesAbertas) {
          total = total
            .plus(s.fundoInicial)
            .plus(s.totalEntradas)
            .minus(s.totalSaidas);
        }
        return total;
      });

      // Anti-vacuidade: com o movimento semeado do 121 (milhões de MT em
      // recebimentos) o esperado nunca é zero. Se for, o setup degradou e o
      // teste deixou de provar alguma coisa — falha aqui, não em silêncio.
      expect(esperado.isZero()).toBe(false);

      // Se a implementação ler `ContaBancaria.saldoAtual` (proibido), o veneno
      // de 999 999 999,99 por conta afasta os dois lados em centenas de
      // milhões — a igualdade abaixo é também o detector desse defeito.
      // ------------------------- lado esquerdo: o julgado -------------------------
      const saldo = await runWithTenantContext(ctx, () =>
        saldoTesourariaAte(dataReferencia, ctx),
      );

      expect(
        saldo.equals(esperado),
        `saldoTesourariaAte devolveu ${saldo.toString()} e o balancete + sessões ABERTAS dá ${esperado.toString()} — a projecção e a contabilidade não podem discordar sobre hoje (I1).`,
      ).toBe(true);
    });

    it('perfilAtraso: amostra coere com a contagem independente de facturas PAGA ≤ 180 dias', async () => {
      // Task 4.8: UM relógio por projecção — a data de referência passa-se
      // SEMPRE explicitamente. Este era o único chamador de `perfilAtraso(ctx)`
      // sem data; com esta chamada actualizada, o valor por omissão
      // (`new Date()`) em `perfilAtraso` deixou de ter quem o justifique e
      // pode cair — remover o default é alteração de produção (interface +
      // serviço) e pertence ao nó seguinte, não ao oráculo.
      const agora = new Date();
      const limite = new Date(agora.getTime() - 180 * 24 * 60 * 60 * 1000);
      const contagem = await prismaBase.fatura.count({
        where: {
          tenantId: ctx.tenantId,
          status: 'PAGA',
          dataPagamento: { gte: limite, lte: agora },
        },
      });

      const perfil = await runWithTenantContext(ctx, () => perfilAtraso(ctx, agora));

      expect(perfil.amostra).toBe(contagem);
      expect(perfil.amostraInsuficiente).toBe(contagem < 20);
      // §10: com truncamento por observação, média e desvio nunca são
      // negativos nem NaN — venham os dados que vierem.
      expect(Number.isFinite(perfil.atrasoMedioDias)).toBe(true);
      expect(Number.isFinite(perfil.desvioPadraoDias)).toBe(true);
      expect(perfil.atrasoMedioDias).toBeGreaterThanOrEqual(0);
      expect(perfil.desvioPadraoDias).toBeGreaterThanOrEqual(0);
    });
  },
);

// ---------------------------------------------------------------------------
// R2.4 (task 3.3-bis) — bandeira `vencida` é re-marcada pelo L3
//
// `expandirRecorrencia` devolve SEMPRE `vencida: false` — a assinatura pura
// não recebe data de referência. Se o L3 se esquecer da re-marcação, nada
// parte: a ocorrência cai no primeiro bucket na mesma (findIndex) e só a
// degradação de cenário e a exclusão PESSIMISTA ficam inoperantes, com números
// plausíveis. Este teste existe para esse silêncio ter um alarme.
// ---------------------------------------------------------------------------

describe('R2.4 — marcarVencidas: ocorrência anterior à referência sai vencida', () => {
  const compromissoMensal = {
    id: 'cmp-oraculo-l3-mensal',
    descricao: 'Renda mensal (oráculo L3)',
    tipo: 'ENTRADA' as const,
    valor: D('1500.00'),
    dataPrevista: dia(2026, 1, 15),
    recorrencia: 'MENSAL' as const,
    dataFimRecorrencia: null,
  };

  it('marca vencida: true nas anteriores e mantém false nas restantes', () => {
    // 15 Jan · 15 Fev · 15 Mar · 15 Abr · 15 Mai — todas false à saída do L2.
    const cruas = expandirRecorrencia(compromissoMensal, dia(2026, 5, 15));
    expect(cruas).toHaveLength(5);
    expect(cruas.every((o) => o.vencida === false)).toBe(true);

    const marcadas = marcarVencidas(cruas, dia(2026, 3, 10));

    const porData = (o: Ocorrencia) =>
      `${o.data.getFullYear()}-${o.data.getMonth() + 1}-${o.data.getDate()}`;
    const vencidas = marcadas.filter((o) => o.vencida).map(porData).sort();
    const futuras = marcadas.filter((o) => !o.vencida).map(porData).sort();

    expect(vencidas).toEqual(['2026-1-15', '2026-2-15']);
    expect(futuras).toEqual(['2026-3-15', '2026-4-15', '2026-5-15']);

    // A re-marcação não toca em mais nada: valores ao cêntimo, por Decimal.
    for (const o of marcadas) {
      expect(o.valor.equals(compromissoMensal.valor)).toBe(true);
      expect(o.origemId).toBe(compromissoMensal.id);
    }
  });

  it('fronteira: o próprio dia da referência NÃO é vencido (anterior é estrito)', () => {
    const cruas = expandirRecorrencia(compromissoMensal, dia(2026, 3, 15));
    const marcadas = marcarVencidas(cruas, dia(2026, 3, 15));

    const de = (mes: number) =>
      marcadas.find((o) => o.data.getMonth() + 1 === mes);
    expect(de(1)?.vencida).toBe(true); // 15 Jan — anterior
    expect(de(2)?.vencida).toBe(true); // 15 Fev — anterior
    expect(de(3)?.vencida).toBe(false); // 15 Mar — o próprio dia: por liquidar hoje, não em atraso

    // …e no dia seguinte passa a vencida.
    const noDiaSeguinte = marcarVencidas(cruas, dia(2026, 3, 16));
    expect(
      noDiaSeguinte.find((o) => o.data.getMonth() + 1 === 3)?.vencida,
    ).toBe(true);
  });

  it('marca SAÍDAS vencidas também — a bandeira depende da data, não do tipo', () => {
    const saidaUnica = {
      ...compromissoMensal,
      id: 'cmp-oraculo-l3-saida',
      tipo: 'SAIDA' as const,
      recorrencia: 'UNICA' as const,
      dataPrevista: dia(2026, 2, 28),
    };
    const cruas = expandirRecorrencia(saidaUnica, dia(2026, 6, 30));
    expect(cruas).toHaveLength(1);

    const marcadas = marcarVencidas(cruas, dia(2026, 4, 1));
    expect(marcadas[0]!.vencida).toBe(true);
    expect(marcadas[0]!.tipo).toBe('SAIDA');
  });

  it('é pura: não muta as ocorrências de entrada', () => {
    const cruas = expandirRecorrencia(compromissoMensal, dia(2026, 5, 15));
    marcarVencidas(cruas, dia(2026, 12, 31));
    // Todas seriam vencidas na saída — mas as de ENTRADA ficam como estavam.
    expect(cruas.every((o) => o.vencida === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADR-0036 §10 / design §4.1-bis — truncamento do atraso em zero é POR
// OBSERVAÇÃO: atraso = max(0, dataPagamento − dataVencimento) em CADA factura
// da amostra, ANTES de calcular média e desvio. Não se trunca só a média.
//
// As duas implementações dão médias iguais em muitos casos; o DESVIO é o que
// as distingue sempre que há um pagamento adiantado — por isso este oráculo
// assere o desvio, não só a média.
// ---------------------------------------------------------------------------

describe('ADR-0036 §10 — calcularPerfilAtraso trunca por observação, não só a média', () => {
  it('amostra só de adiantados/pontuais: média 0 E desvio 0 — o desvio é o discriminador', () => {
    // 4 pagamentos adiantados de 6 dias + 16 pontuais (20 observações).
    //   Por observação:  atrasos = [0×20]        → média 0, desvio 0.
    //   Só a média:      max(0, média([-6×4, 0×16])) = max(0, −1,2) = 0 — a
    //                    MÉDIA SAI IGUAL — mas σ dos crus é 2,4 (populacional)
    //                    ou ≈2,46 (amostral), nunca 0.
    // Um teste que só assira a média passa nas duas implementações e não
    // guarda a regra; a asserção do desvio é a que a falsifica.
    const atrasosBrutos = [-6, -6, -6, -6, ...Array<number>(16).fill(0)];

    const perfil: PerfilAtraso = calcularPerfilAtraso(atrasosBrutos);

    expect(perfil.amostra).toBe(20);
    expect(perfil.amostraInsuficiente).toBe(false);
    expect(perfil.atrasoMedioDias).toBe(0);
    expect(perfil.desvioPadraoDias).toBe(0); // ← distingue as duas implementações
  });

  it('amostra mista: a média é a dos atrasos truncados, não a truncagem da média', () => {
    // Crus: [−10, 2, 2, 6, 0×16] — soma crua 0, logo «só a média» daria
    // max(0, 0) = 0. Por observação: [0, 2, 2, 6, 0×16] → média 10/20 = 0,5
    // (exacto em binário). O desvio existe (> 0) porque a amostra truncada
    // não é constante.
    const atrasosBrutos = [-10, 2, 2, 6, ...Array<number>(16).fill(0)];

    const perfil = calcularPerfilAtraso(atrasosBrutos);

    expect(perfil.amostra).toBe(20);
    expect(perfil.atrasoMedioDias).toBe(0.5);
    expect(perfil.desvioPadraoDias).toBeGreaterThan(0);
  });

  it('menos de 20 observações ⇒ amostraInsuficiente: true (R5.3)', () => {
    const dezanove = Array<number>(19).fill(3);
    const perfil = calcularPerfilAtraso(dezanove);
    expect(perfil.amostra).toBe(19);
    expect(perfil.amostraInsuficiente).toBe(true);
  });

  it('amostra vazia não envenena a projecção: sem NaN, sem negativos', () => {
    const perfil = calcularPerfilAtraso([]);
    expect(perfil.amostra).toBe(0);
    expect(perfil.amostraInsuficiente).toBe(true);
    expect(Number.isNaN(perfil.atrasoMedioDias)).toBe(false);
    expect(Number.isNaN(perfil.desvioPadraoDias)).toBe(false);
    expect(perfil.atrasoMedioDias).toBeGreaterThanOrEqual(0);
    expect(perfil.desvioPadraoDias).toBeGreaterThanOrEqual(0);
  });
});
