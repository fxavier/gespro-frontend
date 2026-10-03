/**
 * Oráculo S1 (run razao-periodos, issue #297, ADR-0040 §7) — razão geral por períodos e com
 * saldo anterior.
 *
 * Contrato (G1, `.scratch/sdlc/razao-periodos/RUN.md`):
 *   razaoConta(filtro, ctx) → { conta{id,codigo,nome,natureza,classe}, saldoAnterior, linhas,
 *   saldoFinal, intervalo } ; `saldoAcumulado` de cada linha parte do saldo anterior; saldos
 *   assinados pela natureza (DEVEDORA: D−C; CREDORA: C−D); saldoFinal = último acumulado,
 *   ou o anterior quando não há linhas.
 *   - DATAS: movimento = lançamentos com data em [dataInicio, dataFim]; anterior = data < dataInicio.
 *   - PERÍODOS: normalização igual à do balancete; movimento pelo PERÍODO do lançamento;
 *     anterior = períodos [1..de−1] + (classes 1–5 e 8, só sem lançamento no diário ABERTURA
 *     do exercício) lançamentos com data anterior ao início do exercício.
 *   - FILTRO_LANCAMENTO_MAPA (LANCADO + ESTORNADO; RASCUNHO fora). Exercício alheio → NotFoundError.
 *   INVARIANTE (critério de aceitação da #297): por períodos, saldoFinal da folha = «Saldo» da
 *   conta em `gerarBalanceteVerificacao` do mesmo intervalo (Devedor − Credor, com o sinal da
 *   natureza) e Σ débitos/créditos das linhas = movD/movC dessa linha.
 *   ADDENDUM G5: o razão NÃO é truncado por `take` (linhas completas) e devolve
 *   `totais: { debito, credito }` (Decimal, por agregação) = Σ do movimento = movD/movC.
 *
 * Dados (tenant A, montado pelos serviços reais — nunca Prisma em Lancamento, gate-periodo):
 *   2024 (histórico)  L1 111 D1000 / 521 C1000 · L2 622 D300 / 111 C300 · L3 111 D500 / 711 C500
 *                     L4 111 D40 / 851 C40
 *   2025 (sem AB)     p3 121 D200 / 111 C200 · p4 111 D70 / 711 C70 (ESTORNADO; estorno em p6)
 *                     p5 RASCUNHO 111 D9999 / 521 C9999 · p7 111 D800 / 711 C800
 *                     p9 111 D25 / 851 C25 · p12, no ÚLTIMO instante de 31/12 (o instante do p13):
 *                     622 D100 / 111 C100
 *   2026 (com AB)     p1 diário ABERTURA 111 D1000 / 521 C1000 · p2 111 D10 / 711 C10
 *
 * Período 13: nenhum serviço consegue hoje pôr um lançamento no p13 (`resolverPeriodo` resolve
 * pela data, e 31/12 é o 12; o lançamento de encerramento é a #138). Fica provado o lado que os
 * dados reais permitem — um lançamento do 12 com a data do 13 não aparece em 13..13 — e o outro
 * lado está em `it.todo`, sem fingir dados.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const dec = (v: unknown) => new Prisma.Decimal(String(v));
const ZERO = dec(0);

type Contab = typeof import('@/server/services/financas/contabilidade.service');
type Val = typeof import('@/lib/validations/contabilidade');

const CONTAS = ['111', '121', '521', '622', '711', '851'] as const;
type Codigo = (typeof CONTAS)[number];

/** [de, ate, incluir13] — inclui os casos de normalização. */
const INTERVALOS: Array<[number, number, boolean]> = [
  [1, 12, false],
  [3, 5, false],
  [4, 6, false],
  [12, 12, false],
  [13, 13, true],
  [1, 13, true],
  [13, 13, false], // sem p13 → 12..12
  [7, 3, false], // de > ate → 3..3
];

