/**
 * Oráculo da issue #535 (nó F:planos-ordem-grelha) — `/definicoes/faturacao` com 4+ planos.
 * Escrito pelo VERIFICADOR; alterá-lo do lado de quem implementa é BLOCKER.
 *
 * Molde: `funcionalidades-plano-527.test.ts` (mesmos duplos), agora com QUATRO planos disponíveis
 * (BASICO, PROFISSIONAL, EMPRESARIAL, PERSONALIZADO) e o plano actual do tenant arquivado (LEGADO).
 *
 * Tranca:
 * A. A grelha dos cartões de planos deixa de ser `md:grid-cols-3` fixa: nem `sm:`/`md:grid-cols-3`,
 *    e é responsiva — ou `auto-fit`/`auto-fill`, ou colunas em pelo menos dois breakpoints.
 * B. A grelha renderiza os 5 cartões: 4 disponíveis com «Subscrever» + o actual arquivado, marcado
 *    e sem botão.
 * C. O cartão do plano actual arquivado (fora de lista) não leva `key` solto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, isValidElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({ assinatura: null as Record<string, unknown> | null }));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'user-1', tenantId: 'tenant-1', email: 'admin@demo.mz', acesso: 'total' },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado');
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound inesperado');
  }),
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  usePathname: () => '/definicoes/faturacao',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/server/services/plataforma/assinatura.service', () => {
  const obterOuNulo = vi.fn(async () => h.assinatura);
  const obter = vi.fn(async () => h.assinatura);
  return { obterOuNulo, obter, assinaturaService: { obterOuNulo, obter } };
});

vi.mock('@/server/services/plataforma/plano.service', () => {
  const dec = (n: number) => ({ toString: () => String(n), toNumber: () => n, valueOf: () => n });
  const linha = (
    ordem: number,
    codigo: string,
    nome: string,
    limiteUtilizadores: number,
    limiteArmazens: number,
    suporte: string,
    funcionalidades: string[],
    arquivadoEm: Date | null = null,
    destaque = false,
  ) => ({
    id: `plano-${codigo}`,
    codigo,
    nome,
    descricao: `Descrição ${nome}`,
    precoMensalUsd: dec(10 * (ordem + 1)),
    precoAnualUsd: dec(100 * (ordem + 1)),
    stripePriceIdMensal: null,
    stripePriceIdAnual: null,
    limiteUtilizadores,
    limiteArmazens,
    suporte,
    funcionalidades,
    ordem,
    destaque,
    arquivadoEm,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
  const ARQ = new Date('2026-09-01T00:00:00Z');
  const linhas = [
    linha(0, 'BASICO', 'Básico', 3, 1, 'Suporte-oráculo email', ['Funcionalidade-oráculo B']),
    linha(1, 'PROFISSIONAL', 'Profissional', 15, 5, 'Suporte-oráculo prioritário', [
      'Funcionalidade-oráculo P',
    ], null, true),
    linha(2, 'EMPRESARIAL', 'Empresarial', -1, -1, 'Suporte-oráculo dedicado', [
      'Funcionalidade-oráculo E',
    ]),
    linha(3, 'PERSONALIZADO', 'Plano-Personalizado-Oráculo', 50, 10, 'Suporte-oráculo à medida', [
      'Funcionalidade-oráculo X',
    ]),
    linha(4, 'LEGADO', 'Plano-Legado-Oráculo', 7, 2, 'Suporte-oráculo legado', [
      'Funcionalidade-oráculo exclusiva do legado',
    ], ARQ),
  ];
  const paraPublico = (p: (typeof linhas)[number]) => ({
    id: p.codigo,
    nome: p.nome,
    descricao: p.descricao,
    limites: {
      utilizadores: p.limiteUtilizadores,
      armazens: p.limiteArmazens,
      suporte: p.suporte,
    },
    precoMensal: { valor: Number(p.precoMensalUsd.toString()), moeda: 'USD' },
    precoAnual: { valor: Number(p.precoAnualUsd.toString()), moeda: 'USD' },
    destaque: p.destaque,
    funcionalidades: [...p.funcionalidades],
  });
  const obterPlano = vi.fn(async (codigo: string) => linhas.find((l) => l.codigo === codigo) ?? null);
  const listarPlanos = vi.fn(async () => [...linhas]);
  const listarPlanosPublicos = vi.fn(async () =>
    linhas.filter((l) => !l.arquivadoEm).map(paraPublico),
  );
  const exigirPlanoDisponivel = vi.fn(async (codigo: string) => {
    const p = linhas.find((l) => l.codigo === codigo);
    if (!p || p.arquivadoEm) throw new Error('PLANO_INDISPONIVEL');
    return p;
  });
  return {
    obterPlano,
    listarPlanos,
    listarPlanosPublicos,
    paraPublico,
    exigirPlanoDisponivel,
    planoService: { obterPlano, listarPlanos, listarPlanosPublicos, exigirPlanoDisponivel },
  };
});

vi.mock('@/server/actions/onboarding.actions', () => ({
  abrirPortalCliente: vi.fn(),
  cancelarSubscricao: vi.fn(),
  iniciarCheckout: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

const DIA = 86_400_000;

function assinatura(planoAssinatura: string) {
  const agora = Date.now();
  return {
    id: 'ass-1',
    tenantId: 'tenant-1',
    planoAssinatura,
    ciclo: 'MENSAL',
    estado: 'ATIVA',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    trialInicio: new Date(agora - 40 * DIA),
    trialFim: new Date(agora - 26 * DIA),
    leituraFim: null,
    dataAtivacao: new Date(agora - 26 * DIA),
    dataCancelamento: null,
    motivoCancelamento: null,
    tentativasFalhadas: 0,
    diasRestantesTrial: 0,
    diasRestantesLeitura: 0,
    acesso: 'total',
  };
}

async function renderPagina(planoActual: string): Promise<string> {
  h.assinatura = assinatura(planoActual);
  const mod: any = await import('../page');
  const arvore = await resolver(await mod.default({}));
  return renderToStaticMarkup(createElement(Fragment, null, arvore));
}

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Textos (limpos) de cada elemento de um dado tipo. */
function textosDe(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  return [...html.matchAll(re)].map((m) => texto(m[1]!).trim());
}


