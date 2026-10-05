/**
 * Oráculo P4-v (run exercicio-followups, issue #364, ADR-0035 §5) — a aplicação do resultado:
 * o resultado inteiro de N transportado de 88 para 59 no exercício seguinte.
 *
 * Contrato (decisões do utilizador e do orquestrador, `.scratch/sdlc/exercicio-followups/RUN.md`):
 *   Módulo novo `services/financas/aplicacao-resultado.service.ts`:
 *   `aplicarResultado({ exercicioId, dataDeliberacao, referenciaActa }, ctx)` → a linha
 *     `AplicacaoResultado` (exercicioId = N, exercicioDestinoId = N+1, lancamentoId, valor absoluto,
 *     dataDeliberacao, referenciaActa, anuladaEm null, criadoPorId). Efeito: UM lançamento LANCADO num
 *     diário regular de tipo OPERACOES, `data` = dataDeliberacao, período resolvido por essa data (de
 *     N+1), `documentoOrigemTipo: 'AplicacaoResultado'`; lucro (88 credor em N+1) → D 88 / C 59;
 *     prejuízo → C 88 / D 59; valor = saldo de 88 em N+1 nesse momento (AB + movimento anterior).
 *     Depois dele 88 fica a zero em N+1 e 59 guarda o resultado.
 *   Recusas: N não ≥ ENCERRADO_PROVISORIO → `EXERCICIO_NAO_ENCERRADO`; N+1 em falta ou sem AB
 *     efectivo → `ABERTURA_EM_FALTA`; data fora de N+1 → `DATA_FORA_DO_EXERCICIO_SEGUINTE`; o período
 *     dessa data FECHADO → `PERIODO_FECHADO`; aplicação activa de N → `RESULTADO_JA_APLICADO`; 88 a
 *     zero em N+1 → `SEM_RESULTADO_A_APLICAR`; referenciaActa vazia → ValidationError `VALIDACAO`;
 *     outro tenant → NotFoundError.
 *   `anularAplicacaoResultado({ aplicacaoId, motivo }, ctx)` (motivo pela regra do
 *     `MotivoReaberturaSchema` → VALIDACAO) → lançamento ESTORNADO, estorno no MESMO período do
 *     original (não no de hoje), `anuladaEm` preenchido; depois disso pode aplicar-se de novo.
 *   `estornarLancamento` genérico do lançamento da aplicação → `LANCAMENTO_DE_APLICACAO`.
 *   `reabrirExercicio(N)` com aplicação activa → `APLICACAO_DO_RESULTADO_REGISTADA`, nada muda;
 *     depois de anular, reabre.
 *   AuditLog explícito: `AplicacaoResultado` CREATE ao aplicar, UPDATE ao anular.
 *   DFC: 59 → OP-00 (com 88) — a aplicação fica neutra numa linha: nenhum efeito em FIN-* e o
 *     total operacional igual ao do mesmo cenário sem a aplicação.
 *
 * Cenário (o do oráculo P3; meses de 2026 fechados por escrita crua do estado):
 *   2026  Mar D 111 / C 711 1000 · Abr D 622 / C 111 300 · Mai D 121 / C 521 2000 (capital)
 *   Encerrado com estimativa 100 ⇒ AB(2027) com C 88 600.
 *   Aplicação em 2027-04-15, «Acta n.º 3/2027» ⇒ D 88 600 / C 59 600.
 *   Prejuízo: Mar D 111 / C 711 300 · Abr D 622 / C 111 800 · Mai D 111 / C 521 2000, estimativa 0
 *     ⇒ AB(2027) com D 88 500 ⇒ aplicação C 88 500 / D 59 500.
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

interface AplicacaoResultadoRow {
  id: string;
  tenantId: string;
  exercicioId: string;
  exercicioDestinoId: string;
  lancamentoId: string;
  valor: unknown;
  dataDeliberacao: Date;
  referenciaActa: string;
  anuladaEm: Date | null;
  criadoPorId: string;
}
type AplicarResultado = (
  input: { exercicioId: string; dataDeliberacao: Date; referenciaActa: string },
  ctx: Ctx,
) => Promise<AplicacaoResultadoRow>;
type AnularAplicacaoResultado = (input: { aplicacaoId: string; motivo: string }, ctx: Ctx) => Promise<unknown>;

async function carregar<T>(nome: 'aplicarResultado' | 'anularAplicacaoResultado'): Promise<T> {
  const caminho = '@/server/services/financas/aplicacao-resultado.service';
  let modulo: Record<string, unknown> | undefined;
  let erro = '';
  try {
    modulo = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  expect(
    typeof modulo?.[nome],
    `aplicacao-resultado.service exporta ${nome}${erro ? ` (import falhou: ${erro})` : ''}`,
  ).toBe('function');
  return modulo![nome] as T;
}

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);

const CODIGOS = ['111', '121', '521', '59', '622', '711', '4411', '88'] as const;
type Codigo = (typeof CODIGOS)[number];

const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MOTIVO_REABRIR = 'Ajustamento da revisão de contas: provisão em falta em Dezembro';
const MOTIVO_ANULAR = 'A acta foi rectificada pela assembleia geral seguinte';
const ACTA = 'Acta n.º 3/2027';
const DELIBERACAO = new Date('2027-04-15T10:00:00Z');

/** A mesma partida com o tipo trocado (o estorno). */
const inverter = (x: string) => {
  const [codigo, tipo, valor] = x.split(':');
  return `${codigo}:${tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO'}:${valor}`;
};

