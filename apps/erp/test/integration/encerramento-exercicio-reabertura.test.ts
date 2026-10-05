/**
 * Oráculo N4-v (issue #138, ADR-0035 §1, §6, §8) — reabertura do exercício encerrado
 * provisoriamente e encerramento definitivo.
 *
 * Contrato (fixado pelo orquestrador; não se reabre aqui), em
 * `src/server/services/financas/encerramento-exercicio.service.ts`:
 *   reabrirExercicio({ exercicioId, motivo }, ctx) → a linha `ReaberturaExercicio` criada.
 *     Numa transacção: exercício ENCERRADO_PROVISORIO (senão BusinessRuleError TRANSICAO_INVALIDA,
 *     ENCERRADO incluído); motivo validado como no `reabrirPeriodo` (`ReabrirPeriodoSchema`: pelo
 *     menos 10 caracteres → ValidationError `VALIDACAO`, o código que o pipeline dá a esse schema);
 *     o `EncerramentoExercicio` corrente (anuladoEm nulo) fica com `anuladoEm`; os 2–3 lançamentos EN
 *     passam a ESTORNADO, cada um com UM estorno LANCADO no período 13 (não no 12, que está
 *     fechado); período 13 → ABERTO; exercício → ABERTO; `ReaberturaExercicio` com motivo,
 *     `lancamentosEstornados` = ids dos EN originais, `reabertoPorId = ctx.userId`, `encerramentoId`.
 *     Os doze mensais continuam FECHADO.
 *   encerrarExercicioDefinitivo({ exercicioId }, ctx) → ENCERRADO_PROVISORIO → ENCERRADO, com
 *     `encerradoDefinitivoEm` e `encerradoDefinitivoPorId = ctx.userId`. De ABERTO → TRANSICAO_INVALIDA.
 *   Exercício de outro tenant → NotFoundError nas duas.
 * E em `contabilidade.service`:
 *   reabrirPeriodo de um período de um exercício ENCERRADO_PROVISORIO → BusinessRuleError
 *     EXERCICIO_ENCERRADO_PROVISORIO, sem escrever (reabre-se primeiro o exercício). Num exercício
 *     ENCERRADO continua EXERCICIO_ENCERRADO.
 *
 * Cenário (o do oráculo N3, montado pelos serviços reais — nunca Prisma em Lancamento):
 *   Mar D 111 / C 711 1000 · Abr D 622 / C 111 300 · Mai D 6911 / C 121 50 · Jun D 121 / C 7811 20
 *   Encerrado com estimativa 100 → 88 = 570 credor.
 *
 * Os períodos 1..12 são fechados directamente pelo client cru (como no oráculo N3): `fecharPeriodo`
 * exige o apuramento do IVA de cada mês, alheio ao que está em teste. No caso de re-encerramento, o
 * mês 12 reaberto volta a fechar pelos serviços reais (`apurarIva` + `fecharPeriodo`).
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

/**
 * As funções novas ainda não existem no passo vermelho: o módulo é importado por caminho em
 * variável (o `tsc` não o resolve) e cada caso falha na asserção de existência.
 */
async function carregar<T>(nome: 'encerrarExercicio' | 'reabrirExercicio' | 'encerrarExercicioDefinitivo'): Promise<T> {
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
    typeof modulo?.[nome],
    `encerramento-exercicio.service exporta ${nome}${erro ? ` (import falhou: ${erro})` : ''}`,
  ).toBe('function');
  return modulo![nome] as T;
}

const carregarEncerrar = () => carregar<EncerrarExercicio>('encerrarExercicio');
const carregarReabrir = () => carregar<ReabrirExercicio>('reabrirExercicio');
const carregarDefinitivo = () => carregar<EncerrarExercicioDefinitivo>('encerrarExercicioDefinitivo');

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);

const CODIGOS = ['111', '121', '622', '6911', '711', '7811', '81', '82', '83', '851', '88', '4411'] as const;
type Codigo = (typeof CODIGOS)[number];

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MOTIVO = 'Ajustamento da revisão de contas: provisão em falta em Dezembro';

