/**
 * Oráculo N3-v (issue #138, ADR-0035) — encerramento provisório do exercício.
 *
 * Contrato (fixado pelo orquestrador; não se reabre aqui):
 *   encerrarExercicio({ exercicioId, estimativaImposto }, ctx)
 *     → { ok: true, encerramento } | { ok: false, impedimentos: string[] }
 *   em `src/server/services/financas/encerramento-exercicio.service.ts`.
 *   - Pré-condições recolhidas TODAS de uma vez, sem escrita nenhuma: PERIODOS_MENSAIS_ABERTOS,
 *     EXERCICIO_ANTERIOR_ABERTO, RASCUNHOS_NO_PERIODO_13, BALANCETE_DESEQUILIBRADO,
 *     SEM_RESULTADOS_A_APURAR.
 *   - Lançados (não impedimentos): exercício não ABERTO → BusinessRuleError TRANSICAO_INVALIDA;
 *     estimativa negativa ou não numérica → BusinessRuleError ESTIMATIVA_IMPOSTO_INVALIDA;
 *     exercício de outro tenant → NotFoundError.
 *   - 82 financeiros = contas começadas por 69 ou 78; 81 operacionais = o resto das folhas 6/7.
 *     Saldos dos lançamentos LANCADO/ESTORNADO pelo `periodoId` dos períodos 1..12.
 *   - Numa transacção: três lançamentos (dois com estimativa 0) no diário EN, LANCADO, período 13,
 *     data = dataFim do exercício; período 13 FECHADO; exercício ENCERRADO_PROVISORIO; um
 *     EncerramentoExercicio versão 1 com a fotografia dos períodos 1..12.
 *   - Mapas por datas (DRE, balancete por datas) excluem o período 13: os lançamentos de
 *     encerramento, datados de 31/12, não põem o resultado do ano a zero.
 *
 * Cenário (exercício 2026, montado pelos serviços reais — nunca Prisma em Lancamento):
 *   Mar D 111 / C 711 1000 · Abr D 622 / C 111 300 · Mai D 6911 / C 121 50 · Jun D 121 / C 7811 20
 *   Operacional 1000 − 300 = 700; financeiro 20 − 50 = −30; corrente 670; imposto 100; líquido 570.
 *
 * Os períodos 1..12 são fechados directamente pelo client cru: `fecharPeriodo` exige o
 * apuramento do IVA de cada mês, alheio ao encerramento — o que está em teste é só o encerramento.
 *
 * Cada caso monta o seu próprio tenant (o encerramento muda o estado do exercício).
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type AnyDb = any;
type Ctx = { tenantId: string; userId: string };

type ResultadoEncerramento =
  | { ok: true; encerramento: Record<string, unknown> & { id: string } }
  | { ok: false; impedimentos: string[] };
type EncerrarExercicio = (
  input: { exercicioId: string; estimativaImposto: string },
  ctx: Ctx,
) => Promise<ResultadoEncerramento>;

/**
 * O módulo ainda não existe no passo vermelho: importado por caminho em variável, para o
 * ficheiro carregar e o `tsc` não o resolver; cada caso falha na asserção de existência.
 */
async function carregarEncerrar(): Promise<EncerrarExercicio> {
  const caminho = '@/server/services/financas/encerramento-exercicio.service';
  let modulo: Record<string, unknown> | undefined;
  let erro = '';
  try {
    modulo = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  } catch (e) {
    // Mostrado na falha: um erro de carregamento do módulo não pode passar por «não existe».
    erro = e instanceof Error ? e.message : String(e);
  }
  expect(
    typeof modulo?.encerrarExercicio,
    `encerramento-exercicio.service exporta encerrarExercicio${erro ? ` (import falhou: ${erro})` : ''}`,
  ).toBe('function');
  return modulo!.encerrarExercicio as EncerrarExercicio;
}

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);