const RE_SUBSCREVER = /subscrever|renovar/i;
const MARCA_ARQUIVADO = 'Plano actual (já não disponível para novas subscrições)';
const NOMES = [
  'Plano-Legado-Oráculo',
  'Básico',
  'Profissional',
  'Empresarial',
  'Plano-Personalizado-Oráculo',
];

/** Classe da `<div>` de grelha que envolve os cartões (a última `grid` antes do conteúdo do 1.º cartão). */
function classeDaGrelha(html: string): string {
  // Âncoras que só existem DENTRO dos cartões (o cabeçalho da página também cita o nome do plano
  // actual): a marca do arquivado e as funcionalidades (itens de lista de cada cartão).
  const ancoras = [MARCA_ARQUIVADO, 'Funcionalidade-oráculo'];
  const primeiro = Math.min(
    ...ancoras.map((n) => html.indexOf(n)).filter((i) => i >= 0),
  );
  expect(Number.isFinite(primeiro), 'nenhum cartão de plano renderizado').toBe(true);
  const antes = html.slice(0, primeiro);
  const grelhas = [...antes.matchAll(/<div\b[^>]*class="([^"]*\bgrid\b[^"]*)"/g)];
  expect(grelhas.length, 'os cartões têm de estar dentro de uma grelha').toBeGreaterThan(0);
  return grelhas[grelhas.length - 1]![1]!;
}

beforeEach(() => {
  h.assinatura = null;
});

describe('#535 A — a grelha de planos adapta-se a 4+ cartões', () => {
  it('não usa grid-cols-3 fixo a partir de sm/md', async () => {
    const html = await renderPagina('LEGADO');
    const classe = classeDaGrelha(html);

    expect(classe.split(/\s+/)).not.toContain('md:grid-cols-3');
    expect(classe.split(/\s+/)).not.toContain('sm:grid-cols-3');
  });

  it('a grelha é responsiva (auto-fit/auto-fill ou colunas em ≥2 breakpoints)', async () => {
    const html = await renderPagina('LEGADO');
    const classe = classeDaGrelha(html);
    const tokens = classe.split(/\s+/);

    const autoAjuste = /auto-(fit|fill)/.test(classe);
    const breakpoints = new Set(
      tokens
        .map((t) => /^(sm|md|lg|xl|2xl):grid-cols-/.exec(t)?.[1])
        .filter((b): b is string => !!b),
    );
    expect(
      autoAjuste || breakpoints.size >= 2,
      `classe da grelha «${classe}» não se adapta a 4+ cartões`,
    ).toBe(true);
  });
});

describe('#535 B — 4 planos disponíveis + o actual arquivado', () => {
  it('renderiza os 5 cartões: 4 com «Subscrever» e o arquivado marcado, sem botão', async () => {
    const html = await renderPagina('LEGADO');
    const t = texto(html);

    for (const n of NOMES) expect(t, `falta o cartão «${n}»`).toContain(n);
    expect(t.split(MARCA_ARQUIVADO).length - 1).toBe(1);

    const botoes = textosDe(html, 'button').filter((b) => RE_SUBSCREVER.test(b));
    expect(botoes).toHaveLength(4);
    expect(botoes.every((b) => /subscrever/i.test(b))).toBe(true);
    expect(textosDe(html, 'li').some((i) => i.includes('Funcionalidade-oráculo X'))).toBe(true);
  });
});

describe('#535 C — sem `key` solto no cartão arquivado', () => {
  it('o <Card> do plano actual arquivado não declara key', () => {
    const fonte = readFileSync(join(__dirname, '..', 'faturacao-acoes.tsx'), 'utf8');
    const i = fonte.indexOf('planoActualArquivado && (');
    expect(i, 'ramo do plano actual arquivado não encontrado').toBeGreaterThanOrEqual(0);
    const abertura = /<Card\b[^>]*>/.exec(fonte.slice(i));
    expect(abertura, 'cartão do plano arquivado não encontrado').not.toBeNull();
    expect(abertura![0]).not.toMatch(/\bkey=/);
  });
});