describe.skipIf(skip)('Aplicação do resultado 88 → 59 (#364, ADR-0035 §5) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let enc: typeof import('@/server/services/financas/encerramento-exercicio.service');
  let dfc: typeof import('@/server/services/financas/dfc.service');
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
    const tenantId = `tenant-apr-${TS}-${seq}`;
    const userId = `user-apr-${TS}-${seq}`;
    const slug = `apr-${TS}-${seq}`;
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
            documentoOrigemId: `doc-apr-${++doc}`,
            documentoOrigemTipo: 'TesteAplicacaoResultado',
            historico: `Teste aplicação do resultado ${debito}/${credito} ${valor}`,
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

  async function fecharMeses(ctx: Ctx, exercicioId: string, ordens: number[]) {
    await db.periodoContabil.updateMany({
      where: { tenantId: ctx.tenantId, exercicioId, ordem: { in: ordens } },
      data: { estado: 'FECHADO', fechadoEm: new Date(), fechadoPorId: ctx.userId },
    });
  }

  /** Lucro: resultado 600 depois da estimativa de 100. */
  async function cenarioLucro2026(t: Tenant) {
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '1000');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '121', '521', '2000');
    await fecharMeses(t.ctx, t.ex26.id, MESES);
  }

  /** Prejuízo: resultado −500, estimativa 0. */
  async function cenarioPrejuizo2026(t: Tenant) {
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '300');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '800');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '111', '521', '2000');
    await fecharMeses(t.ctx, t.ex26.id, MESES);
  }

  /** Resultado exactamente zero: rendimentos = gastos, estimativa 0. */
  async function cenarioZero2026(t: Tenant) {
    await lancar(t.ctx, '2026-03-15T10:00:00Z', '111', '711', '300');
    await lancar(t.ctx, '2026-04-15T10:00:00Z', '622', '111', '300');
    await lancar(t.ctx, '2026-05-15T10:00:00Z', '121', '521', '2000');
    await fecharMeses(t.ctx, t.ex26.id, MESES);
  }

  async function abrir2027(t: Tenant) {
    await runCtx(t.ctx, () => contab.abrirExercicio({ ano: 2027 }, t.ctx));
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

  async function encerrar2026(t: Tenant, estimativaImposto: string) {
    const r = (await enc.encerrarExercicio({ exercicioId: t.ex26.id, estimativaImposto }, t.ctx)) as ResultadoEncerramento;
    expect('impedimentos' in r ? r.impedimentos : [], 'pré-condição: 2026 encerra').toEqual([]);
    expect(r.ok).toBe(true);
    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ENCERRADO_PROVISORIO');
  }

  /** AB efectivo: LANCADO no diário ABERTURA, não estornado e não estorno. */
  async function abEfectivos(ctx: Ctx, exercicioId: string) {
    return db.lancamento.findMany({
      where: {
        tenantId: ctx.tenantId,
        diario: { tipo: 'ABERTURA' },
        periodo: { exercicioId },
        status: 'LANCADO',
        lancamentoEstornoId: null,
      },
    });
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

  /**
   * Saldo de uma conta no exercício, pelo período do lançamento (LANCADO + ESTORNADO, como
   * `FILTRO_LANCAMENTO_MAPA`), em termos de CRÉDITO: créditos − débitos.
   */
  async function saldoCredorNoExercicio(ctx: Ctx, contaId: string, exercicioId: string): Promise<string> {
    const partidas = await db.partidaLancamento.findMany({
      where: {
        tenantId: ctx.tenantId,
        contaId,
        lancamento: { status: { in: ['LANCADO', 'ESTORNADO'] }, periodo: { exercicioId } },
      },
    });
    let s = dec(0);
    for (const p of partidas) s = p.tipo === 'CREDITO' ? s.plus(dec(p.valor)) : s.minus(dec(p.valor));
    return f2(s);
  }

  async function aplicacoes(ctx: Ctx) {
    return db.aplicacaoResultado.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'asc' } });
  }

  async function auditoriaAplicacao(ctx: Ctx) {
    return db.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entity: 'AplicacaoResultado' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * O módulo novo carrega-se na primeira chamada, não no início do caso: o cenário (e as suas
   * pré-condições) corre contra o código actual, e o vermelho é o da funcionalidade em falta.
   */
  async function aplicar(t: Tenant, input: Partial<{ exercicioId: string; dataDeliberacao: Date; referenciaActa: string }> = {}, ctx: Ctx = t.ctx) {
    const aplicarResultado = await carregar<AplicarResultado>('aplicarResultado');
    return runCtx(ctx, () =>
      aplicarResultado({ exercicioId: t.ex26.id, dataDeliberacao: DELIBERACAO, referenciaActa: ACTA, ...input }, ctx),
    );
  }

  async function anular(t: Tenant, aplicacaoId: string, motivo = MOTIVO_ANULAR, ctx: Ctx = t.ctx) {
    const anularAplicacaoResultado = await carregar<AnularAplicacaoResultado>('anularAplicacaoResultado');
    return runCtx(ctx, () => anularAplicacaoResultado({ aplicacaoId, motivo }, ctx));
  }

  /** O lançamento da aplicação, com a forma e os valores esperados. */
  async function exigirLancamentoAplicacao(t: Tenant, ex27: AnyDb, ap: AplicacaoResultadoRow, esperado: string[]) {
    const l = await db.lancamento.findFirst({
      where: { id: ap.lancamentoId, tenantId: t.ctx.tenantId },
      include: { partidas: true, periodo: true, diario: true },
    });
    expect(l, 'o lançamento da aplicação existe').toBeTruthy();
    expect(l.status).toBe('LANCADO');
    expect(l.diario.tipo, 'diário regular de operações').toBe('OPERACOES');
    expect(l.documentoOrigemTipo).toBe('AplicacaoResultado');
    expect(l.data.getTime(), 'data = data da deliberação').toBe(DELIBERACAO.getTime());
    expect(l.periodo.exercicioId, 'o período é do exercício seguinte').toBe(ex27.id);
    expect(l.periodoId, 'o período é o da data da deliberação (Abril de 2027)').toBe((await periodo(t.ctx, ex27.id, 4)).id);
    expect(await partidasTexto(t.ctx, l.partidas)).toEqual(esperado);
    return l;
  }

  /** 2026 com lucro, 2027 aberto antes, 2026 encerrado ⇒ AB de 2027 com C 88 600. */
  async function cenarioLucro() {
    const t = await novoTenant();
    await cenarioLucro2026(t);
    const ex27 = await abrir2027(t);
    await encerrar2026(t, '100');
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: 2027 tem AB efectivo').toHaveLength(1);
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id), 'pré-condição: 88 credor 600 em 2027').toBe('600.00');
    return { t, ex27 };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    enc = await import('@/server/services/financas/encerramento-exercicio.service');
    dfc = await import('@/server/services/financas/dfc.service');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));
  });


  // -------------------------------------------------------------------------
  // Aplicar
  // -------------------------------------------------------------------------

  it('lucro: aplicar em 2027-04-15 transfere 600 de 88 para 59 (D 88 / C 59) e devolve a AplicacaoResultado', async () => {
    const { t, ex27 } = await cenarioLucro();

    const ap = await aplicar(t);

    expect(ap).toMatchObject({
      tenantId: t.ctx.tenantId,
      exercicioId: t.ex26.id,
      exercicioDestinoId: ex27.id,
      referenciaActa: ACTA,
      anuladaEm: null,
      criadoPorId: t.ctx.userId,
    });
    expect(f2(ap.valor), 'valor absoluto do resultado').toBe('600.00');
    expect(new Date(ap.dataDeliberacao).getTime()).toBe(DELIBERACAO.getTime());
    await exigirLancamentoAplicacao(t, ex27, ap, ['59:CREDITO:600.00', '88:DEBITO:600.00']);

    const linhas = await aplicacoes(t.ctx);
    expect(linhas, 'uma linha AplicacaoResultado gravada').toHaveLength(1);
    expect(linhas[0].id).toBe(ap.id);

    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id), '88 a zero em 2027').toBe('0.00');
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['59'], ex27.id), '59 credor 600 em 2027').toBe('600.00');

    // O balancete de verificação de 2027 mostra o mesmo.
    const bv = await runCtx(t.ctx, () =>
      contab.gerarBalanceteVerificacao({ exercicioId: ex27.id, periodoInicial: 1, periodoFinal: 12, incluir13: false }, t.ctx),
    );
    const linha = (codigo: string) => (bv as AnyDb).linhas.find((l: AnyDb) => l.conta?.codigo === codigo);
    expect(f2(linha('59')?.saldoCredor), '59 credor 600 no balancete').toBe('600.00');
    expect(f2(linha('88')?.saldoCredor ?? 0), '88 sem saldo credor').toBe('0.00');
    expect(f2(linha('88')?.saldoDevedor ?? 0), '88 sem saldo devedor').toBe('0.00');
    expect((bv as AnyDb).equilibrio).toEqual({ movimento: true, acumulado: true, saldo: true });
  }, 120_000);

  it('prejuízo: aplicar transfere 500 de 88 devedor para 59 (C 88 / D 59)', async () => {
    const t = await novoTenant();
    await cenarioPrejuizo2026(t);
    const ex27 = await abrir2027(t);
    await encerrar2026(t, '0');
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: 2027 tem AB efectivo').toHaveLength(1);
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id), 'pré-condição: 88 devedor 500 em 2027').toBe('-500.00');

    const ap = await aplicar(t);

    expect(f2(ap.valor), 'valor absoluto do prejuízo').toBe('500.00');
    await exigirLancamentoAplicacao(t, ex27, ap, ['59:DEBITO:500.00', '88:CREDITO:500.00']);
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id), '88 a zero em 2027').toBe('0.00');
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['59'], ex27.id), '59 devedor 500 em 2027').toBe('-500.00');
  }, 120_000);

  it('o valor é o saldo de 88 em 2027 no momento (AB + movimento anterior), não o resultado de 2026', async () => {
    const { t, ex27 } = await cenarioLucro();
    // Uma correcção lançada em 88 antes da deliberação: 600 + 25 = 625.
    await lancar(t.ctx, '2027-03-10T10:00:00Z', '111', '88', '25');

    const ap = await aplicar(t);

    expect(f2(ap.valor)).toBe('625.00');
    await exigirLancamentoAplicacao(t, ex27, ap, ['59:CREDITO:625.00', '88:DEBITO:625.00']);
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id)).toBe('0.00');
  }, 120_000);

  // -------------------------------------------------------------------------
  // Recusas
  // -------------------------------------------------------------------------

  it('2026 ainda ABERTO → EXERCICIO_NAO_ENCERRADO, sem escritas', async () => {
    const t = await novoTenant();
    await cenarioLucro2026(t);
    await abrir2027(t);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t)).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'EXERCICIO_NAO_ENCERRADO' });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('2027 inexistente → ABERTURA_EM_FALTA, e a recusa não cria o exercício 2027', async () => {
    const t = await novoTenant();
    await cenarioLucro2026(t);
    await encerrar2026(t, '100');
    expect(await db.exercicioContabil.count({ where: { tenantId: t.ctx.tenantId, codigo: '2027' } })).toBe(0);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t)).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'ABERTURA_EM_FALTA' });

    expect(await db.exercicioContabil.count({ where: { tenantId: t.ctx.tenantId, codigo: '2027' } }), '2027 não nasce').toBe(0);
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('2027 sem AB efectivo (2026 encerrado antes do #363) → ABERTURA_EM_FALTA', async () => {
    const t = await novoTenant();
    await cenarioLucro2026(t);
    const ex27 = await abrir2027(t);
    await db.exercicioContabil.update({ where: { id: t.ex26.id }, data: { estado: 'ENCERRADO_PROVISORIO' } });
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: 2027 sem AB').toHaveLength(0);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t)).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'ABERTURA_EM_FALTA' });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('data da deliberação fora de 2027 (dia fiscal de Maputo) → DATA_FORA_DO_EXERCICIO_SEGUINTE, sem escritas', async () => {
    const { t } = await cenarioLucro();
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });
    const exerciciosAntes = await db.exercicioContabil.count({ where: { tenantId: t.ctx.tenantId } });

    for (const { rotulo, data } of [
      { rotulo: 'em 2026', data: new Date('2026-12-20T10:00:00Z') },
      { rotulo: 'em 2028', data: new Date('2028-02-10T10:00:00Z') },
      { rotulo: '2027-12-31T22:30Z, já 1 de Janeiro de 2028 em Maputo', data: new Date('2027-12-31T22:30:00Z') },
    ]) {
      await expect(aplicar(t, { dataDeliberacao: data }), `deliberação ${rotulo}`).rejects.toMatchObject({
        name: 'BusinessRuleError',
        code: 'DATA_FORA_DO_EXERCICIO_SEGUINTE',
      });
    }

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await db.exercicioContabil.count({ where: { tenantId: t.ctx.tenantId } }), 'nenhum exercício novo (2028)').toBe(exerciciosAntes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('o período da deliberação (Abril de 2027) FECHADO → PERIODO_FECHADO, sem escritas', async () => {
    const { t, ex27 } = await cenarioLucro();
    await fecharMeses(t.ctx, ex27.id, [4]);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t)).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'PERIODO_FECHADO' });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('uma segunda aplicação com a primeira activa → RESULTADO_JA_APLICADO, sem escritas', async () => {
    const { t } = await cenarioLucro();
    await aplicar(t);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t, { dataDeliberacao: new Date('2027-05-10T10:00:00Z') })).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'RESULTADO_JA_APLICADO',
    });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(1);
    expect(await auditoriaAplicacao(t.ctx), 'a recusa não deixa linha de auditoria').toHaveLength(1);
  }, 120_000);

  it('ano de resultado zero (88 sem saldo em 2027) → SEM_RESULTADO_A_APLICAR, sem escritas', async () => {
    const t = await novoTenant();
    await cenarioZero2026(t);
    const ex27 = await abrir2027(t);
    await encerrar2026(t, '0');
    expect(await abEfectivos(t.ctx, ex27.id), 'pré-condição: 2027 tem AB efectivo (capital)').toHaveLength(1);
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id), 'pré-condição: 88 a zero').toBe('0.00');
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t)).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'SEM_RESULTADO_A_APLICAR' });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('referência da acta vazia → ValidationError VALIDACAO, sem escritas', async () => {
    const { t } = await cenarioLucro();
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t, { referenciaActa: '' })).rejects.toMatchObject({ name: 'ValidationError', code: 'VALIDACAO' });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect(await aplicacoes(t.ctx)).toHaveLength(0);
  }, 120_000);

  it('outro tenant: aplicar sobre o exercício alheio e anular a aplicação alheia → NotFoundError, nada muda', async () => {
    const { t } = await cenarioLucro();
    const outro = await novoTenant();
    const ap = await aplicar(t);
    const antesA = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(aplicar(t, {}, outro.ctx)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(anular(t, ap.id, MOTIVO_ANULAR, outro.ctx)).rejects.toMatchObject({ name: 'NotFoundError' });

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antesA);
    const linha = await db.aplicacaoResultado.findFirst({ where: { id: ap.id, tenantId: t.ctx.tenantId } });
    expect(linha.anuladaEm, 'a aplicação de A continua activa').toBeNull();
    expect((await db.lancamento.findFirst({ where: { id: ap.lancamentoId, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');
    expect(await aplicacoes(outro.ctx)).toHaveLength(0);
  }, 120_000);

  // -------------------------------------------------------------------------
  // Anular
  // -------------------------------------------------------------------------

  it('anular estorna o lançamento no MESMO período (Abril de 2027), marca anuladaEm e permite aplicar de novo', async () => {
    const { t, ex27 } = await cenarioLucro();
    const ap = await aplicar(t);
    const original = await exigirLancamentoAplicacao(t, ex27, ap, ['59:CREDITO:600.00', '88:DEBITO:600.00']);

    await anular(t, ap.id);

    const linha = await db.aplicacaoResultado.findFirst({ where: { id: ap.id, tenantId: t.ctx.tenantId } });
    expect(linha.anuladaEm, 'anuladaEm preenchido').toBeInstanceOf(Date);
    expect((await db.lancamento.findFirst({ where: { id: original.id, tenantId: t.ctx.tenantId } })).status).toBe('ESTORNADO');

    const estornos = await db.lancamento.findMany({
      where: { tenantId: t.ctx.tenantId, lancamentoEstornoId: original.id },
      include: { partidas: true },
    });
    expect(estornos, 'um estorno').toHaveLength(1);
    const e = estornos[0];
    expect(e.status).toBe('LANCADO');
    expect(e.tipo).toBe('ESTORNO');
    expect(e.periodoId, 'o estorno vai para o período do original, não para o mês de hoje').toBe(original.periodoId);
    expect(await partidasTexto(t.ctx, e.partidas)).toEqual(['59:CREDITO:600.00', '88:DEBITO:600.00'].map(inverter).sort());

    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id), '88 volta a 600').toBe('600.00');
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['59'], ex27.id), '59 volta a zero').toBe('0.00');

    // Anulada, pode aplicar-se de novo.
    const nova = await aplicar(t);
    expect(nova.id).not.toBe(ap.id);
    expect(nova.lancamentoId).not.toBe(ap.lancamentoId);
    expect(f2(nova.valor)).toBe('600.00');
    expect(nova.anuladaEm).toBeNull();
    expect(await saldoCredorNoExercicio(t.ctx, t.conta['88'], ex27.id)).toBe('0.00');
    expect(await aplicacoes(t.ctx)).toHaveLength(2);
  }, 120_000);

  it('anular com motivo curto → ValidationError VALIDACAO, nada muda', async () => {
    const { t } = await cenarioLucro();
    const ap = await aplicar(t);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    for (const motivo of ['', 'curto']) {
      await expect(anular(t, ap.id, motivo), `motivo «${motivo}»`).rejects.toMatchObject({
        name: 'ValidationError',
        code: 'VALIDACAO',
      });
    }

    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect((await db.aplicacaoResultado.findFirst({ where: { id: ap.id, tenantId: t.ctx.tenantId } })).anuladaEm).toBeNull();
    expect((await db.lancamento.findFirst({ where: { id: ap.lancamentoId, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');
  }, 120_000);

  it('o estorno genérico do lançamento da aplicação → LANCAMENTO_DE_APLICACAO (só pela anulação)', async () => {
    const { t } = await cenarioLucro();
    const ap = await aplicar(t);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    for (const { rotulo, data } of [
      { rotulo: 'com data de Abril de 2027', data: new Date('2027-04-20T10:00:00Z') },
      { rotulo: 'sem data (hoje)', data: undefined },
    ]) {
      await expect(
        runCtx(t.ctx, () =>
          contab.estornarLancamento({ lancamentoId: ap.lancamentoId, motivo: 'Estorno pela rota genérica', ...(data ? { data } : {}) }, t.ctx),
        ),
        `estorno genérico ${rotulo}`,
      ).rejects.toMatchObject({ name: 'BusinessRuleError', code: 'LANCAMENTO_DE_APLICACAO' });
    }

    expect((await db.lancamento.findFirst({ where: { id: ap.lancamentoId, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } })).toBe(antes);
    expect((await db.aplicacaoResultado.findFirst({ where: { id: ap.id, tenantId: t.ctx.tenantId } })).anuladaEm).toBeNull();
  }, 120_000);

  // -------------------------------------------------------------------------
  // Reabrir 2026
  // -------------------------------------------------------------------------

  it('reabrir 2026 com a aplicação activa → APLICACAO_DO_RESULTADO_REGISTADA, nada muda; depois de anular, reabre', async () => {
    const { t, ex27 } = await cenarioLucro();
    const ap = await aplicar(t);
    const [ab] = await abEfectivos(t.ctx, ex27.id);
    const antes = await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } });

    await expect(enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO_REABRIR }, t.ctx)).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'APLICACAO_DO_RESULTADO_REGISTADA',
    });

    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ENCERRADO_PROVISORIO');
    expect((await periodo(t.ctx, t.ex26.id, 13)).estado).toBe('FECHADO');
    expect((await db.lancamento.findFirst({ where: { id: ab.id, tenantId: t.ctx.tenantId } })).status, 'o AB de 2027 intacto').toBe('LANCADO');
    expect((await db.lancamento.findFirst({ where: { id: ap.lancamentoId, tenantId: t.ctx.tenantId } })).status).toBe('LANCADO');
    expect(await db.lancamento.count({ where: { tenantId: t.ctx.tenantId } }), 'nenhum lançamento novo').toBe(antes);
    expect(await db.reaberturaExercicio.count({ where: { tenantId: t.ctx.tenantId } })).toBe(0);

    await anular(t, ap.id);
    await enc.reabrirExercicio({ exercicioId: t.ex26.id, motivo: MOTIVO_REABRIR }, t.ctx);
    expect(await estadoExercicio(t.ctx, t.ex26.id)).toBe('ABERTO');
  }, 120_000);

  // -------------------------------------------------------------------------
  // Auditoria
  // -------------------------------------------------------------------------

  it('AuditLog explícito: AplicacaoResultado CREATE ao aplicar e UPDATE ao anular', async () => {
    const { t } = await cenarioLucro();

    const ap = await aplicar(t);
    const depoisAplicar = await auditoriaAplicacao(t.ctx);
    expect(depoisAplicar).toHaveLength(1);
    expect(depoisAplicar[0]).toMatchObject({
      tenantId: t.ctx.tenantId,
      userId: t.ctx.userId,
      entity: 'AplicacaoResultado',
      entityId: ap.id,
      action: 'CREATE',
    });

    await anular(t, ap.id);
    const depoisAnular = await auditoriaAplicacao(t.ctx);
    expect(depoisAnular).toHaveLength(2);
    expect(depoisAnular[1]).toMatchObject({
      tenantId: t.ctx.tenantId,
      userId: t.ctx.userId,
      entity: 'AplicacaoResultado',
      entityId: ap.id,
      action: 'UPDATE',
    });
  }, 120_000);

  // -------------------------------------------------------------------------
  // DFC — 59 → OP-00: a aplicação é neutra
  // -------------------------------------------------------------------------

  it('DFC de 2027: a aplicação não tem efeito em FIN-* e o total operacional não muda (59 mapeada a OP-00)', async () => {
    const { t, ex27 } = await cenarioLucro();
    await lancar(t.ctx, '2027-02-10T10:00:00Z', '111', '711', '200');
    const filtro = {
      periodoInicioId: (await periodo(t.ctx, ex27.id, 1)).id,
      periodoFimId: (await periodo(t.ctx, ex27.id, 12)).id,
    };
    const gerar = async () => {
      const r = (await runCtx(t.ctx, () => dfc.gerarDFC(filtro, t.ctx))) as AnyDb;
      expect('impedimentos' in r ? r.impedimentos : [], 'a DFC de 2027 sai sem impedimentos').toEqual([]);
      return r.atual.seccoes;
    };
    const totais = (s: AnyDb) => ({
      resultadoLiquido: f2(s.resultadoLiquido),
      operacional: f2(s.operacional.total),
      investimento: f2(s.investimento.total),
      financiamento: f2(s.financiamento.total),
    });

    const antes = await gerar();

    const mapeamento59 = await db.mapeamentoContaFluxo.findFirst({
      where: { tenantId: t.ctx.tenantId, contaId: t.conta['59'] },
      include: { rubrica: true },
    });
    expect(mapeamento59?.rubrica?.codigo, '59 mapeada a OP-00, com 88').toBe('OP-00');

    await aplicar(t);
    const depois = await gerar();

    expect(totais(depois), 'a aplicação 88 → 59 não muda nenhum total da DFC').toEqual(totais(antes));
    const contasFin = depois.financiamento.rubricas.flatMap((l: AnyDb) => l.contas.map((c: AnyDb) => c.conta.codigo));
    expect(contasFin, 'nenhuma linha FIN-* com 59 ou 88').not.toContain('59');
    expect(contasFin).not.toContain('88');
    for (const l of depois.financiamento.rubricas) {
      expect(String(l.rubrica.codigo).startsWith('FIN-'), 'secção financiamento só com FIN-*').toBe(true);
    }
  }, 120_000);
});
