/**
 * ORÁCULO — issue #534 (nó E:planos-reparos-form, ADR-0049 §4): o detalhe do plano assinala o
 * ciclo sem Price do Stripe resolúvel, e nunca mostra o valor da env.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; alterar do lado de quem
 * implementa é BLOCKER.
 *
 * Contrato (página `/plataforma/planos/[id]`, Server Component):
 *   D1 Plano NÃO arquivado, ciclo sem Price na tabela nem env `STRIPE_PRICE_<CODIGO>_<CICLO>` →
 *      aviso num componente de alerta (`role="alert"`), com o texto exacto
 *      «Sem Price do Stripe para o ciclo mensal: o checkout deste ciclo vai falhar.»
 *      (ou «… ciclo anual: …»). Um aviso por ciclo em falta; nenhum para o ciclo resolúvel.
 *   D2 Ciclo cujo Price vem da env → «Price da variável de ambiente» (uma vez por ciclo nessa
 *      situação), e o VALOR da env nunca aparece no HTML.
 *   D3 Plano arquivado → nenhum aviso (já não vende).
 *   D4 Sem cores fixas na página (só tokens).
 *
 * Os dados chegam por `obterPlanoAdmin` (dobrado) e, se a página resolver a origem pela tabela,
 * por `prismaBase.plano` (dobrado com o mesmo plano). A env é a real do processo (`vi.stubEnv`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, isValidElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ plano: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'kc-1', plataformaAdmin: true } })),
}));
vi.mock('@/server/auth/plataforma-admin', () => ({
  exigirPlataformaAdmin: vi.fn(async () => ({ user: { id: 'kc-1', plataformaAdmin: true } })),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado');
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound inesperado');
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/plataforma/planos/p-534',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/server/actions/plataforma-planos.actions', () => ({
  criarPlano: vi.fn(),
  actualizarPlano: vi.fn(),
  arquivarPlano: vi.fn(),
  desarquivarPlano: vi.fn(),
  apagarPlano: vi.fn(),
}));
vi.mock('@/server/services/plataforma/plano-admin.service', () => {
  const obterPlanoAdmin = vi.fn(async () => h.plano);
  const listarPlanosAdmin = vi.fn(async () => (h.plano ? [h.plano] : []));
  return { obterPlanoAdmin, listarPlanosAdmin, planoAdminService: { obterPlanoAdmin, listarPlanosAdmin } };
});
vi.mock('@/server/db/client', () => {
  const pega = async ({ where }: any = {}) => {
    const p = h.plano;
    if (!p) return null;
    if (where?.codigo && where.codigo !== p.codigo) return null;
    if (where?.id && where.id !== p.id) return null;
    return p;
  };
  const prismaBase = {
    plano: {
      findUnique: vi.fn(pega),
      findFirst: vi.fn(pega),
      findMany: vi.fn(async () => (h.plano ? [h.plano] : [])),
    },
  };
  return { prismaBase, prisma: prismaBase };
});

const COD = 'TPRF_DET';
const ENV_M = `STRIPE_PRICE_${COD}_MENSAL`;
const ENV_A = `STRIPE_PRICE_${COD}_ANUAL`;
const SEGREDO_M = 'price_env_segredo_mensal_534';
const SEGREDO_A = 'price_env_segredo_anual_534';
const AVISO_MENSAL = 'Sem Price do Stripe para o ciclo mensal: o checkout deste ciclo vai falhar.';
const AVISO_ANUAL = 'Sem Price do Stripe para o ciclo anual: o checkout deste ciclo vai falhar.';
const DA_ENV = 'Price da variável de ambiente';

function plano(over: Record<string, unknown> = {}) {
  return {
    id: 'p-534',
    codigo: COD,
    nome: 'Plano detalhe',
    descricao: 'Plano de teste',
    precoMensalUsd: '29',
    precoAnualUsd: '290',
    stripePriceIdMensal: null,
    stripePriceIdAnual: null,
    limiteUtilizadores: 5,
    limiteArmazens: -1,
    suporte: 'Email (48h)',
    funcionalidades: ['Facturação'],
    ordem: 1,
    destaque: false,
    arquivadoEm: null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    assinaturas: 2,
    ...over,
  };
}

/** Resolve os componentes assíncronos (Server Components) da árvore, para depois a renderizar. */
async function resolver(n: ReactNode): Promise<ReactNode> {
  if (n == null || typeof n !== 'object') return n;
  if (Array.isArray(n)) return Promise.all(n.map(resolver));
  if (!isValidElement(n)) return n;
  const el: any = n;
  if (typeof el.type === 'function' && el.type.constructor?.name === 'AsyncFunction') {
    return resolver(await el.type(el.props));
  }
  if (el.props && 'children' in el.props) {
    const filhos = await resolver(el.props.children);
    return createElement(el.type, { ...el.props, key: el.key }, filhos);
  }
  return n;
}

