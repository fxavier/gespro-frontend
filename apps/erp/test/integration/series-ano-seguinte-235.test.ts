/**
 * Oráculo — issue #235: criar as séries do ano seguinte a partir da UI.
 *
 * Hoje as séries do ano N+1 só nascem pelo cron de 1/12 (`abrir exercício` →
 * `bootstrapSeriesDocumento`). Não há agendador em produção (ADR-0026 §5): se o cron não
 * correr, a 1 de Janeiro toda a emissão pára com «série activa não encontrada».
 *
 * Contrato (decidido pelo orquestrador):
 *   Server Action `criarSeriesAnoSeguinte` em `@/server/actions/faturacao.actions`, sem input,
 *   permissão `faturacao:series:escrita` (a existente de gerir séries). Cria, para o ano
 *   seguinte ao ano corrente em Africa/Maputo, uma série ACTIVA por tipo de `SERIES_INICIAIS`
 *   (prefixo de `SERIES_INICIAIS`, formato `{prefixo}/{ano}/{numero:06}`, próximo nº 1) que
 *   ainda não exista — idempotente. Devolve `{ ano, criadas }`.
 *
 * Decisão conservadora do verificador (menos dados alterados): um tipo que JÁ TEM qualquer
 *   série no ano seguinte — activa ou inactiva, com o prefixo de omissão ou outro — não é
 *   tocado: nem se cria outra, nem se reactiva, nem se mexe na numeração. Só o ano seguinte é
 *   criado (nunca N+2, mesmo em Dezembro, onde o `bootstrapSeriesDocumento` também cria N+1
 *   do ano que recebe).
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` dobrado porque
 * o `updateTag` exige um pedido Next. O relógio é dobrado SÓ no `Date` (o ano corrente vem do
 * relógio do servidor, em Maputo). Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * o serviço e os índices (`@@unique` + índice parcial `SerieDocumento_activa_unica`).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:series-ano-seguinte-235; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
      acesso: 'aberto' | 'leitura' | 'fechado';
      emailVerificado?: boolean;
    };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

const PERMISSAO = 'faturacao:series:escrita';
const FORMATO = '{prefixo}/{ano}/{numero:06}';

/** Ano civil em Africa/Maputo (UTC+2 fixo) — oráculo próprio, não o do código. */
function anoMaputo(d: Date): number {
  return new Date(d.getTime() + 2 * 3_600_000).getUTCFullYear();
}

