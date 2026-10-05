/**
 * Oráculo P1-v (issue #366 parte A, ADR-0035 §8) — trilho de auditoria das transições do
 * exercício e encerramento de um ano com resultado zero.
 *
 * Contrato (fixado pelo orquestrador; não se reabre aqui), em
 * `src/server/services/financas/encerramento-exercicio.service.ts`:
 *
 * 1. AuditLog explícito, na MESMA transacção (os serviços escrevem por `prismaBase`, que não
 *    passa pela `audit-extension`):
 *    - encerrarExercicio → `{ entity: 'ExercicioContabil', entityId: exercicioId, action: 'UPDATE',
 *      data: { before: { estado: 'ABERTO' }, after: { estado: 'ENCERRADO_PROVISORIO' } } }` e
 *      `{ entity: 'EncerramentoExercicio', entityId: <id>, action: 'CREATE' }`;
 *    - reabrirExercicio → ExercicioContabil UPDATE ENCERRADO_PROVISORIO→ABERTO e
 *      `{ entity: 'ReaberturaExercicio', entityId: <id>, action: 'CREATE' }`;
 *    - encerrarExercicioDefinitivo → ExercicioContabil UPDATE ENCERRADO_PROVISORIO→ENCERRADO.
 *    Cada linha leva `tenantId`, `userId = ctx.userId`, `keycloakSub` do utilizador e o `requestId`
 *    do contexto de pedido (aqui montado com `runWithRequestContext`). Chamadas recusadas
 *    (impedimentos, TRANSICAO_INVALIDA) não escrevem linha nenhuma para estas entidades.
 *
 * 2. Resultado zero — `SEM_RESULTADOS_A_APURAR` deixou de existir:
 *    (a) sem movimento 6/7: `{ ok: true }`, nenhum lançamento EN, as três referências de lançamento
 *        nulas, fotografia = movimento dos períodos 1..12, ENCERRADO_PROVISORIO, período 13 FECHADO;
 *    (b) movimento 6/7 que se anula (D 622 / C 111 300 · D 111 / C 711 300), estimativa 0: o
 *        lançamento dos resultados existe e está equilibrado (711 debitada 300, 622 creditada 300),
 *        sem lançamento do líquido; 711, 622, 81, 83 e 88 acabam a zero;
 *    (c) a reabertura funciona nos dois — estorna só os lançamentos que existem,
 *        `lancamentosEstornados` lista exactamente esses — e re-encerrar dá a versão 2.
 *
 * Os períodos 1..12 são fechados directamente pelo client cru (como nos oráculos N3/N4):
 * `fecharPeriodo` exige o apuramento do IVA de cada mês, alheio ao que está em teste.
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
type EncerrarExercicio = (
  input: { exercicioId: string; estimativaImposto: string },
  ctx: Ctx,
) => Promise<ResultadoEncerramento>;
type ReabrirExercicio = (
  input: { exercicioId: string; motivo: string },
  ctx: Ctx,
) => Promise<Record<string, unknown> & { id: string }>;
type EncerrarExercicioDefinitivo = (input: { exercicioId: string }, ctx: Ctx) => Promise<unknown>;

async function carregar<T>(nome: 'encerrarExercicio' | 'reabrirExercicio' | 'encerrarExercicioDefinitivo'): Promise<T> {
  const caminho = '@/server/services/financas/encerramento-exercicio.service';
  let modulo: Record<string, unknown> | undefined;
  let erro = '';
  try {
    modulo = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  expect(
    typeof modulo?.[nome],
    `encerramento-exercicio.service exporta ${nome}${erro ? ` (import falhou: ${erro})` : ''}`,
  ).toBe('function');
  return modulo![nome] as T;
}

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);

const CODIGOS = ['111', '121', '622', '6911', '711', '7811', '81', '82', '83', '851', '88', '4411'] as const;
type Codigo = (typeof CODIGOS)[number];

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MOTIVO = 'Ajustamento da revisão de contas: provisão em falta em Dezembro';
const ENTIDADES = ['ExercicioContabil', 'EncerramentoExercicio', 'ReaberturaExercicio'];

describe.skipIf(skip)('Auditoria das transições do exercício e ano de resultado zero (#366) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let runReq: (typeof import('@/server/observability/context'))['runWithRequestContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  let encerrar: EncerrarExercicio;
  let reabrir: ReabrirExercicio;
  let definitivo: EncerrarExercicioDefinitivo;

  const TS = Date.now();
  let seq = 0;

  interface Tenant {
    ctx: Ctx;
    conta: Record<Codigo, string>;
    keycloakSub: string;
  }

  async function novoTenant(): Promise<Tenant> {
    seq += 1;
    const tenantId = `tenant-p1-${TS}-${seq}`;
    const userId = `user-p1-${TS}-${seq}`;
    const slug = `p1-${TS}-${seq}`;
    const keycloakSub = `kc-${slug}`;
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${String(TS).slice(-7)}${String(seq).padStart(2, '0')}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `${slug}@test.mz`, nome: 'Contabilista', keycloakSub },
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
    return { ctx: { tenantId, userId }, conta, keycloakSub };
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
            documentoOrigemId: `doc-p1-${++doc}`,
            documentoOrigemTipo: 'TesteP1',
            historico: `Teste P1 ${debito}/${credito} ${valor}`,
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

  async function exercicio2026(ctx: Ctx) {
    const ex = await db.exercicioContabil.findFirst({ where: { tenantId: ctx.tenantId, codigo: '2026' } });
    expect(ex, 'pré-condição: o exercício 2026 existe').toBeTruthy();
    return ex;
  }

  async function fecharMeses(ctx: Ctx, exercicioId: string, ordens: number[]) {
    await db.periodoContabil.updateMany({
      where: { tenantId: ctx.tenantId, exercicioId, ordem: { in: ordens } },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: ctx.userId },
    });
  }

  async function exercicioAgora(ctx: Ctx, exercicioId: string) {
    return db.exercicioContabil.findFirst({ where: { id: exercicioId, tenantId: ctx.tenantId } });
  }

  async function periodo13(ctx: Ctx, exercicioId: string) {
    return db.periodoContabil.findFirst({ where: { tenantId: ctx.tenantId, exercicioId, ordem: 13 } });
  }

  async function lancamentosEN(ctx: Ctx) {
    return db.lancamento.findMany({ where: { tenantId: ctx.tenantId, diario: { tipo: 'ENCERRAMENTO' } } });
  }

  /** Saldo D − C por conta, sobre os lançamentos LANCADO/ESTORNADO dos períodos indicados. */
  async function saldos(ctx: Ctx, exercicioId: string, ordens: number[]): Promise<Map<string, Prisma.Decimal>> {
    const linhas = await db.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: {
        tenantId: ctx.tenantId,
        lancamento: { status: { in: ['LANCADO', 'ESTORNADO'] }, periodo: { exercicioId, ordem: { in: ordens } } },
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
    expect(partidas.length, `lançamento ${lancamentoId} tem partidas`).toBeGreaterThan(0);
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

  /** Linhas de AuditLog do tenant para as entidades do exercício, por ordem de criação. */
  async function auditoria(ctx: Ctx) {
    return db.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entity: { in: ENTIDADES } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Corre `fn` com um contexto de pedido cujo requestId o teste conhece. */
  function comPedido<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
    return runReq({ requestId }, fn);
  }

  function metadados(t: Tenant, requestId: string) {
    return { tenantId: t.ctx.tenantId, userId: t.ctx.userId, keycloakSub: t.keycloakSub, requestId };
  }

  /** Cenário dos oráculos N3/N4: corrente 670 — um ano com resultado, para isolar a auditoria. */
  async function cenarioComResultado() {
    const t = await novoTenant();
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '1000');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '6911', '121', '50');
    await lancar(t.ctx, '2026-06-15T10:00:00Z', '121', '7811', '20');
    const ex = await exercicio2026(t.ctx);
    return { ...t, ex };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ runWithRequestContext: runReq } = await import('@/server/observability/context'));
    contab = await import('@/server/services/financas/contabilidade.service');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
    encerrar = await carregar<EncerrarExercicio>('encerrarExercicio');
    reabrir = await carregar<ReabrirExercicio>('reabrirExercicio');
    definitivo = await carregar<EncerrarExercicioDefinitivo>('encerrarExercicioDefinitivo');
  });

  // =========================================================================
  // 1. Auditoria das transições
  // =========================================================================

  it('encerrar escreve AuditLog ExercicioContabil UPDATE ABERTO→ENCERRADO_PROVISORIO e EncerramentoExercicio CREATE', async () => {
    const t = await cenarioComResultado();
    await fecharMeses(t.ctx, t.ex.id, MESES);
    expect(await auditoria(t.ctx), 'pré-condição: nenhuma linha antes').toHaveLength(0);

    const req = `req-p1-enc-${TS}-${seq}`;
    const r = await comPedido(req, () => encerrar({ exercicioId: t.ex.id, estimativaImposto: '100' }, t.ctx));
    expect(r.ok).toBe(true);
    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id } });

    const linhas = await auditoria(t.ctx);
    const doExercicio = linhas.filter((l: AnyDb) => l.entity === 'ExercicioContabil');
    const doEncerramento = linhas.filter((l: AnyDb) => l.entity === 'EncerramentoExercicio');
    expect(doExercicio, 'uma linha ExercicioContabil').toHaveLength(1);
    expect(doEncerramento, 'uma linha EncerramentoExercicio').toHaveLength(1);

    expect(doExercicio[0]).toMatchObject({
      ...metadados(t, req),
      entityId: t.ex.id,
      action: 'UPDATE',
      data: { before: { estado: 'ABERTO' }, after: { estado: 'ENCERRADO_PROVISORIO' } },
    });
    expect(doEncerramento[0]).toMatchObject({ ...metadados(t, req), entityId: enc.id, action: 'CREATE' });
  }, 120_000);

  it('reabrir escreve AuditLog ExercicioContabil UPDATE ENCERRADO_PROVISORIO→ABERTO e ReaberturaExercicio CREATE', async () => {
    const t = await cenarioComResultado();
    await fecharMeses(t.ctx, t.ex.id, MESES);
    const r = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '100' }, t.ctx);
    expect(r.ok, 'pré-condição: o exercício encerra').toBe(true);
    const antes = (await auditoria(t.ctx)).map((l: AnyDb) => l.id);

    const req = `req-p1-reab-${TS}-${seq}`;
    const reab = await comPedido(req, () => reabrir({ exercicioId: t.ex.id, motivo: MOTIVO }, t.ctx));

    const novas = (await auditoria(t.ctx)).filter((l: AnyDb) => !antes.includes(l.id));
    const doExercicio = novas.filter((l: AnyDb) => l.entity === 'ExercicioContabil');
    const daReabertura = novas.filter((l: AnyDb) => l.entity === 'ReaberturaExercicio');
    expect(doExercicio, 'uma linha ExercicioContabil nova').toHaveLength(1);
    expect(daReabertura, 'uma linha ReaberturaExercicio').toHaveLength(1);
    expect(novas.filter((l: AnyDb) => l.entity === 'EncerramentoExercicio'), 'nenhum CREATE de encerramento').toHaveLength(0);

    expect(doExercicio[0]).toMatchObject({
      ...metadados(t, req),
      entityId: t.ex.id,
      action: 'UPDATE',
      data: { before: { estado: 'ENCERRADO_PROVISORIO' }, after: { estado: 'ABERTO' } },
    });
    expect(daReabertura[0]).toMatchObject({ ...metadados(t, req), entityId: reab.id, action: 'CREATE' });
  }, 120_000);

  it('encerrar em definitivo escreve AuditLog ExercicioContabil UPDATE ENCERRADO_PROVISORIO→ENCERRADO', async () => {
    const t = await cenarioComResultado();
    await fecharMeses(t.ctx, t.ex.id, MESES);
    const r = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '100' }, t.ctx);
    expect(r.ok, 'pré-condição: o exercício encerra').toBe(true);
    const antes = (await auditoria(t.ctx)).map((l: AnyDb) => l.id);

    const req = `req-p1-def-${TS}-${seq}`;
    await comPedido(req, () => definitivo({ exercicioId: t.ex.id }, t.ctx));
    expect((await exercicioAgora(t.ctx, t.ex.id)).estado, 'pré-condição: ENCERRADO').toBe('ENCERRADO');

    const novas = (await auditoria(t.ctx)).filter((l: AnyDb) => !antes.includes(l.id));
    expect(novas, 'exactamente uma linha nova').toHaveLength(1);
    expect(novas[0]).toMatchObject({
      ...metadados(t, req),
      entity: 'ExercicioContabil',
      entityId: t.ex.id,
      action: 'UPDATE',
      data: { before: { estado: 'ENCERRADO_PROVISORIO' }, after: { estado: 'ENCERRADO' } },
    });
  }, 120_000);

  it('chamadas recusadas (impedimentos, TRANSICAO_INVALIDA) não escrevem AuditLog destas entidades', async () => {
    const t = await cenarioComResultado();
    // Julho aberto → impedimento.
    await fecharMeses(t.ctx, t.ex.id, MESES.filter((m) => m !== 7));
    const recusado = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '100' }, t.ctx);
    expect(recusado.ok, 'pré-condição: recusado por impedimento').toBe(false);
    expect(await auditoria(t.ctx), 'impedimentos: nenhuma linha').toHaveLength(0);

    // Exercício ABERTO: reabrir e encerrar em definitivo são transições inválidas.
    await expect(reabrir({ exercicioId: t.ex.id, motivo: MOTIVO }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    await expect(definitivo({ exercicioId: t.ex.id }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    expect(await auditoria(t.ctx), 'TRANSICAO_INVALIDA: nenhuma linha').toHaveLength(0);

    // Depois de um encerramento com sucesso, uma segunda chamada é recusada e não acrescenta nada.
    await fecharMeses(t.ctx, t.ex.id, [7]);
    const ok = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '100' }, t.ctx);
    expect(ok.ok, 'pré-condição: o exercício encerra').toBe(true);
    const depoisDoSucesso = (await auditoria(t.ctx)).length;
    expect(depoisDoSucesso, 'pré-condição: o sucesso escreveu as duas linhas').toBe(2);
    await expect(encerrar({ exercicioId: t.ex.id, estimativaImposto: '100' }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    expect(await auditoria(t.ctx)).toHaveLength(depoisDoSucesso);
  }, 120_000);

  // =========================================================================
  // 2. Ano com resultado zero
  // =========================================================================

  /** (a) Só movimento de balanço: Mar D 111 / C 121 250. */
  async function cenarioSemResultados() {
    const t = await novoTenant();
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '121', '250');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);
    return { ...t, ex };
  }

  /** (b) Movimento 6/7 que se anula: Abr D 622 / C 111 300 · Mai D 111 / C 711 300. */
  async function cenarioResultadoNulo() {
    const t = await novoTenant();
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '111', '711', '300');
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);
    return { ...t, ex };
  }

  it('(a) sem movimento 6/7: encerra, sem lançamentos EN, referências nulas, fotografia dos 1..12', async () => {
    const t = await cenarioSemResultados();

    const r = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '0' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    expect(await lancamentosEN(t.ctx), 'nenhum lançamento de encerramento').toHaveLength(0);
    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id } });
    expect(enc).toBeTruthy();
    expect(enc.versao).toBe(1);
    expect(enc.lancamentoResultadosId).toBeNull();
    expect(enc.lancamentoImpostoId).toBeNull();
    expect(enc.lancamentoLiquidoId).toBeNull();
    const foto = enc.fotografia as AnyDb[];
    expect(Array.isArray(foto)).toBe(true);
    expect(foto.map((x) => x.codigo).sort()).toEqual(['111', '121']);
    expect(f2(foto.find((x) => x.codigo === '111').saldoDevedor)).toBe('250.00');
    expect(f2(foto.find((x) => x.codigo === '121').saldoCredor)).toBe('250.00');

    expect((await exercicioAgora(t.ctx, t.ex.id)).estado).toBe('ENCERRADO_PROVISORIO');
    expect((await periodo13(t.ctx, t.ex.id)).estado).toBe('FECHADO');
  }, 120_000);

  it('(b) 6/7 a anular-se: lançamento dos resultados equilibrado, sem lançamento do líquido, 88 a zero', async () => {
    const t = await cenarioResultadoNulo();

    const r = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '0' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);

    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id } });
    expect(enc).toBeTruthy();
    expect(enc.lancamentoResultadosId).not.toBeNull();
    expect(enc.lancamentoImpostoId).toBeNull();
    expect(enc.lancamentoLiquidoId).toBeNull();

    const en = await lancamentosEN(t.ctx);
    expect(en.map((l: AnyDb) => l.id)).toEqual([enc.lancamentoResultadosId]);

    const l1 = await netoDoLancamento(t.ctx, enc.lancamentoResultadosId);
    expect(f2(l1.get(t.conta['711'])), '711 debitada 300').toBe('300.00');
    expect(f2(l1.get(t.conta['622'])), '622 creditada 300').toBe('-300.00');

    const todos = await saldos(t.ctx, t.ex.id, [...MESES, 13]);
    for (const codigo of ['711', '622', '81', '83', '88'] as const) {
      expect(f2(todos.get(t.conta[codigo])), `${codigo} acaba a zero`).toBe('0.00');
    }
    expect((await exercicioAgora(t.ctx, t.ex.id)).estado).toBe('ENCERRADO_PROVISORIO');
    expect((await periodo13(t.ctx, t.ex.id)).estado).toBe('FECHADO');
  }, 120_000);

  it('(c-a) reabrir um ano sem lançamentos EN: nada a estornar, lancamentosEstornados vazio; re-encerrar dá a versão 2', async () => {
    const t = await cenarioSemResultados();
    const r1 = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '0' }, t.ctx);
    expect(r1.ok, 'pré-condição: o exercício encerra').toBe(true);
    const enc1 = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id } });

    const reab = await reabrir({ exercicioId: t.ex.id, motivo: MOTIVO }, t.ctx);
    const linha = await db.reaberturaExercicio.findFirst({ where: { id: reab.id, tenantId: t.ctx.tenantId } });
    expect(linha.encerramentoId).toBe(enc1.id);
    expect([...linha.lancamentosEstornados]).toEqual([]);
    expect(await lancamentosEN(t.ctx), 'nenhum estorno').toHaveLength(0);
    expect((await db.encerramentoExercicio.findFirst({ where: { id: enc1.id, tenantId: t.ctx.tenantId } })).anuladoEm).toBeInstanceOf(Date);
    expect((await exercicioAgora(t.ctx, t.ex.id)).estado).toBe('ABERTO');
    expect((await periodo13(t.ctx, t.ex.id)).estado).toBe('ABERTO');

    const r2 = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '0' }, t.ctx);
    expect('impedimentos' in r2 ? r2.impedimentos : []).toEqual([]);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.encerramento.versao).toBe(2);
    const emVigor = await db.encerramentoExercicio.findMany({
      where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id, anuladoEm: null },
    });
    expect(emVigor.map((e: AnyDb) => e.versao)).toEqual([2]);
  }, 120_000);

  it('(c-b) reabrir um ano de resultado nulo estorna só o lançamento dos resultados; re-encerrar dá a versão 2', async () => {
    const t = await cenarioResultadoNulo();
    const r1 = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '0' }, t.ctx);
    expect(r1.ok, 'pré-condição: o exercício encerra').toBe(true);
    const enc1 = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id } });
    const idL1 = enc1.lancamentoResultadosId as string;

    const reab = await reabrir({ exercicioId: t.ex.id, motivo: MOTIVO }, t.ctx);
    const linha = await db.reaberturaExercicio.findFirst({ where: { id: reab.id, tenantId: t.ctx.tenantId } });
    expect([...linha.lancamentosEstornados]).toEqual([idL1]);

    const original = await db.lancamento.findFirst({ where: { id: idL1, tenantId: t.ctx.tenantId } });
    expect(original.status).toBe('ESTORNADO');
    const estornos = await db.lancamento.findMany({ where: { tenantId: t.ctx.tenantId, lancamentoEstornoId: idL1 } });
    expect(estornos, 'um estorno').toHaveLength(1);
    expect(estornos[0].status).toBe('LANCADO');
    expect(await lancamentosEN(t.ctx), 'original + estorno').toHaveLength(2);

    const todos = await saldos(t.ctx, t.ex.id, [...MESES, 13]);
    expect(f2(todos.get(t.conta['711'])), '711 volta a credora 300').toBe('-300.00');
    expect(f2(todos.get(t.conta['622'])), '622 volta a devedora 300').toBe('300.00');
    expect((await exercicioAgora(t.ctx, t.ex.id)).estado).toBe('ABERTO');

    const r2 = await encerrar({ exercicioId: t.ex.id, estimativaImposto: '0' }, t.ctx);
    expect('impedimentos' in r2 ? r2.impedimentos : []).toEqual([]);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.encerramento.versao).toBe(2);
    const enc2 = await db.encerramentoExercicio.findFirst({
      where: { tenantId: t.ctx.tenantId, exercicioId: t.ex.id, anuladoEm: null },
    });
    expect(enc2.versao).toBe(2);
    expect(enc2.lancamentoResultadosId).not.toBeNull();
    expect(enc2.lancamentoResultadosId).not.toBe(idL1);
    expect(enc2.lancamentoLiquidoId).toBeNull();
  }, 120_000);
});
