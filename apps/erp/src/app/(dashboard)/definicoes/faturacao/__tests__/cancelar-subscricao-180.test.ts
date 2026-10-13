/**
 * Oráculo da issue #180 — «Cancelar subscrição» em LEITURA/FECHADA e texto desactualizado
 * (nó C:papeis-detalhe-subscricao-202-180; escrito pelo VERIFICADOR — alterá-lo do lado de quem
 * implementa é BLOCKER).
 *
 * Renderiza a página `/definicoes/faturacao` (Server Component) com a assinatura dobrada em cada
 * estado e tranca:
 *
 * A. O botão «Cancelar subscrição» aparece SÓ quando a assinatura está `TRIAL` ou `ATIVA`. Em
 *    `LEITURA`/`FECHADA` (ADR-0032) — e nos estados legados `SUSPENSA`/`EXPIRADO`/`CANCELADA`,
 *    decisão conservadora: o que não é TRIAL/ATIVA não cancela — não aparece. As outras acções
 *    (subscrever, gerir pagamento) continuam lá: pagar nunca se trava (ADR-0027 §6).
 * B. O texto da confirmação deixa de dizer que os utilizadores «deixam de conseguir iniciar
 *    sessão»: diz que a conta passa a modo de Leitura durante 30 dias e que nada se apaga.
 *
 * A recusa do lado do servidor (chamada directa à action em LEITURA/FECHADA) está no oráculo
 * unitário `src/server/services/plataforma/__tests__/assinatura.service.test.ts` (bloco #180).
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

vi.mock('@/server/actions/onboarding.actions', () => ({
  abrirPortalCliente: vi.fn(),
  cancelarSubscricao: vi.fn(),
  iniciarCheckout: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// O AlertDialog do Radix não renderiza o conteúdo fechado: aqui tudo renderiza inline, para que o
// texto da confirmação fique no HTML e possa ser lido.
vi.mock('@/components/ui/alert-dialog', async () => {
  const React: any = await vi.importActual('react');
  const passa = (tag: string, marca?: string) => {
    const Passa = ({ children, asChild: _a, ...resto }: any) =>
      React.createElement(
        tag,
        marca ? { 'data-oraculo': marca } : { className: resto.className },
        children,
      );
    Passa.displayName = `Oraculo(${tag})`;
    return Passa;
  };
  return {
    AlertDialog: passa('div'),
    AlertDialogTrigger: passa('div'),
    AlertDialogPortal: passa('div'),
    AlertDialogOverlay: passa('div'),
    AlertDialogContent: passa('section', 'alert-dialog-content'),
    AlertDialogHeader: passa('div'),
    AlertDialogFooter: passa('div'),
    AlertDialogTitle: passa('h2'),
    AlertDialogDescription: passa('div'),
    AlertDialogAction: passa('button'),
    AlertDialogCancel: passa('button'),
  };
});

const RE_CANCELAR = /cancelar\s+(a\s+)?subscri/i;

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

function assinatura(estado: string, over: Record<string, unknown> = {}) {
  const agora = Date.now();
  const comStripe = estado !== 'TRIAL';
  return {
    id: 'ass-1',
    tenantId: 'tenant-1',
    planoAssinatura: 'PROFISSIONAL',
    ciclo: comStripe ? 'MENSAL' : null,
    estado,
    stripeCustomerId: comStripe ? 'cus_1' : null,
    stripeSubscriptionId: comStripe ? 'sub_1' : null,
    trialInicio: new Date(agora - 20 * DIA),
    trialFim: estado === 'TRIAL' ? new Date(agora + 5 * DIA) : new Date(agora - 6 * DIA),
    leituraFim: estado === 'LEITURA' ? new Date(agora + 12 * DIA) : null,
    dataAtivacao: comStripe ? new Date(agora - 6 * DIA) : null,
    dataCancelamento: ['LEITURA', 'FECHADA', 'CANCELADA'].includes(estado)
      ? new Date(agora - 18 * DIA)
      : null,
    motivoCancelamento: null,
    tentativasFalhadas: 0,
    diasRestantesTrial: estado === 'TRIAL' ? 5 : 0,
    diasRestantesLeitura: estado === 'LEITURA' ? 12 : 0,
    acesso: estado === 'LEITURA' ? 'leitura' : estado === 'FECHADA' ? 'pagamento' : 'total',
    ...over,
  };
}

async function renderPagina(estado: string): Promise<string> {
  h.assinatura = assinatura(estado);
  const mod: any = await import('../page');
  const arvore = await resolver(await mod.default({}));
  return renderToStaticMarkup(createElement(Fragment, null, arvore));
}

function textoDoDialogo(html: string): string {
  const m = html.match(/<section data-oraculo="alert-dialog-content">([\s\S]*?)<\/section>/);
  return (m?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');
}

beforeEach(() => {
  h.assinatura = null;
});

describe('#180 — «Cancelar subscrição» só em TRIAL/ATIVA', () => {
  it.each(['TRIAL', 'ATIVA'])('em %s o botão aparece', async (estado) => {
    const html = await renderPagina(estado);
    expect(html).toMatch(/Subscrever|Renovar/);
    expect(html, `em ${estado} o cancelamento tem de estar disponível`).toMatch(RE_CANCELAR);
  });

  it.each(['LEITURA', 'FECHADA', 'SUSPENSA', 'EXPIRADO', 'CANCELADA'])(
    'em %s o botão NÃO aparece (e as acções de pagar continuam)',
    async (estado) => {
      const html = await renderPagina(estado);
      // A página renderizou mesmo (a ausência não é um crash): pagar nunca se trava.
      expect(html).toMatch(/Subscrever|Renovar/);
      expect(html, `em ${estado} não há nada para cancelar`).not.toMatch(RE_CANCELAR);
      expect(html).not.toContain('data-oraculo="alert-dialog-content"');
    },
  );
});

describe('#180 — texto da confirmação conforme o ADR-0032', () => {
  it.each(['TRIAL', 'ATIVA'])('em %s diz Leitura 30 dias e que nada se apaga', async (estado) => {
    const html = await renderPagina(estado);
    const texto = textoDoDialogo(html);
    expect(texto, 'o diálogo de confirmação tem de existir').not.toBe('');
    expect(texto).not.toMatch(/deixam de (conseguir )?(iniciar sess|entrar)/i);
    expect(texto).toMatch(/leitura/i);
    expect(texto).toMatch(/30\s*dias/i);
    expect(texto).toMatch(/(n[ãa]o|nada)[^.]{0,60}apag/i);
  });
});
