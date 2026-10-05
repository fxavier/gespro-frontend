/**
 * Oráculo P3-v (run exercicio-followups, issue #363, ADR-0035 §6 e §7) — o lançamento de
 * abertura (AB) automático do exercício seguinte.
 *
 * Contrato (decisões do utilizador e do orquestrador, `.scratch/sdlc/exercicio-followups/RUN.md`):
 *   AB = UM lançamento LANCADO no diário ABERTURA do tenant, período de ordem 1 de N+1,
 *     `data` = `dataInicio` de N+1, `documentoOrigemTipo: 'ExercicioContabil'`,
 *     `documentoOrigemId` = N.id; partidas = saldos de fecho de N nos períodos 1..13
 *     (FILTRO_LANCAMENTO_MAPA) de cada folha das classes 1–5 e 8 com saldo não nulo
 *     (devedor → débito, credor → crédito); equilibrado.
 *   Disparos:
 *     T1 `encerrarExercicio(N)` com N+1 já existente → AB na mesma transacção.
 *     T2 N+1 criado DEPOIS de N estar ENCERRADO_PROVISORIO — por `abrirExercicio(N+1)` (a)
 *        ou pela criação automática quando um lançamento cai em N+1 (b) → AB.
 *     T3 `reabrirExercicio(N)` → o AB de N+1 fica ESTORNADO; o estorno vai para o diário
 *        ABERTURA, período 1 de N+1 (não pela data de hoje); N+1 fica sem AB efectivo.
 *     T4 re-encerrar N → AB novo (um só AB efectivo em N+1). O definitivo não toca no AB.
 *   Recusas:
 *     `reabrirExercicio(N)` com algum período de N+1 FECHADO → BusinessRuleError
 *       `EXERCICIO_SEGUINTE_COM_PERIODO_FECHADO`, nada muda.
 *     `encerrarExercicio(N)` com N+1 existente e o seu período 1 FECHADO → impedimento
 *       `ABERTURA_SEGUINTE_FECHADA`, sem escritas.
 *     `estornarLancamento` genérico de um AB automático → BusinessRuleError `LANCAMENTO_DE_ABERTURA`.
 *   §7 reposto: `encerrarExercicio(N+1)` com anterior e SEM AB efectivo → impedimento
 *     `ABERTURA_EM_FALTA` (ao lado de `EXERCICIO_ANTERIOR_ABERTO` quando se aplica).
 *   Depois de T1, `gerarBalanceteVerificacao` de N+1 usa o AB (sem abertura implícita): o
 *     acumulado de uma conta de balanço = fecho de N + movimento de N+1; o 88 mostra o resultado
 *     de N credor em N+1 (pronto para o #364).
 *
 * Cenário (serviços reais; meses de 2026 fechados por escrita crua do estado, como no oráculo N3 —
 * `fecharPeriodo` exige o apuramento do IVA de cada mês, alheio ao que está em teste):
 *   2026  Mar D 111 / C 711 1000 · Abr D 622 / C 111 300 · Mai D 121 / C 521 2000 (capital)
 *   Encerrado com estimativa 100 ⇒ 111 = 700 D · 121 = 2000 D · 521 = 2000 C · 4411 = 100 C · 88 = 600 C
 *   AB(2027): D 111 700 · D 121 2000 / C 521 2000 · C 4411 100 · C 88 600
 *
 * Cada caso monta o seu próprio tenant. Requer: Docker + @testcontainers/postgresql.
 * SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type AnyDb = any;
type Ctx = { tenantId: string; userId: string };

type ResultadoEncerramento =
  | { ok: true; encerramento: Record<string, unknown> & { id: string; versao: number } }
  | { ok: false; impedimentos: string[] };

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);

const CODIGOS = ['111', '121', '521', '622', '711', '4411', '81', '83', '851', '88'] as const;
type Codigo = (typeof CODIGOS)[number];

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MOTIVO = 'Ajustamento da revisão de contas: provisão em falta em Dezembro';

/** A mesma partida com o tipo trocado (o estorno). */
const inverter = (x: string) => {
  const [codigo, tipo, valor] = x.split(':');
  return `${codigo}:${tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO'}:${valor}`;
};

/** O AB esperado do cenário, por conta: `codigo:TIPO:valor`, ordenado. */
const AB_ESPERADO = ['111:DEBITO:700.00', '121:DEBITO:2000.00', '4411:CREDITO:100.00', '521:CREDITO:2000.00', '88:CREDITO:600.00'];