describe.skipIf(skip)('Reabertura e encerramento definitivo do exercício (#138, ADR-0035) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let iva: typeof import('@/server/services/financas/apuramento-iva.service');
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const TS = Date.now();
  let seq = 0;

  interface Tenant {
    ctx: Ctx;
    conta: Record<Codigo, string>;
    keycloakSub: string;
  }

  async function novoTenant(): Promise<Tenant> {
    seq += 1;
    const tenantId = `tenant-reab-${TS}-${seq}`;
    const userId = `user-reab-${TS}-${seq}`;
    const slug = `reab-${TS}-${seq}`;
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
            documentoOrigemId: `doc-reab-${++doc}`,
            documentoOrigemTipo: 'TesteReabertura',
            historico: `Teste reabertura ${debito}/${credito} ${valor}`,
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

  async function fecharMeses(ctx: Ctx, exercicioId: string, ordens: number[]) {
    await db.periodoContabil.updateMany({
      where: { tenantId: ctx.tenantId, exercicioId, ordem: { in: ordens } },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: ctx.userId },
    });
  }

  async function periodo(ctx: Ctx, exercicioId: string, ordem: number) {
    return db.periodoContabil.findFirst({ where: { tenantId: ctx.tenantId, exercicioId, ordem } });
  }

  async function exercicioAgora(ctx: Ctx, exercicioId: string) {
    return db.exercicioContabil.findFirst({ where: { id: exercicioId, tenantId: ctx.tenantId } });
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

  /** Saldos não nulos, em texto ordenado — para comparar mapas inteiros. */
  function naoNulos(m: Map<string, Prisma.Decimal>) {
    return [...m.entries()].filter(([, v]) => !v.isZero()).map(([k, v]) => `${k}:${f2(v)}`).sort();
  }

  async function lancamentosEN(ctx: Ctx) {
    return db.lancamento.findMany({
      where: { tenantId: ctx.tenantId, diario: { tipo: 'ENCERRAMENTO' } },
      include: { diario: true, periodo: true },
    });
  }

  /** Tenant com o cenário lançado, os doze meses fechados e o exercício encerrado (estimativa 100). */
  async function cenarioEncerrado() {
    const t = await novoTenant();
    await lancarCenario(t.ctx);
    const ex = await exercicio2026(t.ctx);
    await fecharMeses(t.ctx, ex.id, MESES);
    const saldosAntes = await saldos(t.ctx, ex.id, [...MESES, 13]);

    const encerrar = await carregarEncerrar();
    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, t.ctx);
    expect('impedimentos' in r ? r.impedimentos : [], 'pré-condição: o exercício encerra').toEqual([]);
    expect(r.ok).toBe(true);
    expect((await exercicioAgora(t.ctx, ex.id)).estado, 'pré-condição: ENCERRADO_PROVISORIO').toBe('ENCERRADO_PROVISORIO');
    const enc = await db.encerramentoExercicio.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: ex.id } });
    expect(enc, 'pré-condição: EncerramentoExercicio').toBeTruthy();
    const idsEN = [enc.lancamentoResultadosId, enc.lancamentoImpostoId, enc.lancamentoLiquidoId].filter(Boolean) as string[];
    expect(idsEN, 'pré-condição: três lançamentos EN').toHaveLength(3);
    expect(f2((await saldos(t.ctx, ex.id, [...MESES, 13])).get(t.conta['88'])), 'pré-condição: 88 = 570 credor').toBe('-570.00');
    return { ...t, ex, enc, idsEN, saldosAntes, encerrar };
  }

  /** Estado do encerramento provisório intacto: nada da reabertura ficou escrito. */
  async function continuaEncerrado(ctx: Ctx, exercicioId: string, encId: string, idsEN: string[]) {
    expect((await exercicioAgora(ctx, exercicioId)).estado).toBe('ENCERRADO_PROVISORIO');
    expect((await periodo(ctx, exercicioId, 13)).estado).toBe('FECHADO');
    const enc = await db.encerramentoExercicio.findFirst({ where: { id: encId, tenantId: ctx.tenantId } });
    expect(enc.anuladoEm).toBeNull();
    const en = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsEN } }, select: { status: true } });
    expect(en.map((l: AnyDb) => l.status)).toEqual(['LANCADO', 'LANCADO', 'LANCADO']);
    expect(await db.lancamento.count({ where: { tenantId: ctx.tenantId, lancamentoEstornoId: { in: idsEN } } })).toBe(0);
    expect(await db.reaberturaExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(0);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    iva = await import('@/server/services/financas/apuramento-iva.service');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
  });

  // -------------------------------------------------------------------------
  // 1. Reabertura — caminho feliz
  // -------------------------------------------------------------------------

  it('reabrir estorna os três lançamentos EN no período 13, anula o encerramento e devolve o ano ao estado anterior', async () => {
    const { ctx, conta, ex, enc, idsEN, saldosAntes, keycloakSub } = await cenarioEncerrado();
    const reabrir = await carregarReabrir();
    const p13 = await periodo(ctx, ex.id, 13);

    const r = await reabrir({ exercicioId: ex.id, motivo: MOTIVO }, ctx);

    // ReaberturaExercicio
    const reab = await db.reaberturaExercicio.findFirst({ where: { tenantId: ctx.tenantId, exercicioId: ex.id } });
    expect(reab).toBeTruthy();
    expect(r.id).toBe(reab.id);
    expect(reab.motivo).toBe(MOTIVO);
    expect(reab.encerramentoId).toBe(enc.id);
    expect(reab.reabertoPorId).toBe(ctx.userId);
    expect(reab.keycloakSub).toBe(keycloakSub);
    expect([...reab.lancamentosEstornados].sort()).toEqual([...idsEN].sort());
    expect(await db.reaberturaExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(1);

    // Encerramento anulado
    const encDepois = await db.encerramentoExercicio.findFirst({ where: { id: enc.id, tenantId: ctx.tenantId } });
    expect(encDepois.anuladoEm).toBeInstanceOf(Date);

    // Os originais ESTORNADO, cada um com um estorno LANCADO no período 13
    const originais = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsEN } } });
    expect(originais.map((l: AnyDb) => l.status)).toEqual(['ESTORNADO', 'ESTORNADO', 'ESTORNADO']);
    const estornos = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, lancamentoEstornoId: { in: idsEN } } });
    expect(estornos, 'um estorno por lançamento EN').toHaveLength(3);
    expect(new Set(estornos.map((l: AnyDb) => l.lancamentoEstornoId))).toEqual(new Set(idsEN));
    for (const e of estornos) {
      expect(e.status).toBe('LANCADO');
      expect(e.tipo).toBe('ESTORNO');
      expect(e.periodoId, 'o estorno vai para o período 13, não para o 12 fechado').toBe(p13.id);
    }
    expect(await lancamentosEN(ctx), 'três originais + três estornos no diário EN').toHaveLength(6);

    // Saldos 1..13: o ano volta ao que era antes do encerramento
    const depois = await saldos(ctx, ex.id, [...MESES, 13]);
    expect(naoNulos(depois)).toEqual(naoNulos(saldosAntes));
    expect(f2(depois.get(conta['711']))).toBe('-1000.00');
    expect(f2(depois.get(conta['622']))).toBe('300.00');
    expect(f2(depois.get(conta['6911']))).toBe('50.00');
    expect(f2(depois.get(conta['7811']))).toBe('-20.00');
    for (const codigo of ['81', '82', '83', '851', '88', '4411'] as const) {
      expect(f2(depois.get(conta[codigo])), `${codigo} volta a zero`).toBe('0.00');
    }

    // Estados
    expect((await exercicioAgora(ctx, ex.id)).estado).toBe('ABERTO');
    expect((await periodo(ctx, ex.id, 13)).estado).toBe('ABERTO');
    const mensais = await db.periodoContabil.findMany({
      where: { tenantId: ctx.tenantId, exercicioId: ex.id, ordem: { lte: 12 } },
      select: { estado: true },
    });
    expect(mensais).toHaveLength(12);
    expect(mensais.every((p: AnyDb) => p.estado === 'FECHADO'), 'os doze mensais continuam FECHADO').toBe(true);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 2. Re-encerrar depois de reabrir, com um ajustamento em Dezembro
  // -------------------------------------------------------------------------

  it('re-encerra depois de reabrir e ajustar Dezembro: versão 2, 88 reflecte o ajustamento, um só encerramento em vigor', async () => {
    const { ctx, conta, ex, enc, encerrar } = await cenarioEncerrado();
    const reabrir = await carregarReabrir();
    await reabrir({ exercicioId: ex.id, motivo: MOTIVO }, ctx);

    // Reabrir Dezembro pelo serviço, lançar o ajustamento, apurar o IVA e fechar outra vez.
    const p12 = await periodo(ctx, ex.id, 12);
    await contab.reabrirPeriodo({ id: p12.id, motivo: 'Ajustamento de revisão em Dezembro' }, ctx);
    expect((await periodo(ctx, ex.id, 12)).estado, 'pré-condição: Dezembro reaberto').toBe('ABERTO');
    const ajuste = await lancar(ctx, '2026-12-10T10:00:00Z', '111', '711', '50');
    expect((ajuste as AnyDb).periodoId, 'pré-condição: o ajustamento cai em Dezembro').toBe(p12.id);
    await iva.apurarIva({ periodoId: p12.id }, ctx);
    const fecho = await contab.fecharPeriodo({ id: p12.id }, ctx);
    expect('impedimentos' in fecho ? fecho.impedimentos : [], 'pré-condição: Dezembro fecha').toEqual([]);

    const r = await encerrar({ exercicioId: ex.id, estimativaImposto: '100' }, ctx);
    expect('impedimentos' in r ? r.impedimentos : []).toEqual([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.encerramento.versao).toBe(2);

    expect((await exercicioAgora(ctx, ex.id)).estado).toBe('ENCERRADO_PROVISORIO');
    const todos = await db.encerramentoExercicio.findMany({ where: { tenantId: ctx.tenantId, exercicioId: ex.id } });
    expect(todos).toHaveLength(2);
    const emVigor = todos.filter((e: AnyDb) => e.anuladoEm === null);
    expect(emVigor, 'exactamente um encerramento não anulado').toHaveLength(1);
    expect(emVigor[0].versao).toBe(2);
    expect(todos.find((e: AnyDb) => e.id === enc.id).anuladoEm).toBeInstanceOf(Date);

    // Corrente 1050 − 300 + 20 − 50 = 720; − 100 de imposto = 620 credor.
    const s = await saldos(ctx, ex.id, [...MESES, 13]);
    expect(f2(s.get(conta['88'])), '88 = 620 credor').toBe('-620.00');
    expect(f2(s.get(conta['4411'])), '4411 = 100 credor (o imposto do 1.º encerramento foi estornado)').toBe('-100.00');
    for (const codigo of ['711', '622', '6911', '7811', '81', '82', '83', '851'] as const) {
      expect(f2(s.get(conta[codigo])), `${codigo} salda a zero`).toBe('0.00');
    }
    const f711 = (emVigor[0].fotografia as AnyDb[]).find((x) => x.codigo === '711');
    expect(f2(f711?.saldoCredor), 'a fotografia nova inclui o ajustamento').toBe('1050.00');
  }, 120_000);

  // -------------------------------------------------------------------------
  // 3. Motivo inválido
  // -------------------------------------------------------------------------

  it('recusa motivo vazio ou curto como o reabrirPeriodo (VALIDACAO) e não escreve nada', async () => {
    const { ctx, ex, enc, idsEN } = await cenarioEncerrado();
    const reabrir = await carregarReabrir();

    for (const motivo of ['', 'curto']) {
      await expect(reabrir({ exercicioId: ex.id, motivo }, ctx), `motivo «${motivo}»`).rejects.toMatchObject({
        name: 'ValidationError',
        code: 'VALIDACAO',
      });
    }
    await continuaEncerrado(ctx, ex.id, enc.id, idsEN);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 4. Reabrir um exercício aberto
  // -------------------------------------------------------------------------

  it('reabrir um exercício ABERTO lança TRANSICAO_INVALIDA e não regista reabertura', async () => {
    const t = await novoTenant();
    await lancarCenario(t.ctx);
    const ex = await exercicio2026(t.ctx);
    const reabrir = await carregarReabrir();

    await expect(reabrir({ exercicioId: ex.id, motivo: MOTIVO }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    expect((await exercicioAgora(t.ctx, ex.id)).estado).toBe('ABERTO');
    expect(await db.reaberturaExercicio.count({ where: { tenantId: t.ctx.tenantId } })).toBe(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 5. Encerramento definitivo
  // -------------------------------------------------------------------------

  it('o definitivo passa a ENCERRADO com autor e data; depois nem o exercício nem os períodos reabrem', async () => {
    const { ctx, ex, enc, idsEN } = await cenarioEncerrado();
    const definitivo = await carregarDefinitivo();
    const reabrir = await carregarReabrir();

    const antes = Date.now();
    await definitivo({ exercicioId: ex.id }, ctx);

    const exDepois = await exercicioAgora(ctx, ex.id);
    expect(exDepois.estado).toBe('ENCERRADO');
    expect(exDepois.encerradoDefinitivoPorId).toBe(ctx.userId);
    expect(exDepois.encerradoDefinitivoEm).toBeInstanceOf(Date);
    expect(exDepois.encerradoDefinitivoEm.getTime()).toBeGreaterThanOrEqual(antes - 5_000);

    await expect(reabrir({ exercicioId: ex.id, motivo: MOTIVO }, ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    for (const ordem of [12, 13]) {
      const p = await periodo(ctx, ex.id, ordem);
      await expect(contab.reabrirPeriodo({ id: p.id, motivo: MOTIVO }, ctx), `período ${ordem}`).rejects.toMatchObject({
        name: 'BusinessRuleError',
        code: 'EXERCICIO_ENCERRADO',
      });
      expect((await periodo(ctx, ex.id, ordem)).estado).toBe('FECHADO');
    }

    // O encerramento continua em vigor e intacto.
    expect((await db.encerramentoExercicio.findFirst({ where: { id: enc.id, tenantId: ctx.tenantId } })).anuladoEm).toBeNull();
    const en = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsEN } }, select: { status: true } });
    expect(en.map((l: AnyDb) => l.status)).toEqual(['LANCADO', 'LANCADO', 'LANCADO']);
    expect(await db.reaberturaExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 6. Definitivo de um exercício aberto
  // -------------------------------------------------------------------------

  it('o definitivo de um exercício ABERTO lança TRANSICAO_INVALIDA e não carimba nada', async () => {
    const t = await novoTenant();
    await lancarCenario(t.ctx);
    const ex = await exercicio2026(t.ctx);
    const definitivo = await carregarDefinitivo();

    await expect(definitivo({ exercicioId: ex.id }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'TRANSICAO_INVALIDA',
    });
    const exDepois = await exercicioAgora(t.ctx, ex.id);
    expect(exDepois.estado).toBe('ABERTO');
    expect(exDepois.encerradoDefinitivoEm).toBeNull();
    expect(exDepois.encerradoDefinitivoPorId).toBeNull();
  }, 120_000);

  // -------------------------------------------------------------------------
  // 7. reabrirPeriodo num exercício encerrado provisoriamente
  // -------------------------------------------------------------------------

  it('reabrirPeriodo de Dezembro num exercício ENCERRADO_PROVISORIO lança EXERCICIO_ENCERRADO_PROVISORIO', async () => {
    const { ctx, ex, enc, idsEN } = await cenarioEncerrado();
    const p12 = await periodo(ctx, ex.id, 12);
    const reaberturasAntes = await db.reaberturaPeriodo.count({ where: { tenantId: ctx.tenantId } });

    await expect(contab.reabrirPeriodo({ id: p12.id, motivo: MOTIVO }, ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'EXERCICIO_ENCERRADO_PROVISORIO',
    });
    expect((await periodo(ctx, ex.id, 12)).estado, 'Dezembro continua FECHADO').toBe('FECHADO');
    expect(await db.reaberturaPeriodo.count({ where: { tenantId: ctx.tenantId } })).toBe(reaberturasAntes);
    await continuaEncerrado(ctx, ex.id, enc.id, idsEN);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 8. Exercício de outro tenant
  // -------------------------------------------------------------------------

  it('o exercício de outro tenant é NotFoundError nas duas funções e fica intacto', async () => {
    const alheio = await cenarioEncerrado();
    const outro = await novoTenant();
    const reabrir = await carregarReabrir();
    const definitivo = await carregarDefinitivo();

    await expect(reabrir({ exercicioId: alheio.ex.id, motivo: MOTIVO }, outro.ctx)).rejects.toMatchObject({
      name: 'NotFoundError',
    });
    await expect(definitivo({ exercicioId: alheio.ex.id }, outro.ctx)).rejects.toMatchObject({ name: 'NotFoundError' });

    await continuaEncerrado(alheio.ctx, alheio.ex.id, alheio.enc.id, alheio.idsEN);
    const exAlheio = await exercicioAgora(alheio.ctx, alheio.ex.id);
    expect(exAlheio.encerradoDefinitivoEm).toBeNull();
    expect(exAlheio.encerradoDefinitivoPorId).toBeNull();
    expect(await db.reaberturaExercicio.count({ where: { tenantId: outro.ctx.tenantId } })).toBe(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // 9. Concorrência: reabrir contra definitivo
  // -------------------------------------------------------------------------

  it('reabrir e definitivo em concorrência: exactamente um vence e o estado final é coerente', async () => {
    const { ctx, ex, enc, idsEN } = await cenarioEncerrado();
    const reabrir = await carregarReabrir();
    const definitivo = await carregarDefinitivo();

    const [rReab, rDef] = await Promise.allSettled([
      reabrir({ exercicioId: ex.id, motivo: MOTIVO }, ctx),
      definitivo({ exercicioId: ex.id }, ctx),
    ]);
    const cumpridas = [rReab, rDef].filter((x) => x.status === 'fulfilled');
    const recusas = [rReab, rDef].filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(cumpridas, 'exactamente uma cumpre').toHaveLength(1);
    expect(recusas, 'a outra rejeita').toHaveLength(1);
    expect(recusas[0].reason).toMatchObject({ name: 'BusinessRuleError' });

    const exDepois = await exercicioAgora(ctx, ex.id);
    const reaberturas = await db.reaberturaExercicio.count({ where: { tenantId: ctx.tenantId } });
    const estornos = await db.lancamento.count({ where: { tenantId: ctx.tenantId, lancamentoEstornoId: { in: idsEN } } });
    const encDepois = await db.encerramentoExercicio.findFirst({ where: { id: enc.id, tenantId: ctx.tenantId } });
    const p13 = await periodo(ctx, ex.id, 13);

    if (rReab.status === 'fulfilled') {
      expect(exDepois.estado).toBe('ABERTO');
      expect(exDepois.encerradoDefinitivoEm).toBeNull();
      expect(reaberturas).toBe(1);
      expect(estornos).toBe(3);
      expect(encDepois.anuladoEm).toBeInstanceOf(Date);
      expect(p13.estado).toBe('ABERTO');
    } else {
      expect(exDepois.estado).toBe('ENCERRADO');
      expect(exDepois.encerradoDefinitivoEm).toBeInstanceOf(Date);
      expect(reaberturas).toBe(0);
      expect(estornos).toBe(0);
      expect(encDepois.anuladoEm).toBeNull();
      expect(p13.estado).toBe('FECHADO');
    }
  }, 120_000);
  // -------------------------------------------------------------------------
  // Emenda da revisão: o estorno genérico não toca nos lançamentos de encerramento.
  // `estornarLancamento` (rota /contabilidade/lancamentos/[id]/estornar) resolvia o período pela
  // data do estorno — por omissão hoje, ou uma data de 2027 — e estornava um lançamento EN fora do
  // período 13, mesmo com o exercício ENCERRADO. Só a reabertura do exercício os estorna.
  // -------------------------------------------------------------------------

  /** Tenta o estorno genérico do lançamento EN de resultados (sem data e com data de 2027). */
  async function estornoGenericoRecusado(ctx: Ctx, lancamentoId: string) {
    const exerciciosAntes = await db.exercicioContabil.count({ where: { tenantId: ctx.tenantId } });
    const lancamentosAntes = await db.lancamento.count({ where: { tenantId: ctx.tenantId } });

    const tentativas: Array<{ rotulo: string; data?: Date }> = [
      // 2027 primeiro: é o caminho que hoje estorna para o ano seguinte (o sem data cai num mês fechado).
      { rotulo: 'com data de 2027', data: new Date('2027-01-15T10:00:00Z') },
      { rotulo: 'sem data (hoje)' },
    ];
    for (const { rotulo, data } of tentativas) {
      await expect(
        contab.estornarLancamento({ lancamentoId, motivo: 'Estorno pela rota genérica', ...(data ? { data } : {}) }, ctx),
        `estorno genérico ${rotulo}`,
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'LANCAMENTO_DE_ENCERRAMENTO' });
    }

    expect((await db.lancamento.findFirst({ where: { id: lancamentoId, tenantId: ctx.tenantId } })).status).toBe('LANCADO');
    expect(await db.lancamento.count({ where: { tenantId: ctx.tenantId, lancamentoEstornoId: lancamentoId } })).toBe(0);
    expect(await db.lancamento.count({ where: { tenantId: ctx.tenantId } }), 'nenhum lançamento novo').toBe(lancamentosAntes);
    expect(
      await db.exercicioContabil.count({ where: { tenantId: ctx.tenantId } }),
      'nenhum exercício criado como efeito colateral',
    ).toBe(exerciciosAntes);
  }

  it('o estorno genérico de um lançamento EN num exercício ENCERRADO_PROVISORIO lança LANCAMENTO_DE_ENCERRAMENTO', async () => {
    const { ctx, ex, enc, idsEN } = await cenarioEncerrado();
    await estornoGenericoRecusado(ctx, enc.lancamentoResultadosId);
    await continuaEncerrado(ctx, ex.id, enc.id, idsEN);
  }, 120_000);

  it('o estorno genérico de um lançamento EN num exercício ENCERRADO lança LANCAMENTO_DE_ENCERRAMENTO', async () => {
    const { ctx, ex, enc, idsEN } = await cenarioEncerrado();
    const definitivo = await carregarDefinitivo();
    await definitivo({ exercicioId: ex.id }, ctx);
    expect((await exercicioAgora(ctx, ex.id)).estado, 'pré-condição: ENCERRADO').toBe('ENCERRADO');

    await estornoGenericoRecusado(ctx, enc.lancamentoResultadosId);

    expect((await exercicioAgora(ctx, ex.id)).estado).toBe('ENCERRADO');
    const en = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsEN } }, select: { status: true } });
    expect(en.map((l: AnyDb) => l.status)).toEqual(['LANCADO', 'LANCADO', 'LANCADO']);
    expect(await db.reaberturaExercicio.count({ where: { tenantId: ctx.tenantId } })).toBe(0);
  }, 120_000);

  it('os estornos da reabertura têm a data do fim do exercício e continuam a numeração EN do período 13', async () => {
    const { ctx, ex, idsEN } = await cenarioEncerrado();
    const reabrir = await carregarReabrir();
    await reabrir({ exercicioId: ex.id, motivo: MOTIVO }, ctx);

    const originais = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsEN } } });
    const estornos = await db.lancamento.findMany({ where: { tenantId: ctx.tenantId, lancamentoEstornoId: { in: idsEN } } });
    expect(originais).toHaveLength(3);
    expect(estornos).toHaveLength(3);

    const codigosOriginais = new Set(originais.map((l: AnyDb) => l.periodoFiscal));
    expect(codigosOriginais.size, 'pré-condição: os originais partilham a série do período 13').toBe(1);
    const maiorOriginal = Math.max(...originais.map((l: AnyDb) => Number(l.numero)));
    const diarioEN = originais[0].diarioId;

    for (const e of estornos) {
      expect(e.data.getTime(), 'o estorno tem a data do fim do exercício').toBe(ex.dataFim.getTime());
      expect(e.diarioId, 'o estorno fica no diário EN').toBe(diarioEN);
      expect(e.periodoFiscal, 'mesma série (período 13) dos originais').toBe([...codigosOriginais][0]);
      expect(Number(e.numero), `estorno ${e.numero} numerado depois dos originais`).toBeGreaterThan(maiorOriginal);
    }
    const numeros = [...originais, ...estornos].map((l: AnyDb) => Number(l.numero)).sort((a, b) => a - b);
    expect(new Set(numeros).size, 'sem números repetidos na série').toBe(6);
  }, 120_000);
});