const CODIGOS = ['111', '121', '622', '6911', '711', '7811', '81', '82', '83', '851', '88', '4411'] as const;
type Codigo = (typeof CODIGOS)[number];

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe.skipIf(skip)('Encerramento provisório do exercício (#138, ADR-0035) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let val: typeof import('@/lib/validations/contabilidade');
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const TS = Date.now();
  let seq = 0;

  interface Tenant {
    ctx: Ctx;
    conta: Record<Codigo, string>;
  }

  async function novoTenant(): Promise<Tenant> {
    seq += 1;
    const tenantId = `tenant-enc-${TS}-${seq}`;
    const userId = `user-enc-${TS}-${seq}`;
    const slug = `enc-${TS}-${seq}`;
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${String(TS).slice(-7)}${String(seq).padStart(2, '0')}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `${slug}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${slug}` },
    });
    await db.$transaction((tx: AnyDb) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });

    const contas = await db.contaPGC.findMany({
      where: { tenantId, codigo: { in: [...CODIGOS] } },
      select: { id: true, codigo: true, aceitaLancamento: true },
    });
    const conta = {} as Record<Codigo, string>;
    for (const c of contas) {
      expect(c.aceitaLancamento, `pré-condição: ${c.codigo} aceita lançamento`).toBe(true);
      conta[c.codigo as Codigo] = c.id;
    }
    expect(Object.keys(conta).sort()).toEqual([...CODIGOS].sort());
    return { ctx: { tenantId, userId }, conta };
  }

  let doc = 0;
  async function lancar(ctx: Ctx, data: string, debito: string, credito: string, valor: string) {
    return runCtx(ctx, () =>
      db.$transaction((tx: AnyDb) =>
        contab.registarLancamentoContabilistico(
          tx,
          {
            data: new Date(data),
            diarioTipo: 'OPERACOES',
            origem: 'AJUSTE',
            documentoOrigemId: `doc-enc-${++doc}`,
            documentoOrigemTipo: 'TesteEncerramento',
            historico: `Teste encerramento ${debito}/${credito} ${valor}`,
            partidas: [
              { contaCodigo: debito, tipo: 'DEBITO', valor },
              { contaCodigo: credito, tipo: 'CREDITO', valor },
            ],
          },
          ctx,
        ),
      ),
    );
  }

  /** Os quatro movimentos do cenário, em Março..Junho de 2026. */
  async function lancarCenario(ctx: Ctx) {
    await lancar(ctx, '2026-03-15T10:00:00Z', '111', '711', '1000');
    await lancar(ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(ctx, '2026-05-15T10:00:00Z', '6911', '121', '50');
    await lancar(ctx, '2026-06-15T10:00:00Z', '121', '7811', '20');
  }

  async function exercicio2026(ctx: Ctx) {
    const ex = await db.exercicioContabil.findFirst({ where: { tenantId: ctx.tenantId, codigo: '2026' } });
    expect(ex, 'pré-condição: o exercício 2026 existe').toBeTruthy();
    return ex;
  }

  /**
   * Fecha os períodos mensais pedidos directamente (client cru): `fecharPeriodo` exige o IVA
   * apurado de cada mês, pré-condição alheia ao encerramento.
   */
  async function fecharMeses(ctx: Ctx, exercicioId: string, ordens: number[]) {
    await db.periodoContabil.updateMany({
      where: { tenantId: ctx.tenantId, exercicioId, ordem: { in: ordens } },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: ctx.userId },
    });
  }

  /** Tenant com o cenário lançado e os doze meses fechados. */
  async function cenarioPronto() {
    const t = await novoTenant();
    await lancarCenario(t.ctx);
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);
    return { ...t, ex };
  }

  /** Saldo D − C por conta, sobre os lançamentos LANCADO/ESTORNADO dos períodos indicados. */
  async function saldos(ctx: Ctx, exercicioId: string, ordens: number[]): Promise<Map<string, Prisma.Decimal>> {
    const linhas = await db.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: {
        tenantId: ctx.tenantId,
        lancamento: {
          status: { in: ['LANCADO', 'ESTORNADO'] },
          periodo: { exercicioId, ordem: { in: ordens } },
        },
      },
      _sum: { valor: true },
    });
    const m = new Map<string, Prisma.Decimal>();
    for (const l of linhas) {
      const v = dec(l._sum.valor);
      m.set(l.contaId, (m.get(l.contaId) ?? dec(0)).plus(l.tipo === 'DEBITO' ? v : v.negated()));
    }
    return m;
  }

  /** D − C por conta dentro de um lançamento; verifica também Σ D = Σ C. */
  async function netoDoLancamento(ctx: Ctx, lancamentoId: string) {
    const partidas = await db.partidaLancamento.findMany({
      where: { tenantId: ctx.tenantId, lancamentoId },
      select: { contaId: true, tipo: true, valor: true },
    });
    let d = dec(0);
    let c = dec(0);
    const m = new Map<string, Prisma.Decimal>();
    for (const p of partidas) {
      const v = dec(p.valor);
      if (p.tipo === 'DEBITO') d = d.plus(v);
      else c = c.plus(v);
      m.set(p.contaId, (m.get(p.contaId) ?? dec(0)).plus(p.tipo === 'DEBITO' ? v : v.negated()));
    }
    expect(f2(d), `lançamento ${lancamentoId}: Σ débitos = Σ créditos`).toBe(f2(c));
    return m;
  }

  async function lancamentosEN(ctx: Ctx) {
    return db.lancamento.findMany({
      where: { tenantId: ctx.tenantId, diario: { tipo: 'ENCERRAMENTO' } },
      include: { diario: true, periodo: true },
    });
  }

  async function semEscritas(ctx: Ctx, exercicioId: string) {
    expect(await db.lancamento.count({ where: { tenantId: ctx.tenantId, diario: { tipo: 'ENCERRAMENTO' } } })).toBe(0);
    expect(await db.encerramentoExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(0);
    const ex = await db.exercicioContabil.findFirst({ where: { id: exercicioId, tenantId: ctx.tenantId } });
    expect(ex.estado).toBe('ABERTO');
    const p13 = await db.periodoContabil.findFirst({ where: { tenantId: ctx.tenantId, exercicioId, ordem: 13 } });
    expect(p13.estado).toBe('ABERTO');
  }

  function dre(ctx: Ctx) {
    const filtro = val.FiltroDRESchema.parse({ dataInicio: '2026-01-01', dataFim: '2026-12-31' });
    return runCtx(ctx, () => contab.gerarDRE(filtro, ctx));
  }

  function balancetePorDatas(ctx: Ctx) {
    const filtro = val.FiltroBalanceteSchema.parse({ dataInicio: '2026-01-01', dataFim: '2026-12-31' });
    return runCtx(ctx, () => contab.gerarBalancete(filtro, ctx));
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    val = await import('@/lib/validations/contabilidade');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
  });

  // -------------------------------------------------------------------------
  // 1. Caminho feliz
  // -------------------------------------------------------------------------

  it('encerra com estimativa 100: três lançamentos EN no período 13, 88 = 570 credor, estados e fotografia', async () => {
    const { ctx, conta, ex } = await cenarioPronto();
    const encerrar = await carregarEncerrar();

    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // EncerramentoExercicio
    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: ctx.tenantId, exercicioId: ex.id } });
    expect(enc).toBeTruthy();
    expect(r.encerramento.id).toBe(enc.id);
    expect(enc.versao).toBe(1);
    expect(f2(enc.estimativaImposto)).toBe('100.00');
    expect(enc.encerradoPorId).toBe(ctx.userId);
    expect(enc.anuladoEm).toBeNull();
    expect(enc.lancamentoImpostoId).not.toBeNull();
    expect(f2(enc.totalDebito)).toBe(f2(enc.totalCredito));

    // Estados
    const exDepois = await db.exercicioContabil.findFirst({ where: { id: ex.id, tenantId: ctx.tenantId } });
    expect(exDepois.estado).toBe('ENCERRADO_PROVISORIO');
    const p13 = await db.periodoContabil.findFirst({ where: { tenantId: ctx.tenantId, exercicioId: ex.id, ordem: 13 } });
    expect(p13.estado).toBe('FECHADO');

    // Os três lançamentos: diário EN, LANCADO, período 13, data = dataFim do exercício
    const en = await lancamentosEN(ctx);
    expect(en).toHaveLength(3);
    expect(en.map((l: AnyDb) => l.id).sort()).toEqual(
      [enc.lancamentoResultadosId, enc.lancamentoImpostoId, enc.lancamentoLiquidoId].sort(),
    );
    for (const l of en) {
      expect(l.diario.codigo).toBe('EN');
      expect(l.status).toBe('LANCADO');
      expect(l.periodoId).toBe(p13.id);
      expect(l.data.getTime()).toBe(ex.dataFim.getTime());
    }

    // Lançamento 1 — resultados: saldar 6/7 contra 81/82, transferir para 83
    const l1 = await netoDoLancamento(ctx, enc.lancamentoResultadosId);
    expect(f2(l1.get(conta['711']))).toBe('1000.00');
    expect(f2(l1.get(conta['7811']))).toBe('20.00');
    expect(f2(l1.get(conta['622']))).toBe('-300.00');
    expect(f2(l1.get(conta['6911']))).toBe('-50.00');
    expect(f2(l1.get(conta['81']))).toBe('0.00');
    expect(f2(l1.get(conta['82']))).toBe('0.00');
    expect(f2(l1.get(conta['83']))).toBe('-670.00');

    // Lançamento 2 — imposto: D 851 / C 4411
    const l2 = await netoDoLancamento(ctx, enc.lancamentoImpostoId);
    expect(f2(l2.get(conta['851']))).toBe('100.00');
    expect(f2(l2.get(conta['4411']))).toBe('-100.00');

    // Lançamento 3 — resultado líquido: 83 e 851 saldam contra 88
    const l3 = await netoDoLancamento(ctx, enc.lancamentoLiquidoId);
    expect(f2(l3.get(conta['83']))).toBe('670.00');
    expect(f2(l3.get(conta['851']))).toBe('-100.00');
    expect(f2(l3.get(conta['88']))).toBe('-570.00');

    // Saldos finais sobre os períodos 1..13
    const todos = await saldos(ctx, ex.id, [...MESES, 13]);
    const folhas67 = await db.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, aceitaLancamento: true, classe: { in: ['CLASSE_6', 'CLASSE_7'] } },
      select: { id: true, codigo: true },
    });
    for (const c of folhas67) {
      expect(f2(todos.get(c.id)), `classe 6/7 ${c.codigo} salda a zero`).toBe('0.00');
    }
    for (const codigo of ['81', '82', '83', '851'] as const) {
      expect(f2(todos.get(conta[codigo])), `${codigo} salda a zero`).toBe('0.00');
    }
    expect(f2(todos.get(conta['88'])), '88 = 570 credor').toBe('-570.00');
    expect(f2(todos.get(conta['4411'])), '4411 = 100 credor').toBe('-100.00');

    // Fotografia dos períodos 1..12
    expect(Array.isArray(enc.fotografia)).toBe(true);
    const f711 = (enc.fotografia as AnyDb[]).find((x) => x.codigo === '711');
    expect(f711).toBeTruthy();
    expect(f711.contaId).toBe(conta['711']);
    expect(f711.nome).toBe('Mercadorias');
    expect(typeof f711.saldoCredor).toBe('string');
    expect(f2(f711.totalDebito)).toBe('0.00');
    expect(f2(f711.totalCredito)).toBe('1000.00');
    expect(f2(f711.saldoDevedor)).toBe('0.00');
    expect(f2(f711.saldoCredor)).toBe('1000.00');
    // A fotografia é do ano antes do encerramento: nenhuma conta de resultados da classe 8.
    expect((enc.fotografia as AnyDb[]).find((x) => x.codigo === '88')).toBeUndefined();
  }, 120_000);

  // -------------------------------------------------------------------------
  // 2. Estimativa zero
  // -------------------------------------------------------------------------

  it('com estimativa 0 cria só dois lançamentos, lancamentoImpostoId nulo e 88 = 670 credor', async () => {
    const { ctx, conta, ex } = await cenarioPronto();
    const encerrar = await carregarEncerrar();

    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '0' }, ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: ctx.tenantId, exercicioId: ex.id } });
    expect(f2(enc.estimativaImposto)).toBe('0.00');
    expect(enc.lancamentoImpostoId).toBeNull();
    expect(await lancamentosEN(ctx)).toHaveLength(2);

    const todos = await saldos(ctx, ex.id, [...MESES, 13]);
    expect(f2(todos.get(conta['88']))).toBe('-670.00');
    expect(f2(todos.get(conta['83']))).toBe('0.00');
    expect(f2(todos.get(conta['4411']))).toBe('0.00');
  }, 120_000);

  // -------------------------------------------------------------------------
  // 3. Pré-condições recolhidas todas de uma vez
  // -------------------------------------------------------------------------

  it('com Julho aberto e o exercício anterior aberto devolve os dois impedimentos e não escreve nada', async () => {
    const t = await novoTenant();
    // Exercício 2025 aberto, criado antes do 2026 para que este o encadeie (`anteriorId`).
    await lancar(t.ctx, '2025-06-15T10:00:00Z', '111', '121', '10');
    await lancarCenario(t.ctx);
    const ex = await exercicio2026(t.ctx);
    const ex25 = await db.exercicioContabil.findFirst({ where: { tenantId: t.ctx.tenantId, codigo: '2025' } });
    expect(ex.anteriorId, 'pré-condição: 2026 encadeia em 2025').toBe(ex25.id);
    expect(ex25.estado).toBe('ABERTO');
    await fecharMeses(t.ctx, ex.id, MESES.filter((m) => m !== 7));

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, t.ctx);

    expect(r.ok).toBe(false);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual(
      expect.arrayContaining(['PERIODOS_MENSAIS_ABERTOS', 'EXERCICIO_ANTERIOR_ABERTO']),
    );
    await semEscritas(t.ctx, ex.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 4. Sem resultados a apurar
  // -------------------------------------------------------------------------

  it('sem movimento nas classes 6 e 7 devolve SEM_RESULTADOS_A_APURAR', async () => {
    const t = await novoTenant();
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '121', '250');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '0' }, t.ctx);

    expect(r.ok).toBe(false);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual(['SEM_RESULTADOS_A_APURAR']);
    await semEscritas(t.ctx, ex.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 5. Segundo encerramento
  // -------------------------------------------------------------------------

  it('uma segunda chamada depois do sucesso lança TRANSICAO_INVALIDA e não lança nada de novo', async () => {
    const { ctx, ex } = await cenarioPronto();
    const encerrar = await carregarEncerrar();

    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx);
    expect(r.ok).toBe(true);

    await expect(encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    expect(await lancamentosEN(ctx)).toHaveLength(3);
    expect(await db.encerramentoExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(1);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 6. Estimativa inválida
  // -------------------------------------------------------------------------

  it('recusa estimativa negativa ou não numérica com ESTIMATIVA_IMPOSTO_INVALIDA, sem escrever', async () => {
    const { ctx, ex } = await cenarioPronto();
    const encerrar = await carregarEncerrar();

    for (const estimativaImposto of ['-1', 'abc']) {
      await expect(encerrar({ exercicioId: ex.id, estimativaImposto }, ctx), `estimativa «${estimativaImposto}»`)
        .rejects.toMatchObject({ name: 'BusinessRuleError', code: 'ESTIMATIVA_IMPOSTO_INVALIDA' });
    }
    await semEscritas(ctx, ex.id);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 7. Exercício de outro tenant
  // -------------------------------------------------------------------------

  it('o exercício de outro tenant é NotFoundError e fica intacto', async () => {
    const alheio = await cenarioPronto();
    const outro = await novoTenant();
    const encerrar = await carregarEncerrar();

    await expect(
      encerrar({ exercicioId: alheio.ex.id, estimativaImposto: '100' }, outro.ctx),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    await semEscritas(alheio.ctx, alheio.ex.id);
    expect(await db.encerramentoExercicio.count({ where: { tenantId: outro.ctx.tenantId } })).toBe(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 8. Concorrência
  // -------------------------------------------------------------------------

  it('duas chamadas concorrentes: exatamente uma encerra, a outra lança BusinessRuleError', async () => {
    const { ctx, ex } = await cenarioPronto();
    const encerrar = await carregarEncerrar();

    const resultados = await Promise.allSettled([
      encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx),
      encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx),
    ]);
    const sucessos = resultados.filter((x) => x.status === 'fulfilled' && x.value.ok === true);
    const recusas = resultados.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(sucessos, 'exatamente um encerramento').toHaveLength(1);
    expect(recusas, 'a outra chamada rejeita').toHaveLength(1);
    expect(recusas[0].reason).toMatchObject({ name: 'BusinessRuleError' });

    expect(await db.encerramentoExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(1);
    expect(await lancamentosEN(ctx)).toHaveLength(3);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 9. Mapas por datas excluem o período 13
  // -------------------------------------------------------------------------

  it('a DRE e o balancete por datas de 2026 não mudam com o encerramento (período 13 excluído)', async () => {
    const { ctx, conta, ex } = await cenarioPronto();

    // O intervalo é o do ano inteiro tal como as páginas o pedem: fim no último instante de
    // 31/12 em Maputo. Passa-se o próprio `dataFim` do exercício (o instante do período 13 e a
    // data dos lançamentos de encerramento) — sem a exclusão do período 13, o encerramento
    // entraria no intervalo e punha o resultado do ano a zero.
    const filtroDRE = val.FiltroDRESchema.parse({ dataInicio: ex.dataInicio, dataFim: ex.dataFim });
    const filtroBal = val.FiltroBalanceteSchema.parse({ dataInicio: ex.dataInicio, dataFim: ex.dataFim });
    const FIM_ANO_MAPUTO = new Date('2026-12-31T23:59:59.999+02:00').getTime();
    expect(filtroDRE.dataFim.getTime(), 'pré-condição: a DRE vai até ao fim de 31/12 em Maputo').toBeGreaterThanOrEqual(
      FIM_ANO_MAPUTO,
    );
    expect(filtroBal.dataFim.getTime(), 'pré-condição: o balancete vai até ao fim de 31/12 em Maputo').toBeGreaterThanOrEqual(
      FIM_ANO_MAPUTO,
    );
    const dre9 = () => runCtx(ctx, () => contab.gerarDRE(filtroDRE, ctx));
    const bal9 = () => runCtx(ctx, () => contab.gerarBalancete(filtroBal, ctx));

    const dreAntes = await dre9();
    expect(f2(dreAntes.lucroLiquido), 'pré-condição: a DRE do ano dá 670').toBe('670.00');
    const balAntes = await bal9();
    const l711Antes = balAntes.contas.find((l: AnyDb) => l.conta.id === conta['711']);
    expect(f2(l711Antes?.creditos), 'pré-condição: 711 com 1000 de crédito').toBe('1000.00');

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx);
    expect(r.ok).toBe(true);

    // Pré-condição anti-vacuidade: os lançamentos de encerramento caem DENTRO do intervalo pedido —
    // só a exclusão do período 13 os pode deixar de fora dos mapas.
    const en = await lancamentosEN(ctx);
    expect(en).toHaveLength(3);
    for (const l of en) {
      expect(l.data.getTime(), 'pré-condição: lançamento EN ≥ dataInicio').toBeGreaterThanOrEqual(filtroDRE.dataInicio.getTime());
      expect(l.data.getTime(), 'pré-condição: lançamento EN ≤ dataFim da DRE').toBeLessThanOrEqual(filtroDRE.dataFim.getTime());
      expect(l.data.getTime(), 'pré-condição: lançamento EN ≤ dataFim do balancete').toBeLessThanOrEqual(filtroBal.dataFim.getTime());
    }

    const dreDepois = await dre9();
    expect(f2(dreDepois.lucroLiquido), 'DRE depois do encerramento').toBe('670.00');
    expect(f2(dreDepois.receitaBruta)).toBe(f2(dreAntes.receitaBruta));
    expect(f2(dreDepois.resultadoFinanceiro)).toBe(f2(dreAntes.resultadoFinanceiro));

    const balDepois = await bal9();
    const l711 = balDepois.contas.find((l: AnyDb) => l.conta.id === conta['711']);
    expect(f2(l711?.creditos), '711 mantém 1000 de crédito').toBe('1000.00');
    expect(f2(l711?.debitos), '711 sem o débito do encerramento').toBe('0.00');
    expect(balDepois.contas.find((l: AnyDb) => l.conta.id === conta['88']), '88 fora do balancete por datas').toBeUndefined();
    expect(f2(balDepois.totalDebitos)).toBe(f2(balAntes.totalDebitos));
  }, 120_000);

  // -------------------------------------------------------------------------
  // Emenda da revisão (lacunas de cobertura). Os casos acima não mudam.
  //
  // Não cobertos, por não serem construíveis pelos serviços: RASCUNHOS_NO_PERIODO_13
  // (`criarLancamento` resolve 31/12 para o período 12 e só o encerramento escreve no 13) e
  // BALANCETE_DESEQUILIBRADO (todo o caminho de escrita impõe Σ D = Σ C; desequilibrar exigiria
  // escrever partidas pelo Prisma, o que o `gate-periodo` proíbe).
  // -------------------------------------------------------------------------

  /** D − C de uma conta sobre os períodos 1..13 do exercício. */
  async function saldoFinal(ctx: Ctx, exercicioId: string, contaId: string) {
    return f2((await saldos(ctx, exercicioId, [...MESES, 13])).get(contaId));
  }

  async function encerramentoDe(ctx: Ctx, exercicioId: string) {
    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: ctx.tenantId, exercicioId } });
    expect(enc, 'existe o EncerramentoExercicio').toBeTruthy();
    return enc;
  }

  it('com o período 13 já fechado devolve PERIODO_13_FECHADO e não escreve nada', async () => {
    const { ctx, ex } = await cenarioPronto();
    const p13 = await db.periodoContabil.findFirst({ where: { tenantId: ctx.tenantId, exercicioId: ex.id, ordem: 13 } });
    // Fecho real (N1): com 1..12 FECHADO o período 13 fecha sem apuramento do IVA.
    const fecho = await contab.fecharPeriodo({ id: p13.id }, ctx);
    expect('impedimentos' in fecho ? fecho.impedimentos : [], 'pré-condição: o período 13 fecha').toEqual([]);
    expect((await db.periodoContabil.findFirst({ where: { id: p13.id, tenantId: ctx.tenantId } })).estado).toBe('FECHADO');

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx);

    expect(r.ok).toBe(false);
    expect('impedimentos' in r ? r.impedimentos : []).toContain('PERIODO_13_FECHADO');
    expect(await db.lancamento.count({ where: { tenantId: ctx.tenantId, diario: { tipo: 'ENCERRAMENTO' } } })).toBe(0);
    expect(await db.encerramentoExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(0);
    expect((await db.exercicioContabil.findFirst({ where: { id: ex.id, tenantId: ctx.tenantId } })).estado).toBe('ABERTO');
  }, 120_000);

  it('com movimento prévio em 81, 82 e 83 salda-as a zero e 88 = 520 credor', async () => {
    // Cenário base (corrente 670) + Jul D 81 / C 111 40 · Ago D 121 / C 82 15 · Set D 83 / C 121 25.
    // Resultado: 670 − 40 + 15 − 25 = 620 corrente; − 100 imposto = 520 credor em 88.
    const t = await novoTenant();
    await lancarCenario(t.ctx);
    await lancar(t.ctx, '2026-07-15T10:00:00Z', '81', '111', '40');
    await lancar(t.ctx, '2026-08-15T10:00:00Z', '121', '82', '15');
    await lancar(t.ctx, '2026-09-15T10:00:00Z', '83', '121', '25');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    for (const codigo of ['81', '82', '83', '851', '711', '622', '6911', '7811'] as const) {
      expect(await saldoFinal(t.ctx, ex.id, t.conta[codigo]), `${codigo} salda a zero`).toBe('0.00');
    }
    expect(await saldoFinal(t.ctx, ex.id, t.conta['88']), '88 = 520 credor').toBe('-520.00');
    expect(await saldoFinal(t.ctx, ex.id, t.conta['4411'])).toBe('-100.00');

    const enc = await encerramentoDe(t.ctx, ex.id);
    // L1: 81 recebe −700 e salda o total −660 (com os 40 prévios); 82 recebe +30 e salda +15; 83 fica −645.
    const l1 = await netoDoLancamento(t.ctx, enc.lancamentoResultadosId);
    expect(f2(l1.get(t.conta['81']))).toBe('-40.00');
    expect(f2(l1.get(t.conta['82']))).toBe('15.00');
    expect(f2(l1.get(t.conta['83']))).toBe('-645.00');
    // L3: 83 (25 − 645 = −620) e 851 (+100) saldam contra 88.
    const l3 = await netoDoLancamento(t.ctx, enc.lancamentoLiquidoId);
    expect(f2(l3.get(t.conta['83']))).toBe('620.00');
    expect(f2(l3.get(t.conta['851']))).toBe('-100.00');
    expect(f2(l3.get(t.conta['88']))).toBe('-520.00');
  }, 120_000);

  it('num ano de prejuízo 88 fica devedor 300 e o L3 debita 88 e credita 83', async () => {
    // Mar D 111 / C 711 200 · Abr D 622 / C 111 500 → resultado −300, sem imposto.
    const t = await novoTenant();
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '200');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '500');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '0' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    expect(await saldoFinal(t.ctx, ex.id, t.conta['88']), '88 = 300 devedor').toBe('300.00');
    for (const codigo of ['81', '83', '711', '622'] as const) {
      expect(await saldoFinal(t.ctx, ex.id, t.conta[codigo]), `${codigo} salda a zero`).toBe('0.00');
    }

    const enc = await encerramentoDe(t.ctx, ex.id);
    expect(enc.lancamentoImpostoId).toBeNull();
    const l1 = await netoDoLancamento(t.ctx, enc.lancamentoResultadosId);
    expect(f2(l1.get(t.conta['711']))).toBe('200.00');
    expect(f2(l1.get(t.conta['622']))).toBe('-500.00');
    expect(f2(l1.get(t.conta['83']))).toBe('300.00');

    const partidasL3 = await db.partidaLancamento.findMany({
      where: { tenantId: t.ctx.tenantId, lancamentoId: enc.lancamentoLiquidoId },
      select: { contaId: true, tipo: true, valor: true },
    });
    const p88 = partidasL3.filter((p: AnyDb) => p.contaId === t.conta['88']);
    const p83 = partidasL3.filter((p: AnyDb) => p.contaId === t.conta['83']);
    expect(p88.map((p: AnyDb) => [p.tipo, f2(p.valor)])).toEqual([['DEBITO', '300.00']]);
    expect(p83.map((p: AnyDb) => [p.tipo, f2(p.valor)])).toEqual([['CREDITO', '300.00']]);
  }, 120_000);

  it('com 852 movimentada e estimativa 100, o L3 salda 851 e 852 contra 88 = 540 credor', async () => {
    // Cenário base (corrente 670) + Jul D 852 / C 121 30. 88 = 670 − 100 − 30 = 540 credor.
    const t = await novoTenant();
    const c852 = await db.contaPGC.findFirst({ where: { tenantId: t.ctx.tenantId, codigo: '852' } });
    expect(c852?.aceitaLancamento, 'pré-condição: 852 aceita lançamento').toBe(true);
    await lancarCenario(t.ctx);
    await lancar(t.ctx, '2026-07-15T10:00:00Z', '852', '121', '30');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    expect(await saldoFinal(t.ctx, ex.id, c852.id), '852 salda a zero').toBe('0.00');
    expect(await saldoFinal(t.ctx, ex.id, t.conta['851']), '851 salda a zero').toBe('0.00');
    expect(await saldoFinal(t.ctx, ex.id, t.conta['83']), '83 salda a zero').toBe('0.00');
    expect(await saldoFinal(t.ctx, ex.id, t.conta['88']), '88 = 540 credor').toBe('-540.00');

    const enc = await encerramentoDe(t.ctx, ex.id);
    const l3 = await netoDoLancamento(t.ctx, enc.lancamentoLiquidoId);
    expect(f2(l3.get(t.conta['83']))).toBe('670.00');
    expect(f2(l3.get(t.conta['851']))).toBe('-100.00');
    expect(f2(l3.get(c852.id))).toBe('-30.00');
    expect(f2(l3.get(t.conta['88']))).toBe('-540.00');
  }, 120_000);

  it('uma folha com débitos e créditos no ano é saldada só pelo líquido (711: 1000 − 200 → débito 800)', async () => {
    // Mar D 111 / C 711 1000 · Abr D 711 / C 111 200 → 711 credora 800; 88 = 800 credor.
    const t = await novoTenant();
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '1000');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '711', '111', '200');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '0' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    const enc = await encerramentoDe(t.ctx, ex.id);
    const p711 = await db.partidaLancamento.findMany({
      where: { tenantId: t.ctx.tenantId, lancamentoId: enc.lancamentoResultadosId, contaId: t.conta['711'] },
      select: { tipo: true, valor: true },
    });
    expect(p711.map((p: AnyDb) => [p.tipo, f2(p.valor)])).toEqual([['DEBITO', '800.00']]);
    const l1 = await netoDoLancamento(t.ctx, enc.lancamentoResultadosId);
    expect(f2(l1.get(t.conta['83']))).toBe('-800.00');
    expect(await saldoFinal(t.ctx, ex.id, t.conta['711'])).toBe('0.00');
    expect(await saldoFinal(t.ctx, ex.id, t.conta['88']), '88 = 800 credor').toBe('-800.00');
  }, 120_000);

  it('isolamento: o encerramento do tenant A não toca no tenant B, com movimento 6/7 no mesmo ano', async () => {
    const a = await cenarioPronto();
    const b = await novoTenant();
    // Tenant B: Mar D 111 / C 711 5000 · Abr D 622 / C 111 1200 (resultado 3800 — não pode chegar a A).
    await lancar(b.ctx, '2026-03-15T10:00:00Z', '111', '711', '5000');
    await lancar(b.ctx, '2026-04-15T10:00:00Z', '622', '111', '1200');
    const exB = await exercicio2026(b.ctx);
    await fecharMeses(b.ctx, exB.id, MESES);

    const lancamentosB = async () =>
      (await db.lancamento.findMany({ where: { tenantId: b.ctx.tenantId }, select: { id: true, status: true }, orderBy: { id: 'asc' } }))
        .map((l: AnyDb) => `${l.id}:${l.status}`);
    const antesB = await lancamentosB();
    const saldosB = async () =>
      [...(await saldos(b.ctx, exB.id, [...MESES, 13])).entries()].map(([k, v]) => `${k}:${f2(v)}`).sort();
    const saldosAntesB = await saldosB();

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: a.ex.id, estimativaImposto: '100' }, a.ctx);
    expect(r.ok).toBe(true);

    // A: os números do caso base, sem nada de B.
    expect(await saldoFinal(a.ctx, a.ex.id, a.conta['88']), 'A: 88 = 570 credor').toBe('-570.00');
    const enc = await encerramentoDe(a.ctx, a.ex.id);
    const contasL1 = await db.partidaLancamento.findMany({
      where: { lancamentoId: enc.lancamentoResultadosId },
      select: { contaId: true, tenantId: true },
    });
    const donos = await db.contaPGC.findMany({
      where: { id: { in: contasL1.map((p: AnyDb) => p.contaId) } },
      select: { tenantId: true },
    });
    expect(new Set(donos.map((c: AnyDb) => c.tenantId)), 'L1 de A só tem contas de A').toEqual(new Set([a.ctx.tenantId]));
    expect(new Set(contasL1.map((p: AnyDb) => p.tenantId))).toEqual(new Set([a.ctx.tenantId]));

    // B: intacto.
    expect(await lancamentosB()).toEqual(antesB);
    expect(await saldosB()).toEqual(saldosAntesB);
    expect((await db.exercicioContabil.findFirst({ where: { id: exB.id, tenantId: b.ctx.tenantId } })).estado).toBe('ABERTO');
    expect(await db.encerramentoExercicio.count({ where: { tenantId: b.ctx.tenantId } })).toBe(0);
    const p13B = await db.periodoContabil.findFirst({ where: { tenantId: b.ctx.tenantId, exercicioId: exB.id, ordem: 13 } });
    expect(p13B.estado).toBe('ABERTO');
  }, 120_000);

  it('um exercício com menos de doze períodos mensais devolve PERIODOS_MENSAIS_EM_FALTA', async () => {
    const t = await novoTenant();
    // Exercício 2026 criado à mão SEM o período de Agosto (o serviço criaria os treze). Os
    // lançamentos encontram os períodos pelo código (`resolverPeriodo`), por isso caem nestes.
    const inicioMes = (mes: number) => new Date(Date.UTC(2026, mes - 1, 1) - 2 * 3600_000);
    const fimMes = (mes: number) => new Date(Date.UTC(2026, mes, 1) - 2 * 3600_000 - 1);
    const ex = await db.exercicioContabil.create({
      data: { tenantId: t.ctx.tenantId, codigo: '2026', dataInicio: inicioMes(1), dataFim: fimMes(12), estado: 'ABERTO' },
    });
    for (const ordem of [...MESES.filter((m) => m !== 8), 13]) {
      await db.periodoContabil.create({
        data: {
          tenantId: t.ctx.tenantId,
          exercicioId: ex.id,
          ordem,
          codigo: `2026-${String(ordem).padStart(2, '0')}`,
          dataInicio: ordem === 13 ? fimMes(12) : inicioMes(ordem),
          dataFim: ordem === 13 ? fimMes(12) : fimMes(ordem),
          estado: 'ABERTO',
        },
      });
    }
    await lancarCenario(t.ctx);
    expect(
      await db.lancamento.count({ where: { tenantId: t.ctx.tenantId, periodo: { exercicioId: ex.id } } }),
      'pré-condição: o cenário caiu no exercício criado à mão',
    ).toBe(4);
    await fecharMeses(t.ctx, ex.id, MESES);
    expect(
      await db.periodoContabil.count({ where: { tenantId: t.ctx.tenantId, exercicioId: ex.id, ordem: { lte: 12 }, estado: 'FECHADO' } }),
      'pré-condição: os onze mensais existentes estão fechados',
    ).toBe(11);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, t.ctx);

    expect(r.ok).toBe(false);
    const impedimentos = 'impedimentos' in r ? r.impedimentos : [];
    expect(impedimentos).toContain('PERIODOS_MENSAIS_EM_FALTA');
    expect(impedimentos, 'nenhum mensal existente está aberto').not.toContain('PERIODOS_MENSAIS_ABERTOS');
    await semEscritas(t.ctx, ex.id);
  }, 120_000);
});