describe.skipIf(skip)('Abertura automática do exercício seguinte (#363, ADR-0035 §6/§7) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let enc: typeof import('@/server/services/financas/encerramento-exercicio.service');
  let iva: typeof import('@/server/services/financas/apuramento-iva.service');
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const TS = Date.now();
  let seq = 0;

  interface Tenant {
    ctx: Ctx;
    conta: Record<Codigo, string>;
    ex26: { id: string; dataFim: Date };
  }

  async function novoTenant(): Promise<Tenant> {
    seq += 1;
    const tenantId = `tenant-abs-${TS}-${seq}`;
    const userId = `user-abs-${TS}-${seq}`;
    const slug = `abs-${TS}-${seq}`;
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

    const ctx = { tenantId, userId };
    await runCtx(ctx, () => contab.abrirExercicio({ ano: 2026 }, ctx));
    const ex26 = await db.exercicioContabil.findFirst({ where: { tenantId, codigo: '2026' } });
    expect(ex26.anteriorId, 'pré-condição: 2026 é o primeiro exercício').toBeNull();
    return { ctx, conta, ex26 };
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
            documentoOrigemId: `doc-abs-${++doc}`,
            documentoOrigemTipo: 'TesteAberturaSeguinte',
            historico: `Teste abertura seguinte ${debito}/${credito} ${valor}`,
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

  /** Cenário de 2026 lançado e os doze meses fechados (estado cru). */
  async function cenario2026(t: Tenant) {
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '1000');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '121', '521', '2000');
    await fecharMeses(t.ctx, t.ex26.id, MESES);
  }

  async function fecharMeses(ctx: Ctx, exercicioId: string, ordens: number[]) {
    await db.periodoContabil.updateMany({
      where: { tenantId: ctx.tenantId, exercicioId, ordem: { in: ordens } },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: ctx.userId },
    });
  }

  async function abrir2027(t: Tenant) {
    await runCtx(t.ctx, () => contab.abrirExercicio({ ano: 2027 }, t.ctx));
    return exercicio2027(t);
  }

  async function exercicio2027(t: Tenant) {
    const ex = await db.exercicioContabil.findFirst({ where: { tenantId: t.ctx.tenantId, codigo: '2027' } });
    expect(ex, 'pré-condição: o exercício 2027 existe').toBeTruthy();
    expect(ex.anteriorId, 'pré-condição: 2027 encadeia em 2026').toBe(t.ex26.id);
    return ex;
  }

  async function periodo(ctx: Ctx, exercicioId: string, ordem: number) {
    return db.periodoContabil.findFirst({ where: { tenantId: ctx.tenantId, exercicioId, ordem } });
  }

  async function estadoExercicio(ctx: Ctx, exercicioId: string) {
    return (await db.exercicioContabil.findFirst({ where: { id: exercicioId, tenantId: ctx.tenantId } })).estado;
  }

  async function encerrar(t: Tenant, exercicioId: string, estimativaImposto = '100'): Promise<ResultadoEncerramento> {
    return enc.encerrarExercicio({ exercicioId, estimativaImposto }, t.ctx) as Promise<ResultadoEncerramento>;
  }

  async function encerrar2026(t: Tenant) {
    const r = await encerrar(t, t.ex26.id);
    expect('impedimentos' in r ? r.impedimentos : [], 'pré-condição: 2026 encerra').toEqual([]);
    expect(r.ok).toBe(true);
    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ENCERRADO_PROVISORIO');
    return r;
  }

  /** Todos os lançamentos do diário ABERTURA no exercício (originais e estornos). */
  async function lancamentosAB(ctx: Ctx, exercicioId: string) {
    return db.lancamento.findMany({
      where: { tenantId: ctx.tenantId, diario: { tipo: 'ABERTURA' }, periodo: { exercicioId } },
      include: { partidas: true, periodo: true, diario: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** AB efectivo: LANCADO, não estornado e não estorno. */
  async function abEfectivos(ctx: Ctx, exercicioId: string) {
    return (await lancamentosAB(ctx, exercicioId)).filter(
      (l: AnyDb) => l.status === 'LANCADO' && l.lancamentoEstornoId === null,
    );
  }

  /** Partidas agregadas por (conta, tipo), como `codigo:TIPO:valor`, ordenadas. */
  async function partidasTexto(ctx: Ctx, partidas: AnyDb[]): Promise<string[]> {
    const contas = await db.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, id: { in: partidas.map((p) => p.contaId) } },
      select: { id: true, codigo: true },
    });
    const codigo = new Map(contas.map((c: AnyDb) => [c.id, c.codigo]));
    const somas = new Map<string, Prisma.Decimal>();
    for (const p of partidas) {
      const k = `${codigo.get(p.contaId)}:${p.tipo}`;
      somas.set(k, (somas.get(k) ?? dec(0)).plus(dec(p.valor)));
    }
    return [...somas.entries()].map(([k, v]) => `${k}:${f2(v)}`).sort();
  }

  /** O único AB efectivo de 2027, com a forma e os valores esperados. */
  async function exigirAB(t: Tenant, ex27: AnyDb, esperado: string[] = AB_ESPERADO) {
    const efectivos = await abEfectivos(t.ctx, ex27.id);
    expect(efectivos, 'exactamente um AB efectivo em 2027').toHaveLength(1);
    const ab = efectivos[0];
    expect(ab.diario.tipo).toBe('ABERTURA');
    expect(ab.periodo.ordem, 'o AB fica no período 1').toBe(1);
    expect(ab.periodo.exercicioId).toBe(ex27.id);
    expect(ab.data.getTime(), 'data = dataInicio de 2027').toBe(ex27.dataInicio.getTime());
    expect(ab.documentoOrigemTipo).toBe('ExercicioContabil');
    expect(ab.documentoOrigemId, 'origem = o exercício 2026').toBe(t.ex26.id);
    expect(await partidasTexto(t.ctx, ab.partidas)).toEqual(esperado);
    const d = ab.partidas.filter((p: AnyDb) => p.tipo === 'DEBITO').reduce((a: Prisma.Decimal, p: AnyDb) => a.plus(dec(p.valor)), dec(0));
    const c = ab.partidas.filter((p: AnyDb) => p.tipo === 'CREDITO').reduce((a: Prisma.Decimal, p: AnyDb) => a.plus(dec(p.valor)), dec(0));
    expect(f2(d), 'AB equilibrado').toBe(f2(c));
    return ab;
  }

  /** 2026 encerrado com 2027 criado antes (T1). */
  async function cenarioT1() {
    const t = await novoTenant();
    await cenario2026(t);
    const ex27 = await abrir2027(t);
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: sem AB enquanto 2026 está ABERTO').toHaveLength(0);
    await encerrar2026(t);
    const ab = await exigirAB(t, ex27);
    return { t, ex27, ab };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    enc = await import('@/server/services/financas/encerramento-exercicio.service');
    iva = await import('@/server/services/financas/apuramento-iva.service');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
  });

  // -------------------------------------------------------------------------
  // T1 — encerrar N com N+1 já existente
  // -------------------------------------------------------------------------

  it('T1: encerrar 2026 com 2027 já aberto gera o AB de 2027 com os saldos de fecho', async () => {
    const { t, ex27 } = await cenarioT1();
    // Só um lançamento no diário ABERTURA de 2027 — nada de estornos nem duplicados.
    expect(await lancamentosAB(t.ctx, ex27.id)).toHaveLength(1);
    expect(await lancamentosAB(t.ctx, t.ex26.id), '2026 é o primeiro exercício: sem AB automático').toHaveLength(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // T2 — N+1 criado depois do encerramento de N
  // -------------------------------------------------------------------------

  it('T2a: abrirExercicio(2027) depois do encerramento de 2026 gera o AB (e repetir não duplica)', async () => {
    const t = await novoTenant();
    await cenario2026(t);
    await encerrar2026(t);
    expect(await db.exercicioContabil.count({ where: { tenantId: t.ctx.tenantId, codigo: '2027' } })).toBe(0);

    const ex27 = await abrir2027(t);
    await exigirAB(t, ex27);

    // abrirExercicio é idempotente: a segunda chamada não cria um segundo AB.
    await runCtx(t.ctx, () => contab.abrirExercicio({ ano: 2027 }, t.ctx));
    expect(await lancamentosAB(t.ctx, ex27.id)).toHaveLength(1);
  }, 120_000);

  it('T2b: um lançamento datado de 2027 cria o exercício e o AB fica presente', async () => {
    const t = await novoTenant();
    await cenario2026(t);
    await encerrar2026(t);
    expect(await db.exercicioContabil.count({ where: { tenantId: t.ctx.tenantId, codigo: '2027' } })).toBe(0);

    const l = await lancar(t.ctx, '2027-01-15T10:00:00Z', '111', '711', '50');
    const ex27 = await exercicio2027(t);
    expect((l as AnyDb).periodoId, 'pré-condição: o lançamento cai em Janeiro de 2027').toBe((await periodo(t.ctx, ex27.id, 1)).id);
    await exigirAB(t, ex27);
  }, 120_000);

  // -------------------------------------------------------------------------
  // T3 — reabrir N estorna o AB de N+1
  // -------------------------------------------------------------------------

  it('T3: reabrir 2026 estorna o AB de 2027 no diário ABERTURA, período 1 de 2027; 2027 fica sem AB efectivo', async () => {
    const { t, ex27, ab } = await cenarioT1();
    const p1 = await periodo(t.ctx, ex27.id, 1);

    await enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO }, t.ctx);

    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ABERTO');
    const original = await db.lancamento.findFirst({ where: { id: ab.id, tenantId: t.ctx.tenantId } });
    expect(original.status, 'o AB de 2027 fica ESTORNADO').toBe('ESTORNADO');

    const estornos = await db.lancamento.findMany({
      where: { tenantId: t.ctx.tenantId, lancamentoEstornoId: ab.id },
      include: { diario: true },
    });
    expect(estornos, 'um estorno do AB').toHaveLength(1);
    const e = estornos[0];
    expect(e.status).toBe('LANCADO');
    expect(e.tipo).toBe('ESTORNO');
    expect(e.diario.tipo, 'o estorno fica no diário ABERTURA').toBe('ABERTURA');
    expect(e.periodoId, 'o estorno vai para o período 1 de 2027, não para o mês de hoje').toBe(p1.id);
    expect(e.data.getTime()).toBeGreaterThanOrEqual(p1.dataInicio.getTime());
    expect(e.data.getTime()).toBeLessThanOrEqual(p1.dataFim.getTime());
    expect(await partidasTexto(t.ctx, (await db.partidaLancamento.findMany({ where: { tenantId: t.ctx.tenantId, lancamentoId: e.id } })))).toEqual(
      AB_ESPERADO.map(inverter).sort(),
    );

    expect(await abEfectivos(t.ctx, ex27.id), '2027 sem AB efectivo').toHaveLength(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // T4 — re-encerrar N regera o AB
  // -------------------------------------------------------------------------

  it('T4: re-encerrar 2026 depois de um ajustamento em Dezembro gera um AB novo que o reflecte', async () => {
    const { t, ex27, ab } = await cenarioT1();
    await enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO }, t.ctx);

    // Dezembro reaberto pelo serviço, ajustamento, IVA apurado, fechado outra vez.
    const p12 = await periodo(t.ctx, t.ex26.id, 12);
    await contab.reabrirPeriodo({ id: p12.id, motivo: 'Ajustamento de revisão em Dezembro' }, t.ctx);
    const ajuste = await lancar(t.ctx, '2026-12-10T10:00:00Z', '111', '711', '50');
    expect((ajuste as AnyDb).periodoId, 'pré-condição: o ajustamento cai em Dezembro').toBe(p12.id);
    await iva.apurarIva({ periodoId: p12.id }, t.ctx);
    const fecho = await contab.fecharPeriodo({ id: p12.id }, t.ctx);
    expect('impedimentos' in fecho ? fecho.impedimentos : [], 'pré-condição: Dezembro fecha').toEqual([]);

    await encerrar2026(t);

    // 111 = 700 + 50; 88 = 1050 − 300 − 100 = 650.
    const novo = await exigirAB(t, ex27, [
      '111:DEBITO:750.00',
      '121:DEBITO:2000.00',
      '4411:CREDITO:100.00',
      '521:CREDITO:2000.00',
      '88:CREDITO:650.00',
    ]);
    expect(novo.id).not.toBe(ab.id);
    expect((await db.lancamento.findFirst({ where: { id: ab.id, tenantId: t.ctx.tenantId } })).status).toBe('ESTORNADO');
    expect(await lancamentosAB(t.ctx, ex27.id), 'AB original + o seu estorno + AB novo').toHaveLength(3);
  }, 120_000);

  it('o encerramento definitivo de 2026 não toca no AB de 2027', async () => {
    const { t, ex27, ab } = await cenarioT1();
    await enc.encerrarExercicioDefinitivo({ exercicioId: t.ex26.id }, t.ctx);

    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ENCERRADO');
    const depois = await exigirAB(t, ex27);
    expect(depois.id).toBe(ab.id);
    expect(await lancamentosAB(t.ctx, ex27.id)).toHaveLength(1);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Recusas
  // -------------------------------------------------------------------------

  it('reabrir 2026 com um período de 2027 FECHADO lança EXERCICIO_SEGUINTE_COM_PERIODO_FECHADO e nada muda', async () => {
    const { t, ex27, ab } = await cenarioT1();
    await fecharMeses(t.ctx, ex27.id, [1, 2]);
    const encAntes = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex26.id } });
    const lancamentosAntes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'EXERCICIO_SEGUINTE_COM_PERIODO_FECHADO',
    });

    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ENCERRADO_PROVISORIO');
    expect((await periodo(t.ctx, t.ex26.id, 13)).estado).toBe('FECHADO');
    expect((await db.encerramentoExercicio.findFirst({ where: { id: encAntes.id, tenantId: t.ctx.tenantId } })).anuladoEm).toBeNull();
    expect((await db.lancamento.findFirst({ where: { id: ab.id, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } }), 'nenhum lançamento novo').toBe(lancamentosAntes);
    expect(await db.reaberturaExercicio.count({ where: { tenantId: t.ctx.tenantId } })).toBe(0);
  }, 120_000);

  it('encerrar 2026 com 2027 existente e o seu período 1 FECHADO devolve ABERTURA_SEGUINTE_FECHADA, sem escritas', async () => {
    const t = await novoTenant();
    await cenario2026(t);
    const ex27 = await abrir2027(t);
    await fecharMeses(t.ctx, ex27.id, [1]);
    const lancamentosAntes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    const r = await encerrar(t, t.ex26.id);

    expect(r.ok).toBe(false);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual(['ABERTURA_SEGUINTE_FECHADA']);
    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ABERTO');
    expect((await periodo(t.ctx, t.ex26.id, 13)).estado).toBe('ABERTO');
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } }), 'nenhum lançamento novo').toBe(lancamentosAntes);
    expect(await db.encerramentoExercicio.count({ where: { tenantId: t.ctx.tenantId } })).toBe(0);
  }, 120_000);

  it('o estorno genérico de um AB automático lança LANCAMENTO_DE_ABERTURA', async () => {
    const { t, ex27, ab } = await cenarioT1();
    const lancamentosAntes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    for (const { rotulo, data } of [
      { rotulo: 'com data de Janeiro de 2027', data: new Date('2027-01-15T10:00:00Z') },
      { rotulo: 'sem data (hoje)', data: undefined },
    ]) {
      await expect(
        contab.estornarLancamento({ lancamentoId: ab.id, motivo: 'Estorno pela rota genérica', ...(data ? { data } : {}) }, t.ctx),
        `estorno genérico ${rotulo}`,
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'LANCAMENTO_DE_ABERTURA' });
    }

    expect((await db.lancamento.findFirst({ where: { id: ab.id, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } }), 'nenhum lançamento novo').toBe(lancamentosAntes);
    await exigirAB(t, ex27);
  }, 120_000);

  // -------------------------------------------------------------------------
  // §7 reposto — ABERTURA_EM_FALTA
  // -------------------------------------------------------------------------

  it('encerrar 2027 depois de reabrir 2026 (AB estornado) devolve ABERTURA_EM_FALTA e EXERCICIO_ANTERIOR_ABERTO', async () => {
    const { t, ex27 } = await cenarioT1();
    await enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO }, t.ctx);
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: 2027 sem AB efectivo').toHaveLength(0);
    await fecharMeses(t.ctx, ex27.id, MESES);
    const lancamentosAntes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    const r = await encerrar(t, ex27.id, '0');

    expect(r.ok).toBe(false);
    expect(('impedimentos' in r ? [...r.impedimentos] : []).sort()).toEqual(['ABERTURA_EM_FALTA', 'EXERCICIO_ANTERIOR_ABERTO']);
    expect(await estadoExercicio(t.ctx, ex27.id)).toBe('ABERTO');
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(lancamentosAntes);
  }, 120_000);

  it('encerrar 2027 com 2026 encerrado antes do #363 (sem AB em 2027) devolve só ABERTURA_EM_FALTA', async () => {
    const t = await novoTenant();
    await cenario2026(t);
    const ex27 = await abrir2027(t);
    // Um encerramento feito antes desta funcionalidade: 2026 ENCERRADO_PROVISORIO e 2027 sem AB.
    await db.exercicioContabil.update({ where: { id: t.ex26.id }, data: { estado: 'ENCERRADO_PROVISORIO' } });
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: 2027 sem AB').toHaveLength(0);
    await fecharMeses(t.ctx, ex27.id, MESES);

    const r = await encerrar(t, ex27.id, '0');

    expect(r.ok).toBe(false);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual(['ABERTURA_EM_FALTA']);
    expect(await estadoExercicio(t.ctx, ex27.id)).toBe('ABERTO');
    expect(await db.encerramentoExercicio.count({ where: { tenantId: t.ctx.tenantId, exercicioId: ex27.id } })).toBe(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Balancete de verificação de N+1
  // -------------------------------------------------------------------------

  it('o balancete de verificação de 2027 usa o AB: sem abertura implícita, acumulado = fecho de 2026 + movimento de 2027', async () => {
    const { t, ex27 } = await cenarioT1();
    await lancar(t.ctx, '2027-02-10T10:00:00Z', '111', '711', '200');

    const bv = (periodoFinal: number) =>
      runCtx(t.ctx, () =>
        contab.gerarBalanceteVerificacao({ exercicioId: ex27.id, periodoInicial: 1, periodoFinal, incluir13: false }, t.ctx),
      );
    const linha = (r: AnyDb, codigo: string) => r.linhas.find((l: AnyDb) => l.conta?.codigo === codigo);

    const ano = await bv(12);
    expect(ano.temAberturaImplicita, 'com AB não há abertura implícita').toBe(false);
    expect(ano.temResultadosAnterioresPorEncerrar).toBe(false);
    expect(ano.equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
    expect(f2(linha(ano, '111')?.saldoDevedor), '111 = 700 + 200').toBe('900.00');
    expect(f2(linha(ano, '121')?.saldoDevedor)).toBe('2000.00');
    expect(f2(linha(ano, '521')?.saldoCredor)).toBe('2000.00');
    expect(f2(linha(ano, '4411')?.saldoCredor)).toBe('100.00');
    expect(f2(linha(ano, '88')?.saldoCredor), 'o resultado de 2026 em 88, credor').toBe('600.00');
    expect(f2(linha(ano, '711')?.saldoCredor), 'só o movimento de 2027 na classe 7').toBe('200.00');
    expect(linha(ano, '622'), '622 saldada no encerramento: sem linha em 2027').toBeUndefined();

    // O AB é movimento do período 1.
    const janeiro = await bv(1);
    expect(f2(linha(janeiro, '111')?.movD)).toBe('700.00');
    expect(f2(linha(janeiro, '88')?.movC)).toBe('600.00');
    expect(janeiro.temAberturaImplicita).toBe(false);
  }, 120_000);
  // -------------------------------------------------------------------------
  // Emenda da revisão (coordenador): ano a zero, re-encadeamento, origem reservada
  // -------------------------------------------------------------------------

  it('ano a zero: 2026 sem movimento encerra sem AB em 2027, e encerrar 2027 não reporta ABERTURA_EM_FALTA', async () => {
    const t = await novoTenant();
    await fecharMeses(t.ctx, t.ex26.id, MESES);
    const ex27 = await abrir2027(t);

    const r26 = await encerrar(t, t.ex26.id, '0');
    expect('impedimentos' in r26 ? r26.impedimentos : [], 'pré-condição: o ano a zero encerra (P1)').toEqual([]);
    expect(r26.ok).toBe(true);
    expect(await lancamentosAB(t.ctx, ex27.id), 'sem saldos de balanço não há AB').toHaveLength(0);

    await fecharMeses(t.ctx, ex27.id, MESES);
    const r27 = await encerrar(t, ex27.id, '0');
    const impedimentos = 'impedimentos' in r27 ? r27.impedimentos : [];
    expect(impedimentos, 'um AB vazio não é um AB em falta').not.toContain('ABERTURA_EM_FALTA');
    expect(impedimentos).toEqual([]);
    expect(r27.ok).toBe(true);
    expect(await estadoExercicio(t.ctx, ex27.id)).toBe('ENCERRADO_PROVISORIO');
  }, 120_000);

  it('criar 2025 depois não re-encadeia 2026: o AB manual do primeiro exercício continua a contar e o encerramento não o recusa', async () => {
    const t = await novoTenant();
    const diarioAB = await db.diario.findFirst({ where: { tenantId: t.ctx.tenantId, tipo: 'ABERTURA' } });
    const ex26 = await db.exercicioContabil.findFirst({ where: { id: t.ex26.id, tenantId: t.ctx.tenantId } });

    // Saldos iniciais de quem migra: AB manual no primeiro exercício, pelo serviço real, confirmado.
    const manual = await runCtx(t.ctx, () =>
      contab.criarLancamento(
        {
          data: ex26.dataInicio,
          diarioId: diarioAB.id,
          origem: 'MANUAL',
          historico: 'Saldos iniciais (migração)',
          partidas: [
            { contaId: t.conta['111'], tipo: 'DEBITO', valor: 500 },
            { contaId: t.conta['521'], tipo: 'CREDITO', valor: 500 },
          ],
        },
        t.ctx,
      ),
    );
    await runCtx(t.ctx, () => contab.confirmarLancamento(manual.id, t.ctx));
    expect((await db.lancamento.findFirst({ where: { id: manual.id, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');

    // Um lançamento datado de 2025 cria 2025 pela rede de segurança.
    await lancar(t.ctx, '2025-06-15T10:00:00Z', '111', '711', '10');
    const ex25 = await db.exercicioContabil.findFirst({ where: { tenantId: t.ctx.tenantId, codigo: '2025' } });
    expect(ex25, 'pré-condição: 2025 criado').toBeTruthy();

    const depois = await db.exercicioContabil.findFirst({ where: { id: t.ex26.id, tenantId: t.ctx.tenantId } });
    expect(depois.anteriorId, '2026 não é re-encadeado em 2025').toBeNull();

    const balancete = await runCtx(t.ctx, () =>
      contab.gerarBalancete(
        {
          dataInicio: new Date('2026-01-01T00:00:00.000+02:00'),
          dataFim: new Date('2026-12-31T23:59:59.999+02:00'),
          incluirZeradas: false,
        },
        t.ctx,
      ),
    );
    const c = (codigo: string) => balancete.contas.find((l: AnyDb) => l.conta.codigo === codigo);
    expect(f2(c('111')?.debitos), 'o AB manual de 2026 continua no balancete por datas').toBe('500.00');
    expect(f2(c('521')?.creditos)).toBe('500.00');

    await fecharMeses(t.ctx, t.ex26.id, MESES);
    const r = await encerrar(t, t.ex26.id, '0');
    const impedimentos = 'impedimentos' in r ? r.impedimentos : [];
    expect(impedimentos).not.toContain('EXERCICIO_ANTERIOR_ABERTO');
    expect(impedimentos).not.toContain('ABERTURA_EM_FALTA');
  }, 120_000);

  it('um lançamento manual com documentoOrigemTipo ExercicioContabil é recusado com DOCUMENTO_ORIGEM_RESERVADO', async () => {
    const t = await novoTenant();
    const diario = await db.diario.findFirst({ where: { tenantId: t.ctx.tenantId, tipo: 'OPERACOES' } });
    const { CriarLancamentoSchema } = await import('@/lib/validations/contabilidade');

    // O schema da action deixa passar o campo: a recusa tem de estar no serviço.
    const parsed = CriarLancamentoSchema.safeParse({
      data: '2026-03-15T10:00:00Z',
      diarioId: diario.id,
      documentoOrigemTipo: 'ExercicioContabil',
      documentoOrigemId: t.ex26.id,
      historico: 'Abertura forjada à mão',
      partidas: [
        { contaId: t.conta['111'], tipo: 'DEBITO', valor: 10 },
        { contaId: t.conta['711'], tipo: 'CREDITO', valor: 10 },
      ],
    });
    expect(parsed.success, `pré-condição: o schema aceita a entrada (${parsed.success ? '' : JSON.stringify(parsed.error.flatten())})`).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.documentoOrigemTipo, 'pré-condição: o schema não remove o campo').toBe('ExercicioContabil');
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(runCtx(t.ctx, () => contab.criarLancamento(parsed.data, t.ctx))).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'DOCUMENTO_ORIGEM_RESERVADO',
    });
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } }), 'nenhum lançamento escrito').toBe(antes);
  }, 120_000);
});