describe.skipIf(skip)('Criar séries do ano seguinte pela UI (#235) — DB efémera', () => {
  let db: any;
  let SERIES: Array<{ tipo: string; prefixo: string }>;
  let accao: (() => Promise<Resultado>) | undefined;

  const sufixo = Date.now();
  const tenants: string[] = [];
  let seqTenant = 0;

  async function novoTenant(tag: string): Promise<string> {
    seqTenant += 1;
    const id = `tenant-series-235-${tag}-${sufixo}`;
    await db.tenant.create({
      data: { id, nome: `Tenant #235 ${tag}`, slug: `series-235-${tag}-${sufixo}`, nuit: `${sufixo + seqTenant}`.slice(-9) },
    });
    tenants.push(id);
    return id;
  }

  function sessao(tenantId: string, permissions: string[] = [PERMISSAO], acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: `user-235-${sufixo}`, tenantId, permissions, acesso, emailVerificado: true } };
  }

  async function correr(): Promise<Resultado> {
    expect(typeof accao, 'faturacao.actions exporta a Server Action criarSeriesAnoSeguinte').toBe('function');
    return accao!();
  }

  /** Semeia as séries do ano corrente, como um tenant real já tem. */
  async function semearAnoCorrente(tenantId: string, ano: number): Promise<void> {
    await db.serieDocumento.createMany({
      data: SERIES.map((s) => ({ tenantId, tipo: s.tipo, prefixo: s.prefixo, ano, formatoNumero: FORMATO, ativo: true })),
    });
  }

  const seriesDo = (tenantId: string, ano?: number) =>
    db.serieDocumento.findMany({ where: { tenantId, ...(ano === undefined ? {} : { ano }) }, orderBy: [{ tipo: 'asc' }, { prefixo: 'asc' }] });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ SERIES_INICIAIS: SERIES } = await import('@/server/provisioning/tenant-bootstrap'));
    const actions = (await import('@/server/actions/faturacao.actions')) as unknown as Record<string, any>;
    accao = actions['criarSeriesAnoSeguinte'];
  });

  afterEach(() => {
    vi.useRealTimers();
    h.sessao = null;
  });

  afterAll(async () => {
    if (!db) return;
    await db.serieDocumento.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenants } } });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
  });

  // -------------------------------------------------------------------------
  // 1. Caminho feliz
  // -------------------------------------------------------------------------

  it('cria uma série activa por tipo de SERIES_INICIAIS para o ano seguinte em Maputo, e devolve { ano, criadas }', async () => {
    const T = await novoTenant('feliz');
    const ano = anoMaputo(new Date());
    await semearAnoCorrente(T, ano);
    sessao(T);

    const r = await correr();
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data).toEqual({ ano: ano + 1, criadas: SERIES.length });

    const novas = await seriesDo(T, ano + 1);
    expect(novas).toHaveLength(SERIES.length);
    for (const s of SERIES) {
      const linha = novas.find((n: any) => n.tipo === s.tipo);
      expect(linha, `série ${s.tipo} de ${ano + 1}`).toBeDefined();
      expect(linha).toMatchObject({
        prefixo: s.prefixo,
        ano: ano + 1,
        ativo: true,
        proximoNumero: 1,
        numeroInicial: 1,
        formatoNumero: FORMATO,
      });
    }
    // O ano corrente fica como estava; nada de N+2.
    expect(await seriesDo(T, ano)).toHaveLength(SERIES.length);
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: { notIn: [ano, ano + 1] } } })).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Idempotência
  // -------------------------------------------------------------------------

  it('é idempotente: a 2.ª corrida cria 0 e não duplica nem altera nada', async () => {
    const T = await novoTenant('idem');
    const ano = anoMaputo(new Date());
    sessao(T);

    const r1 = await correr();
    expect(r1.ok, JSON.stringify(r1.error)).toBe(true);
    expect(r1.data).toEqual({ ano: ano + 1, criadas: SERIES.length });
    const antes = await seriesDo(T, ano + 1);

    const r2 = await correr();
    expect(r2.ok, JSON.stringify(r2.error)).toBe(true);
    expect(r2.data).toEqual({ ano: ano + 1, criadas: 0 });

    const depois = await seriesDo(T, ano + 1);
    expect(depois.map((s: any) => [s.id, s.prefixo, s.ativo, s.proximoNumero])).toEqual(
      antes.map((s: any) => [s.id, s.prefixo, s.ativo, s.proximoNumero]),
    );
  });

  // -------------------------------------------------------------------------
  // 3. Tipos que já têm série no ano seguinte não são tocados
  // -------------------------------------------------------------------------

  it('não toca nos tipos que já têm série no ano seguinte (activa, inactiva ou já numerada)', async () => {
    const T = await novoTenant('exist');
    const ano = anoMaputo(new Date());
    const seg = ano + 1;
    // PROFORMA: activa com prefixo próprio — não pode nascer outra (nem a tentativa pode partir).
    const proforma = await db.serieDocumento.create({
      data: { tenantId: T, tipo: 'PROFORMA', prefixo: 'PXX', ano: seg, formatoNumero: FORMATO, ativo: true },
    });
    // NOTA_DEBITO: só inactiva, prefixo diferente do de omissão — o índice parcial deixaria
    // criar uma activa; a decisão conservadora é não tocar no tipo.
    const nd = await db.serieDocumento.create({
      data: { tenantId: T, tipo: 'NOTA_DEBITO', prefixo: 'NDZ', ano: seg, formatoNumero: FORMATO, ativo: false },
    });
    // FATURA: já numerada (próximo 7) com o prefixo de omissão — a numeração não volta a 1.
    const fatura = await db.serieDocumento.create({
      data: { tenantId: T, tipo: 'FATURA', prefixo: 'FAT', ano: seg, formatoNumero: FORMATO, ativo: true, proximoNumero: 7 },
    });
    sessao(T);

    const r = await correr();
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data).toEqual({ ano: seg, criadas: SERIES.length - 3 });

    const todas = await seriesDo(T, seg);
    expect(todas).toHaveLength(SERIES.length);
    expect(todas.filter((s: any) => s.tipo === 'PROFORMA')).toEqual([expect.objectContaining({ id: proforma.id, prefixo: 'PXX', ativo: true })]);
    expect(todas.filter((s: any) => s.tipo === 'NOTA_DEBITO')).toEqual([expect.objectContaining({ id: nd.id, prefixo: 'NDZ', ativo: false })]);
    expect(todas.filter((s: any) => s.tipo === 'FATURA')).toEqual([
      expect.objectContaining({ id: fatura.id, prefixo: 'FAT', ativo: true, proximoNumero: 7 }),
    ]);
    // Os restantes tipos nasceram activos.
    for (const s of SERIES.filter((x) => !['PROFORMA', 'NOTA_DEBITO', 'FATURA'].includes(x.tipo))) {
      expect(todas.filter((n: any) => n.tipo === s.tipo), s.tipo).toEqual([
        expect.objectContaining({ prefixo: s.prefixo, ativo: true, proximoNumero: 1 }),
      ]);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Relógio: Dezembro e a viragem do ano em Maputo
  // -------------------------------------------------------------------------

  it('em Dezembro cria só o ano seguinte (N+1), nunca N+2', async () => {
    const T = await novoTenant('dez');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-15T10:00:00Z'));
    sessao(T);

    const r = await correr();
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data).toEqual({ ano: 2027, criadas: SERIES.length });
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: 2027 } })).toBe(SERIES.length);
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: { not: 2027 } } })).toBe(0);
  });

  it('o ano corrente é o de Maputo: 31/12 às 22h30 UTC já é 1/1 em Maputo ⇒ ano seguinte = +2 do ano UTC', async () => {
    const T = await novoTenant('viragem');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T22:30:00Z')); // 2027-01-01 00:30 em Maputo
    sessao(T);

    const r = await correr();
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data).toEqual({ ano: 2028, criadas: SERIES.length });
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: 2028 } })).toBe(SERIES.length);
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: { not: 2028 } } })).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 5. Permissão, modo de leitura e isolamento
  // -------------------------------------------------------------------------

  it('sem faturacao:series:escrita recusa com SEM_PERMISSAO e não cria nada', async () => {
    const T = await novoTenant('semperm');
    sessao(T, ['faturacao:leitura']);

    const r = await correr();
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect(await db.serieDocumento.count({ where: { tenantId: T } })).toBe(0);
  });

  it('com o tenant em Leitura recusa com ACESSO_LEITURA (é uma escrita) e não cria nada', async () => {
    const T = await novoTenant('leitura');
    sessao(T, [PERMISSAO], 'leitura');

    const r = await correr();
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ACESSO_LEITURA');
    expect(await db.serieDocumento.count({ where: { tenantId: T } })).toBe(0);
  });

  it('só cria no tenant da sessão', async () => {
    const A = await novoTenant('iso-a');
    const B = await novoTenant('iso-b');
    sessao(A);

    const r = await correr();
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(await db.serieDocumento.count({ where: { tenantId: A } })).toBe(SERIES.length);
    expect(await db.serieDocumento.count({ where: { tenantId: B } })).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 6. Concorrência: dois cliques ao mesmo tempo
  // -------------------------------------------------------------------------

  it('duas corridas concorrentes: ambas ok, N séries no total, criadas somam N', async () => {
    const T = await novoTenant('conc');
    const ano = anoMaputo(new Date());
    sessao(T);

    const [r1, r2] = await Promise.all([correr(), correr()]);
    expect(r1.ok, JSON.stringify(r1.error)).toBe(true);
    expect(r2.ok, JSON.stringify(r2.error)).toBe(true);
    expect(r1.data.criadas + r2.data.criadas).toBe(SERIES.length);
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: ano + 1 } })).toBe(SERIES.length);
    expect(await db.serieDocumento.count({ where: { tenantId: T, ano: ano + 1, ativo: true } })).toBe(SERIES.length);
  });
});