describe.skipIf(skip)('Razão geral por períodos e com saldo anterior — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: Contab;
  let val: Val;
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-razao-p-${sufixo}`;
  const TENANT_B = `tenant-razao-p-b-${sufixo}`;
  const USER = `user-razao-p-${sufixo}`;
  const USER_B = `user-razao-p-b-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER_B };
  const noCtx = <T>(fn: () => Promise<T>, c = ctx) => runCtx(c, fn);

  const contaId = {} as Record<Codigo, string>;
  const natureza = {} as Record<Codigo, 'DEVEDORA' | 'CREDORA'>;
  let ex25: string;
  let ex26: string;
  let exB: string;

  // ── escrita pelos serviços ────────────────────────────────────────────────
  let doc = 0;
  async function lancar(
    c: { tenantId: string; userId: string },
    data: string,
    debito: string,
    credito: string,
    valor: string,
    diarioTipo: 'OPERACOES' | 'ABERTURA' = 'OPERACOES',
  ) {
    return noCtx(
      () =>
        db.$transaction((tx: any) =>
          contab.registarLancamentoContabilistico(
            tx,
            {
              data: new Date(data),
              diarioTipo,
              origem: 'AJUSTE',
              documentoOrigemId: `doc-razao-${++doc}`,
              documentoOrigemTipo: 'TesteRazao',
              historico: `Teste razão ${debito}/${credito} ${valor}`,
              partidas: [
                { contaCodigo: debito, tipo: 'DEBITO', valor },
                { contaCodigo: credito, tipo: 'CREDITO', valor },
              ],
            },
            c,
          ),
        ),
      c,
    );
  }

  // ── leituras ──────────────────────────────────────────────────────────────
  function razaoPeriodos(codigo: Codigo, exercicioId: string, de: number, ate: number, incluir13 = false, take?: number) {
    const filtro = val.FiltroRazaoSchema.parse({
      contaId: contaId[codigo],
      exercicioId,
      periodoInicial: de,
      periodoFinal: ate,
      incluir13,
      ...(take === undefined ? {} : { take }),
    });
    return noCtx(() => contab.razaoConta(filtro, ctx));
  }

  function razaoDatas(codigo: Codigo, dataInicio: string, dataFim: string, take?: number) {
    const filtro = val.FiltroRazaoSchema.parse({
      contaId: contaId[codigo],
      dataInicio,
      dataFim,
      ...(take === undefined ? {} : { take }),
    });
    return noCtx(() => contab.razaoConta(filtro, ctx));
  }

  function balancete(exercicioId: string, de: number, ate: number, incluir13: boolean) {
    return noCtx(() =>
      contab.gerarBalanceteVerificacao({ exercicioId, periodoInicial: de, periodoFinal: ate, incluir13 }, ctx),
    );
  }

  /** Verifica a cadeia saldoAnterior → saldoAcumulado de cada linha → saldoFinal. */
  function verificarCadeia(r: any, codigo: Codigo, onde: string) {
    const sinal = natureza[codigo] === 'DEVEDORA' ? 1 : -1;
    expect(r.saldoAnterior instanceof Prisma.Decimal, `${onde}: saldoAnterior é Decimal`).toBe(true);
    expect(r.saldoFinal instanceof Prisma.Decimal, `${onde}: saldoFinal é Decimal`).toBe(true);
    let saldo = dec(r.saldoAnterior);
    for (const [i, l] of r.linhas.entries()) {
      const d = l.debito ? dec(l.debito) : ZERO;
      const c = l.credito ? dec(l.credito) : ZERO;
      saldo = saldo.plus(d.minus(c).times(sinal));
      expect(dec(l.saldoAcumulado).toFixed(2), `${onde}: saldoAcumulado da linha ${i}`).toBe(saldo.toFixed(2));
    }
    expect(dec(r.saldoFinal).toFixed(2), `${onde}: saldoFinal = último acumulado (ou anterior)`).toBe(saldo.toFixed(2));
  }

  function somas(r: any) {
    let d = ZERO;
    let c = ZERO;
    for (const l of r.linhas) {
      if (l.debito) d = d.plus(dec(l.debito));
      if (l.credito) c = c.plus(dec(l.credito));
    }
    return { d, c };
  }

  function esperar(r: any, codigo: Codigo, onde: string, e: { anterior: string; final: string; linhas: number; d?: string; c?: string }) {
    verificarCadeia(r, codigo, onde);
    expect(dec(r.saldoAnterior).toFixed(2), `${onde}: saldoAnterior`).toBe(dec(e.anterior).toFixed(2));
    expect(dec(r.saldoFinal).toFixed(2), `${onde}: saldoFinal`).toBe(dec(e.final).toFixed(2));
    expect(r.linhas, `${onde}: número de linhas`).toHaveLength(e.linhas);
    const s = somas(r);
    if (e.d !== undefined) expect(s.d.toFixed(2), `${onde}: Σ débitos`).toBe(dec(e.d).toFixed(2));
    if (e.c !== undefined) expect(s.c.toFixed(2), `${onde}: Σ créditos`).toBe(dec(e.c).toFixed(2));
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    val = await import('@/lib/validations/contabilidade');
    ({ NotFoundError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [t, u, slug] of [
      [TENANT, USER, `razao-p-${sufixo}`],
      [TENANT_B, USER_B, `razao-p-b-${sufixo}`],
    ] as const) {
      await db.tenant.create({ data: { id: t, nome: `Tenant ${slug}`, slug, nuit: `${sufixo}`.slice(-8) + (t === TENANT ? "1" : "2") } });
      await db.user.create({ data: { id: u, tenantId: t, email: `${slug}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${slug}` } });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, t), { timeout: 60_000 });
    }

    const contas = await db.contaPGC.findMany({
      where: { tenantId: TENANT, codigo: { in: [...CONTAS] } },
      select: { id: true, codigo: true, natureza: true, aceitaLancamento: true },
    });
    for (const c of contas) {
      expect(c.aceitaLancamento, `pré-condição: ${c.codigo} é folha`).toBe(true);
      contaId[c.codigo as Codigo] = c.id;
      natureza[c.codigo as Codigo] = c.natureza;
    }
    expect(Object.keys(contaId).sort()).toEqual([...CONTAS].sort());

    // 2024 — histórico anterior aos exercícios em análise
    await lancar(ctx, '2024-02-10T10:00:00Z', '111', '521', '1000');
    await lancar(ctx, '2024-05-10T10:00:00Z', '622', '111', '300');
    await lancar(ctx, '2024-08-10T10:00:00Z', '111', '711', '500');
    await lancar(ctx, '2024-09-10T10:00:00Z', '111', '851', '40');

    // 2025 — sem diário de abertura
    await lancar(ctx, '2025-03-15T10:00:00Z', '121', '111', '200');
    const aEstornar: any = await lancar(ctx, '2025-04-10T10:00:00Z', '111', '711', '70');
    await noCtx(() =>
      contab.estornarLancamento(
        { lancamentoId: aEstornar.id, motivo: 'Teste do razão', data: new Date('2025-06-10T10:00:00Z') },
        ctx,
      ),
    );
    const diarioOT = await db.diario.findFirst({ where: { tenantId: TENANT, tipo: 'OUTROS' } });
    const rascunho: any = await noCtx(() =>
      contab.criarLancamento(
        val.CriarLancamentoSchema.parse({
          data: '2025-05-20T10:00:00Z',
          diarioId: diarioOT.id,
          historico: 'Rascunho que o razão não pode ver',
          partidas: [
            { contaId: contaId['111'], tipo: 'DEBITO', valor: 9999 },
            { contaId: contaId['521'], tipo: 'CREDITO', valor: 9999 },
          ],
        }),
        ctx,
      ),
    );
    await lancar(ctx, '2025-07-15T10:00:00Z', '111', '711', '800');
    await lancar(ctx, '2025-09-10T10:00:00Z', '111', '851', '25');
    // Último instante de 31/12 em Maputo — o instante em que vive o período 13.
    const l31: any = await lancar(ctx, '2025-12-31T21:59:59.999Z', '622', '111', '100');

    // 2026 — com lançamento no diário de abertura
    await lancar(ctx, '2026-01-01T08:00:00Z', '111', '521', '1000', 'ABERTURA');
    await lancar(ctx, '2026-02-10T10:00:00Z', '111', '711', '10');

    // Tenant B — um exercício só dele
    await lancar(ctxB, '2025-03-15T10:00:00Z', '121', '111', '5');

    // Pré-condições dos dados (lidas pelo cliente cru, não pelo serviço em teste)
    const exs = await db.exercicioContabil.findMany({ where: { tenantId: TENANT }, select: { id: true, codigo: true } });
    ex25 = exs.find((e: any) => e.codigo === '2025').id;
    ex26 = exs.find((e: any) => e.codigo === '2026').id;
    exB = (await db.exercicioContabil.findFirst({ where: { tenantId: TENANT_B, codigo: '2025' } })).id;

    const estados = await db.lancamento.findMany({
      where: { tenantId: TENANT, id: { in: [aEstornar.id, rascunho.id] } },
      select: { id: true, status: true },
    });
    expect(estados.find((x: any) => x.id === aEstornar.id).status).toBe('ESTORNADO');
    expect(estados.find((x: any) => x.id === rascunho.id).status).toBe('RASCUNHO');

    const p31 = await db.lancamento.findFirst({ where: { id: l31.id, tenantId: TENANT }, include: { periodo: true } });
    expect(p31.periodo.ordem, 'o lançamento de 31/12 fica no período 12').toBe(12);
    const p13 = await db.periodoContabil.findFirst({ where: { tenantId: TENANT, exercicioId: ex25, ordem: 13 } });
    expect(p13.dataInicio.getTime(), 'o lançamento de 31/12 tem a data do período 13').toBe(p31.data.getTime());
  }, 180_000);

  // -------------------------------------------------------------------------
  // (a) Invariante razão ⇔ balancete
  // -------------------------------------------------------------------------

  for (const ex of ['2025', '2026'] as const) {
    it(`invariante (${ex}): saldoFinal = Saldo do balancete com o sinal da natureza, Σ linhas = movD/movC, em todos os intervalos e contas`, async () => {
      const exercicioId = ex === '2025' ? ex25 : ex26;
      for (const [de, ate, p13] of INTERVALOS) {
        const bv: any = await balancete(exercicioId, de, ate, p13);
        for (const codigo of CONTAS) {
          const onde = `${ex} [${de}..${ate}${p13 ? '+p13' : ''}] ${codigo}`;
          const r: any = await razaoPeriodos(codigo, exercicioId, de, ate, p13);
          verificarCadeia(r, codigo, onde);

          const l = bv.linhas.find((x: any) => x.conta?.id === contaId[codigo]);
          const sinal = natureza[codigo] === 'DEVEDORA' ? 1 : -1;
          const saldoBV = l ? dec(l.saldoDevedor).minus(dec(l.saldoCredor)).times(sinal) : ZERO;
          expect(dec(r.saldoFinal).toFixed(2), `${onde}: saldoFinal = saldo do balancete`).toBe(saldoBV.toFixed(2));

          const s = somas(r);
          expect(s.d.toFixed(2), `${onde}: Σ débitos = movD`).toBe((l ? dec(l.movD) : ZERO).toFixed(2));
          expect(s.c.toFixed(2), `${onde}: Σ créditos = movC`).toBe((l ? dec(l.movC) : ZERO).toFixed(2));

          expect(r.totais?.debito instanceof Prisma.Decimal, `${onde}: totais.debito é Decimal`).toBe(true);
          expect(r.totais?.credito instanceof Prisma.Decimal, `${onde}: totais.credito é Decimal`).toBe(true);
          expect(dec(r.totais.debito).toFixed(2), `${onde}: totais.debito = movD`).toBe((l ? dec(l.movD) : ZERO).toFixed(2));
          expect(dec(r.totais.credito).toFixed(2), `${onde}: totais.credito = movC`).toBe((l ? dec(l.movC) : ZERO).toFixed(2));

          expect(r.intervalo, `${onde}: intervalo efectivo igual ao do balancete`).toEqual({
            modo: 'PERIODOS',
            exercicioId,
            periodoInicial: bv.periodoInicial,
            periodoFinal: bv.periodoFinal,
            incluir13: p13,
          });
        }
      }
    });
  }

  it('devolve a conta pedida', async () => {
    const r: any = await razaoPeriodos('711', ex25, 1, 12);
    expect(r.conta).toMatchObject({ id: contaId['711'], codigo: '711', natureza: 'CREDORA' });
    expect(r.conta.nome).toEqual(expect.any(String));
    expect(r.conta.classe).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Valores à mão (2025, sem AB) — o invariante não chega se os dois errarem igual
  // -------------------------------------------------------------------------

  it('2025, 111 (classe 1): abertura implícita de 1240, movimento pelo período, RASCUNHO fora, estorno dentro', async () => {
    esperar(await razaoPeriodos('111', ex25, 1, 12), '111', '111 [1..12]', { anterior: '1240', final: '1765', linhas: 6, d: '895', c: '370' });
    esperar(await razaoPeriodos('111', ex25, 3, 5), '111', '111 [3..5]', { anterior: '1240', final: '1110', linhas: 2, d: '70', c: '200' });
    esperar(await razaoPeriodos('111', ex25, 4, 6), '111', '111 [4..6]', { anterior: '1040', final: '1040', linhas: 2, d: '70', c: '70' });
    esperar(await razaoPeriodos('111', ex25, 6, 12), '111', '111 [6..12]', { anterior: '1110', final: '1765', linhas: 4, d: '825', c: '170' });
  });

  it('2025, classes 5 e 8 (CREDORA): a abertura implícita entra no anterior, com o sinal da natureza', async () => {
    esperar(await razaoPeriodos('521', ex25, 1, 12), '521', '521 [1..12]', { anterior: '1000', final: '1000', linhas: 0 });
    esperar(await razaoPeriodos('851', ex25, 1, 12), '851', '851 [1..12]', { anterior: '40', final: '65', linhas: 1, c: '25' });
    esperar(await razaoPeriodos('851', ex25, 10, 12), '851', '851 [10..12]', { anterior: '65', final: '65', linhas: 0 });
  });

  it('2025, classes 6 e 7: o histórico anterior ao exercício nunca entra', async () => {
    esperar(await razaoPeriodos('622', ex25, 1, 12), '622', '622 [1..12]', { anterior: '0', final: '100', linhas: 1, d: '100' });
    esperar(await razaoPeriodos('711', ex25, 1, 12), '711', '711 [1..12]', { anterior: '0', final: '800', linhas: 3, d: '70', c: '870' });
    esperar(await razaoPeriodos('711', ex25, 4, 4), '711', '711 [4..4]', { anterior: '0', final: '70', linhas: 1, c: '70' });
    esperar(await razaoPeriodos('711', ex25, 8, 12), '711', '711 [8..12]', { anterior: '800', final: '800', linhas: 0 });
  });

  it('normalização: de > ate fica ate..ate; 13 sem p13 fica 12; o intervalo devolvido é o efectivo', async () => {
    const invertido: any = await razaoPeriodos('111', ex25, 7, 3);
    expect(invertido.intervalo).toEqual({ modo: 'PERIODOS', exercicioId: ex25, periodoInicial: 3, periodoFinal: 3, incluir13: false });
    esperar(invertido, '111', '111 [7..3]', { anterior: '1240', final: '1040', linhas: 1, c: '200' });

    const sem13: any = await razaoPeriodos('111', ex25, 13, 13, false);
    expect(sem13.intervalo).toEqual({ modo: 'PERIODOS', exercicioId: ex25, periodoInicial: 12, periodoFinal: 12, incluir13: false });
    esperar(sem13, '111', '111 [13..13 sem p13]', { anterior: '1865', final: '1765', linhas: 1, c: '100' });
  });

  // -------------------------------------------------------------------------
  // (g) O razão não é truncado por `take` (addendum G5) — totais por agregação
  // -------------------------------------------------------------------------

  it('take: 1 não trunca (períodos): todas as linhas, saldoFinal e totais = balancete', async () => {
    const r: any = await razaoPeriodos('111', ex25, 1, 12, false, 1);
    esperar(r, '111', '111 [1..12] take 1', { anterior: '1240', final: '1765', linhas: 6, d: '895', c: '370' });

    const bv: any = await balancete(ex25, 1, 12, false);
    const l = bv.linhas.find((x: any) => x.conta?.id === contaId['111']);
    expect(l, 'balancete tem a linha 111').toBeDefined();
    expect(dec(r.saldoFinal).toFixed(2), 'saldoFinal = saldo do balancete').toBe(dec(l.saldoDevedor).minus(dec(l.saldoCredor)).toFixed(2));

    const s = somas(r);
    expect(r.totais?.debito instanceof Prisma.Decimal, 'totais.debito é Decimal').toBe(true);
    expect(r.totais?.credito instanceof Prisma.Decimal, 'totais.credito é Decimal').toBe(true);
    expect(dec(r.totais.debito).toFixed(2), 'totais.debito = Σ linhas').toBe(s.d.toFixed(2));
    expect(dec(r.totais.credito).toFixed(2), 'totais.credito = Σ linhas').toBe(s.c.toFixed(2));
    expect(dec(r.totais.debito).toFixed(2), 'totais.debito = movD').toBe(dec(l.movD).toFixed(2));
    expect(dec(r.totais.credito).toFixed(2), 'totais.credito = movC').toBe(dec(l.movC).toFixed(2));
  });

  it('take: 1 não trunca (datas): todas as linhas e totais = Σ linhas', async () => {
    // 01/01/2025 00:00 .. 31/12/2025 23:59:59.999 em Maputo
    const r: any = await razaoDatas('111', '2024-12-31T22:00:00.000Z', '2025-12-31T21:59:59.999Z', 1);
    esperar(r, '111', 'datas 111 [2025] take 1', { anterior: '1240', final: '1765', linhas: 6, d: '895', c: '370' });
    const s = somas(r);
    expect(r.totais?.debito instanceof Prisma.Decimal, 'totais.debito é Decimal').toBe(true);
    expect(r.totais?.credito instanceof Prisma.Decimal, 'totais.credito é Decimal').toBe(true);
    expect(dec(r.totais.debito).toFixed(2), 'totais.debito = Σ linhas').toBe(s.d.toFixed(2));
    expect(dec(r.totais.credito).toFixed(2), 'totais.credito = Σ linhas').toBe(s.c.toFixed(2));
  });

  // -------------------------------------------------------------------------
  // (b) Período 13 — separado do 12 pelo PERÍODO, não pela data
  // -------------------------------------------------------------------------

  it('p13: o lançamento do 12 com a data do 13 está em 12..12 e NÃO em 13..13', async () => {
    esperar(await razaoPeriodos('622', ex25, 12, 12), '622', '622 [12..12]', { anterior: '0', final: '100', linhas: 1, d: '100' });

    const so13: any = await razaoPeriodos('622', ex25, 13, 13, true);
    expect(so13.intervalo).toEqual({ modo: 'PERIODOS', exercicioId: ex25, periodoInicial: 13, periodoFinal: 13, incluir13: true });
    esperar(so13, '622', '622 [13..13+p13]', { anterior: '100', final: '100', linhas: 0 });
    esperar(await razaoPeriodos('111', ex25, 13, 13, true), '111', '111 [13..13+p13]', { anterior: '1765', final: '1765', linhas: 0 });
    esperar(await razaoPeriodos('111', ex25, 1, 13, true), '111', '111 [1..13+p13]', { anterior: '1240', final: '1765', linhas: 6 });
  });

  it.todo(
    'p13: um lançamento no período 13 (31/12) entra em 13..13 e não em 1..12 nem em 12..12 — ' +
      'BLOQUEADO: nenhum serviço lança hoje no período 13 (resolverPeriodo resolve 31/12 para o 12; ' +
      'o lançamento de encerramento é a #138). Escrever quando houver um caminho real.',
  );

  // -------------------------------------------------------------------------
  // (c) Abertura implícita vs diário AB — nunca as duas
  // -------------------------------------------------------------------------

  it('2026, com lançamento no diário ABERTURA: sem abertura implícita (nada de 2024/2025 no anterior)', async () => {
    esperar(await razaoPeriodos('111', ex26, 1, 12), '111', '2026 111 [1..12]', { anterior: '0', final: '1010', linhas: 2, d: '1010', c: '0' });
    esperar(await razaoPeriodos('111', ex26, 2, 12), '111', '2026 111 [2..12]', { anterior: '1000', final: '1010', linhas: 1, d: '10' });
    esperar(await razaoPeriodos('521', ex26, 1, 12), '521', '2026 521 [1..12]', { anterior: '0', final: '1000', linhas: 1, c: '1000' });
    esperar(await razaoPeriodos('851', ex26, 1, 12), '851', '2026 851 [1..12]', { anterior: '0', final: '0', linhas: 0 });
    esperar(await razaoPeriodos('121', ex26, 1, 12), '121', '2026 121 [1..12]', { anterior: '0', final: '0', linhas: 0 });
    esperar(await razaoPeriodos('711', ex26, 1, 12), '711', '2026 711 [1..12]', { anterior: '0', final: '10', linhas: 1, c: '10' });
  });

  // -------------------------------------------------------------------------
  // (d) Modo por datas — anterior = tudo antes de dataInicio
  // -------------------------------------------------------------------------

  it('datas: saldo anterior = todos os lançamentos com data anterior a dataInicio, RASCUNHO fora', async () => {
    // 01/03/2025 00:00 e 30/04/2025 23:59:59.999 em Maputo
    const r: any = await razaoDatas('111', '2025-02-28T22:00:00.000Z', '2025-04-30T21:59:59.999Z');
    esperar(r, '111', 'datas 111 [mar..abr]', { anterior: '1240', final: '1110', linhas: 2, d: '70', c: '200' });
    expect(r.intervalo).toEqual({
      modo: 'DATAS',
      dataInicio: new Date('2025-02-28T22:00:00.000Z'),
      dataFim: new Date('2025-04-30T21:59:59.999Z'),
    });

    // Maio: só o RASCUNHO → nada; o anterior inclui o estorno-alvo de Abril
    esperar(await razaoDatas('111', '2025-04-30T22:00:00.000Z', '2025-05-31T21:59:59.999Z'), '111', 'datas 111 [mai]', {
      anterior: '1110',
      final: '1110',
      linhas: 0,
    });
  });

  it('datas: o anterior não distingue classes (é «tudo antes de dataInicio», ADR-0040 §7)', async () => {
    esperar(await razaoDatas('711', '2025-02-28T22:00:00.000Z', '2025-12-31T21:59:59.999Z'), '711', 'datas 711 [mar..dez]', {
      anterior: '500',
      final: '1300',
      linhas: 3,
      d: '70',
      c: '870',
    });
  });

  it('datas: o intervalo é por data — o último instante de 31/12 entra, venha o período que vier', async () => {
    esperar(await razaoDatas('622', '2025-12-31T21:59:59.999Z', '2025-12-31T21:59:59.999Z'), '622', 'datas 622 [31/12 fim]', {
      anterior: '300',
      final: '400',
      linhas: 1,
      d: '100',
    });
  });

  // -------------------------------------------------------------------------
  // (e) Exercício de outro tenant
  // -------------------------------------------------------------------------

  it('exercício de outro tenant → NotFoundError', async () => {
    await expect(razaoPeriodos('111', exB, 1, 12)).rejects.toBeInstanceOf(NotFoundError);
  });

  // -------------------------------------------------------------------------
  // (f) Intervalo vazio
  // -------------------------------------------------------------------------

  it('intervalo sem movimento: linhas [] e saldoFinal = saldoAnterior', async () => {
    for (const [codigo, de, ate, anterior] of [
      ['111', 10, 11, '1865'],
      ['121', 1, 2, '0'],
      ['711', 1, 3, '0'],
      ['521', 5, 5, '1000'],
    ] as const) {
      const r: any = await razaoPeriodos(codigo, ex25, de, ate);
      expect(r.linhas, `${codigo} [${de}..${ate}]`).toEqual([]);
      expect(dec(r.saldoAnterior).toFixed(2), `${codigo} [${de}..${ate}] anterior`).toBe(dec(anterior).toFixed(2));
      expect(dec(r.saldoFinal).equals(dec(r.saldoAnterior)), `${codigo} [${de}..${ate}] final = anterior`).toBe(true);
    }
  });
});