async function renderDetalhe(p: Record<string, unknown>): Promise<string> {
  h.plano = p;
  const mod: any = await import('../[id]/page');
  const arvore = await resolver(await mod.default({ params: Promise.resolve({ id: String(p.id) }) }));
  return renderToStaticMarkup(createElement(Fragment, null, arvore));
}

function ocorrencias(html: string, s: string): number {
  return html.split(s).length - 1;
}

/** O aviso está dentro de um elemento com role="alert" (há um role="alert" antes dele). */
function emAlerta(html: string, aviso: string): boolean {
  const i = html.indexOf(aviso);
  return i >= 0 && html.lastIndexOf('role="alert"', i) >= 0;
}

beforeEach(() => {
  h.plano = null;
  delete process.env[ENV_M];
  delete process.env[ENV_A];
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env[ENV_M];
  delete process.env[ENV_A];
});

describe('#534 — detalhe do plano: ciclo sem Price do Stripe', () => {
  it('D1 — activo, mensal sem tabela nem env, anual na tabela → aviso só do mensal, em alerta', async () => {
    const html = await renderDetalhe(plano({ stripePriceIdAnual: 'price_tab_anual_534' }));
    expect(html).toContain(AVISO_MENSAL);
    expect(emAlerta(html, AVISO_MENSAL), 'o aviso tem de estar num componente de alerta (role="alert")').toBe(true);
    expect(html).not.toContain(AVISO_ANUAL);
    expect(html).not.toContain(DA_ENV);
    expect(html).toContain('price_tab_anual_534');
  });

  it('D1 — activo, nenhum Price em lado nenhum → um aviso por ciclo', async () => {
    const html = await renderDetalhe(plano());
    expect(ocorrencias(html, AVISO_MENSAL)).toBe(1);
    expect(ocorrencias(html, AVISO_ANUAL)).toBe(1);
    expect(emAlerta(html, AVISO_MENSAL)).toBe(true);
    expect(emAlerta(html, AVISO_ANUAL)).toBe(true);
  });

  it('D2 — mensal da env, anual em falta → «Price da variável de ambiente» sem o valor, e aviso do anual', async () => {
    vi.stubEnv(ENV_M, SEGREDO_M);
    const html = await renderDetalhe(plano());
    expect(ocorrencias(html, DA_ENV)).toBe(1);
    expect(html).not.toContain(SEGREDO_M);
    expect(html).not.toContain(AVISO_MENSAL);
    expect(html).toContain(AVISO_ANUAL);
  });

  it('D2 — os dois ciclos da env → duas indicações, nenhum aviso, nenhum valor', async () => {
    vi.stubEnv(ENV_M, SEGREDO_M);
    vi.stubEnv(ENV_A, SEGREDO_A);
    const html = await renderDetalhe(plano());
    expect(ocorrencias(html, DA_ENV)).toBe(2);
    expect(html).not.toContain(SEGREDO_M);
    expect(html).not.toContain(SEGREDO_A);
    expect(html).not.toContain('price_env_segredo');
    expect(html).not.toContain(AVISO_MENSAL);
    expect(html).not.toContain(AVISO_ANUAL);
  });

  it('D2 — tabela ganha à env: com os dois na tabela não há indicação de env nem valor da env', async () => {
    vi.stubEnv(ENV_M, SEGREDO_M);
    const html = await renderDetalhe(
      plano({ stripePriceIdMensal: 'price_tab_mensal_534', stripePriceIdAnual: 'price_tab_anual_534' }),
    );
    expect(html).not.toContain(DA_ENV);
    expect(html).not.toContain(SEGREDO_M);
    expect(html).not.toContain(AVISO_MENSAL);
    expect(html).not.toContain(AVISO_ANUAL);
  });

  it('D3 — arquivado sem Price nenhum → sem aviso', async () => {
    const html = await renderDetalhe(plano({ arquivadoEm: new Date('2026-10-10T10:00:00Z') }));
    expect(html).toContain('Plano detalhe');
    expect(html).not.toContain(AVISO_MENSAL);
    expect(html).not.toContain(AVISO_ANUAL);
  });

  it('D4 — a página não usa cores fixas (só tokens)', () => {
    const src = readFileSync(path.resolve(__dirname, '../[id]/page.tsx'), 'utf8');
    expect(src).not.toMatch(
      /\b(bg|text|border|ring)-(red|amber|yellow|orange|green|emerald|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/,
    );
    // Literais hex em classes arbitrárias ou strings (não «#526» em comentários).
    expect(src).not.toMatch(/\[#[0-9a-fA-F]{3,8}\]|['"]#[0-9a-fA-F]{3,8}['"]/);
  });
});
