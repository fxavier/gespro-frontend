/**
 * Oráculo da issue #527 (nó C:funcionalidades-cliente) — `/definicoes/faturacao` mostra os
 * limites e as funcionalidades de cada plano, vindos da tabela `Plano` (ADR-0049), e trata os
 * planos arquivados. Escrito pelo VERIFICADOR; alterá-lo do lado de quem implementa é BLOCKER.
 *
 * Renderiza a página (Server Component) com a assinatura e o serviço do catálogo dobrados, no
 * molde de `cancelar-subscricao-180.test.ts`. O duplo do `plano.service` devolve linhas com a
 * forma do Prisma (`codigo`, `limiteUtilizadores`, `arquivadoEm`…) e expõe as mesmas funções do
 * serviço real (`obterPlano`, `listarPlanos`, `listarPlanosPublicos`, `paraPublico`), com a mesma
 * semântica — a implementação pode ler o catálogo por qualquer uma delas.
 *
 * Tranca:
 * A. Cada cartão mostra as funcionalidades do plano (itens de lista), os limites de utilizadores e
 *    armazéns («Ilimitado» para -1, nunca «-1») e o suporte.
 * B. Um plano arquivado NÃO aparece como opção — nem o nome, nem um botão de subscrever.
 * C. Se o plano actual do tenant estiver arquivado, o cartão dele aparece, marcado «Plano actual
 *    (já não disponível para novas subscrições)», e SEM botão de subscrever/renovar; os planos
 *    disponíveis continuam a oferecer «Subscrever».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, isValidElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
    linha(0, 'BASICO', 'Básico', 3, 1, 'Suporte-oráculo email', [
      'Funcionalidade-oráculo facturas certificadas',
      'Funcionalidade-oráculo um armazém',
    ]),
    linha(1, 'PROFISSIONAL', 'Profissional', 15, 5, 'Suporte-oráculo prioritário', [
      'Funcionalidade-oráculo compras com aprovação',
    ], null, true),
    linha(2, 'EMPRESARIAL', 'Empresarial', -1, -1, 'Suporte-oráculo dedicado', [
      'Funcionalidade-oráculo multi-empresa',
    ]),
    linha(3, 'LEGADO', 'Plano-Legado-Oráculo', 7, 2, 'Suporte-oráculo legado', [
      'Funcionalidade-oráculo exclusiva do legado',
    ], ARQ),
    linha(4, 'ANTIGO', 'Plano-Antigo-Oráculo', 9, 3, 'Suporte-oráculo antigo', [
      'Funcionalidade-oráculo exclusiva do antigo',
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

beforeEach(() => {
  h.assinatura = null;
});

describe('#527 A — limites e funcionalidades do plano, vindos da tabela', () => {
  it('cada funcionalidade dos planos disponíveis aparece como item de lista', async () => {
    const html = await renderPagina('PROFISSIONAL');
    const itens = textosDe(html, 'li');

    for (const f of [
      'Funcionalidade-oráculo facturas certificadas',
      'Funcionalidade-oráculo um armazém',
      'Funcionalidade-oráculo compras com aprovação',
      'Funcionalidade-oráculo multi-empresa',
    ]) {
      expect(
        itens.filter((t) => t.includes(f)),
        `«${f}» tem de ser um <li> no cartão do plano`,
      ).toHaveLength(1);
    }
  });

  it('limite -1 aparece como «Ilimitado», nunca como -1', async () => {
    const html = await renderPagina('PROFISSIONAL');
    const t = texto(html);

    expect(t).toMatch(/Utilizadores\W{0,3}Ilimitado\b/);
    expect(t).toMatch(/Armaz[ée]ns\W{0,3}Ilimitado\b/);
    expect(t).not.toMatch(/(Utilizadores|Armaz[ée]ns)\W{0,3}-1\b/);
  });

  it('os limites finitos e o suporte de cada plano aparecem', async () => {
    const html = await renderPagina('PROFISSIONAL');
    const t = texto(html);

    expect(t).toMatch(/Utilizadores\W{0,3}3\b/);
    expect(t).toMatch(/Utilizadores\W{0,3}15\b/);
    expect(t).toMatch(/Armaz[ée]ns\W{0,3}5\b/);
    for (const s of ['Suporte-oráculo email', 'Suporte-oráculo prioritário', 'Suporte-oráculo dedicado']) {
      expect(t).toContain(s);
    }
  });
});

describe('#527 B — planos arquivados não são oferecidos', () => {
  it('com o plano actual disponível, nenhum arquivado aparece', async () => {
    const html = await renderPagina('PROFISSIONAL');
    const t = texto(html);

    for (const s of [
      'Plano-Legado-Oráculo',
      'Plano-Antigo-Oráculo',
      'Funcionalidade-oráculo exclusiva do legado',
      'Funcionalidade-oráculo exclusiva do antigo',
    ]) {
      expect(t, `«${s}» é de um plano arquivado`).not.toContain(s);
    }
    expect(t).not.toContain('já não disponível');
    // Os três disponíveis continuam a ter o seu botão.
    expect(textosDe(html, 'button').filter((b) => RE_SUBSCREVER.test(b))).toHaveLength(3);
  });
});

describe('#527 C — plano actual arquivado: mostrado, marcado, sem botão', () => {
  it('o cartão do plano actual arquivado aparece marcado', async () => {
    const html = await renderPagina('LEGADO');
    const t = texto(html);

    expect(t).toContain(MARCA_ARQUIVADO);
    expect(textosDe(html, 'li').some((i) => i.includes('Funcionalidade-oráculo exclusiva do legado'))).toBe(
      true,
    );
    expect(t).toContain('Suporte-oráculo legado');
  });

  it('não há botão de subscrever/renovar para o plano arquivado; os disponíveis mantêm «Subscrever»', async () => {
    const html = await renderPagina('LEGADO');
    const botoes = textosDe(html, 'button');

    const deSubscricao = botoes.filter((b) => RE_SUBSCREVER.test(b));
    expect(deSubscricao, 'um botão por plano disponível, nenhum para o arquivado').toHaveLength(3);
    expect(deSubscricao.every((b) => /subscrever/i.test(b))).toBe(true);
    expect(botoes.some((b) => b.includes('Plano-Legado-Oráculo'))).toBe(false);
  });

  it('o outro plano arquivado (que não é o actual) continua fora', async () => {
    const html = await renderPagina('LEGADO');
    const t = texto(html);

    expect(t).not.toContain('Plano-Antigo-Oráculo');
    expect(t).not.toContain('Funcionalidade-oráculo exclusiva do antigo');
    expect(t.split(MARCA_ARQUIVADO).length - 1).toBe(1);
  });
});
