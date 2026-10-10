/**
 * Oráculo da issue #183 — parte de UI (nó C:notificacoes-export-leitura-183-184; escrito pelo
 * VERIFICADOR — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * O comportamento do serviço (pesquisa `q` e cursor estável) está no oráculo de integração
 * `test/integration/notificacoes-pesquisa-paginacao-183.test.ts`; a navegação real no browser no
 * E2E `e2e/59-notificacoes-export-leitura-183-184.spec.ts`. Este ficheiro tranca, sem browser:
 *
 * A. `/notificacoes` — pesquisa e paginação ligadas:
 *    - a página continua a ter a caixa de pesquisa (FilterBar com `searchKey="q"`) e passa `q`,
 *      `cursor` e `take` do URL ao serviço;
 *    - o `NotificacoesList` (que já recebe `nextCursor`) USA-O: com `nextCursor` mostra um controlo
 *      de página seguinte («Seguinte» / «Próxima página» / «Carregar mais» / «Mais antigas») que
 *      leva a um URL com `cursor=<nextCursor>` e que PRESERVA os filtros activos (`q`, `tipo`…);
 *    - sem `nextCursor` e sem cursor no URL, não há controlo de página seguinte;
 *    - numa página que não é a primeira (há `cursor` no URL) há forma de voltar ao início, que
 *      retira o `cursor` e mantém o `q`.
 * B. `/analytics` — «Exportar Relatório» deixa de ser um botão inerte: ou sai da página, ou é uma
 *    ligação (`href`) para uma exportação EXISTENTE (`src/app/api/**\/route.ts` real; se for a
 *    genérica `/api/export/<modulo>`, o módulo existe no `EXPORT_REGISTRY`). Decisão conservadora
 *    aceite pelos dois ramos: nenhum endpoint novo é exigido.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  botoes: [] as { texto: string; onClick?: () => void; href?: string }[],
  navegacoes: [] as string[],
  searchParams: '' as string,
}));

vi.mock('react', async (importOriginal) => {
  const r: any = await importOriginal();
  return { ...r, default: r, useTransition: () => [false, (fn: () => unknown) => { void fn(); }] };
});

vi.mock('next/navigation', () => {
  const router = {
    push: (u: string) => h.navegacoes.push(u),
    replace: (u: string) => h.navegacoes.push(u),
    refresh: () => undefined,
    back: () => undefined,
    prefetch: () => undefined,
  };
  return {
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(h.searchParams),
    usePathname: () => '/notificacoes',
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

vi.mock('@/server/actions/notificacoes.actions', () => ({
  marcarNotificacaoLida: vi.fn(async () => ({ ok: true, data: {} })),
  marcarTodasNotificacoesLidas: vi.fn(async () => ({ ok: true, data: { count: 0 } })),
  actualizarPreferenciaNotificacao: vi.fn(async () => ({ ok: true, data: {} })),
}));

function textoDe(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textoDe).join('');
  if (isValidElement(n)) return textoDe((n.props as any).children);
  return '';
}

vi.mock('@/components/ui/button', async () => {
  const React: any = await vi.importActual('react');
  const Button = (props: any) => {
    const { asChild, children, onClick, ...resto } = props;
    const texto = [textoDe(children), props['aria-label'] ?? '', props.title ?? ''].join(' ').trim();
    if (asChild && React.isValidElement(children)) {
      h.botoes.push({ texto, href: (children.props as any).href });
      return children;
    }
    h.botoes.push({ texto, onClick });
    return React.createElement('button', { ...resto, type: props.type ?? 'button' }, children);
  };
  return { Button, buttonVariants: () => '' };
});

const ERP = path.resolve(__dirname, '../../../../..');
const SRC = path.join(ERP, 'src');
const NOTIF = path.join(SRC, 'app/(dashboard)/notificacoes');
const ANALYTICS = path.join(SRC, 'app/(dashboard)/analytics');

const NEXT = 'clh3am8ka0000proximo00000';
const RE_SEGUINTE = /seguinte|pr[oó]xim|carregar mais|mais antigas|ver mais/i;
const RE_INICIO = /in[ií]cio|primeira|anterior|mais recentes|voltar/i;

const item = (i: number) => ({
  id: `clh3am8ka0000item${String(i).padStart(8, '0')}`,
  tipo: 'ALERTA_SISTEMA',
  titulo: `Fatura ${i}`,
  mensagem: `Mensagem ${i}`,
  canal: 'IN_APP',
  entidadeTipo: null,
  entidadeId: null,
  lida: false,
  lidaEm: null,
  estadoEnvio: 'ENVIADO',
  enviadoEm: null,
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
});

async function renderLista(props: { nextCursor: string | null }, searchParams = '') {
  h.searchParams = searchParams;
  const mod: any = await import('../_components/notificacoes-list');
  const html = renderToStaticMarkup(
    createElement(mod.NotificacoesList, { items: [item(1), item(2)], temNaoLidas: true, ...props }),
  );
  return html;
}

/** Destinos dos controlos cujo texto casa com `re`: hrefs de `<a>` no HTML e navegações ao clicar. */
function destinos(html: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = m[1]!;
    const texto = m[2]!.replace(/<[^>]+>/g, ' ') + ' ' + (attrs.match(/aria-label="([^"]*)"/)?.[1] ?? '');
    const href = attrs.match(/href="([^"]*)"/)?.[1];
    if (href && re.test(texto)) out.push(href.replace(/&amp;/g, '&'));
  }
  for (const b of h.botoes) {
    if (!re.test(b.texto)) continue;
    if (b.href) out.push(b.href);
    else if (b.onClick) {
      const antes = h.navegacoes.length;
      b.onClick();
      out.push(...h.navegacoes.slice(antes));
    }
  }
  return [...new Set(out)];
}

function params(destino: string): URLSearchParams {
  return new URL(destino, 'http://x/notificacoes').searchParams;
}

beforeEach(() => {
  h.botoes.length = 0;
  h.navegacoes.length = 0;
  h.searchParams = '';
});

// ─── A. Notificações ────────────────────────────────────────────────────────

describe('#183 — /notificacoes: pesquisa e paginação ligadas', () => {
  it('a página mantém a pesquisa (FilterBar searchKey="q") e passa q, cursor e take ao serviço', () => {
    const fonte = fs.readFileSync(path.join(NOTIF, 'page.tsx'), 'utf8');
    expect(fonte).toMatch(/searchKey\s*=\s*["']q["']/);
    const chamada = fonte.slice(fonte.indexOf('notificacaoService.listar'));
    expect(chamada).toMatch(/\bq\s*:/);
    expect(chamada).toMatch(/\bcursor\s*:/);
    expect(chamada).toMatch(/\btake\s*:/);
  });

  it('o NotificacoesList usa o nextCursor (não o descarta)', () => {
    const fonte = fs.readFileSync(path.join(NOTIF, '_components/notificacoes-list.tsx'), 'utf8');
    expect(fonte, 'nextCursor não pode ser renomeado para _nextCursor e ignorado').not.toMatch(/nextCursor\s*:\s*_\w+/);
  });

  it('com nextCursor há um controlo de página seguinte que leva a cursor=<nextCursor>', async () => {
    const html = await renderLista({ nextCursor: NEXT });
    const ds = destinos(html, RE_SEGUINTE);
    expect(ds.length, `controlo de página seguinte; botões vistos: ${JSON.stringify(h.botoes.map((b) => b.texto))}`).toBeGreaterThan(0);
    expect(ds.some((d) => params(d).get('cursor') === NEXT), JSON.stringify(ds)).toBe(true);
  });

  it('a página seguinte preserva os filtros activos (q, tipo, apenasNaoLidas)', async () => {
    const html = await renderLista({ nextCursor: NEXT }, 'q=fatura&tipo=ALERTA_SISTEMA&apenasNaoLidas=true');
    const ds = destinos(html, RE_SEGUINTE).filter((d) => params(d).get('cursor') === NEXT);
    expect(ds.length, JSON.stringify(destinos(html, RE_SEGUINTE))).toBeGreaterThan(0);
    for (const d of ds) {
      const p = params(d);
      expect(p.get('q'), d).toBe('fatura');
      expect(p.get('tipo'), d).toBe('ALERTA_SISTEMA');
      expect(p.get('apenasNaoLidas'), d).toBe('true');
    }
  });

  it('sem nextCursor (e na primeira página) não há controlo de página seguinte', async () => {
    const html = await renderLista({ nextCursor: null });
    expect(destinos(html, RE_SEGUINTE)).toEqual([]);
  });

  it('numa página que não é a primeira há forma de voltar ao início, sem cursor e com o q', async () => {
    const html = await renderLista({ nextCursor: null }, 'q=fatura&cursor=clh3am8ka0000anterior0000');
    const ds = destinos(html, RE_INICIO).filter((d) => d.includes('notificacoes') || d.startsWith('?'));
    expect(ds.length, `botões vistos: ${JSON.stringify(h.botoes.map((b) => b.texto))}`).toBeGreaterThan(0);
    for (const d of ds) {
      expect(params(d).get('cursor'), d).toBeNull();
      expect(params(d).get('q'), d).toBe('fatura');
    }
  });
});

// ─── B. Analytics ───────────────────────────────────────────────────────────

function ficheiros(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : ficheiros(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Resolve `/api/a/b?x` para um `route.ts` real, aceitando segmentos dinâmicos `[x]`. */
function rotaApiExiste(url: string): boolean {
  const segs = url.split('?')[0]!.split('/').filter(Boolean);
  function procura(dir: string, i: number): boolean {
    if (i === segs.length) return fs.existsSync(path.join(dir, 'route.ts'));
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir, { withFileTypes: true }).some((e) => {
      if (!e.isDirectory()) return false;
      if (e.name === segs[i]) return procura(path.join(dir, e.name), i + 1);
      if (/^\[[^.]+\]$/.test(e.name)) return procura(path.join(dir, e.name), i + 1);
      return false;
    });
  }
  return procura(path.join(SRC, 'app'), 0);
}

describe('#183 — /analytics: «Exportar Relatório» não é um botão inerte', () => {
  it('ou não existe, ou é uma ligação para uma exportação existente', () => {
    const fontes = ficheiros(ANALYTICS).map((f) => ({ f, c: fs.readFileSync(f, 'utf8') }));
    const ocorrencias = fontes.flatMap(({ f, c }) =>
      [...c.matchAll(/Exportar/g)]
        .filter((m) => {
          // Ignora comentários de linha/bloco que mencionem a palavra.
          const linha = c.slice(c.lastIndexOf('\n', m.index!) + 1, m.index!);
          return !/^\s*(\/\/|\*|\/\*)/.test(linha);
        })
        .map((m) => ({ f, antes: c.slice(Math.max(0, m.index! - 700), m.index!) })),
    );

    for (const { f, antes } of ocorrencias) {
      const rel = path.relative(ERP, f);
      // O elemento que contém o texto: o último `<Button`/`<a`/`<Link` antes do texto.
      const abre = Math.max(antes.lastIndexOf('<Button'), antes.lastIndexOf('<a '), antes.lastIndexOf('<Link'));
      expect(abre, `${rel}: «Exportar» fora de um elemento reconhecível`).toBeGreaterThan(-1);
      const elemento = antes.slice(abre);
      expect(elemento, `${rel}: «Exportar» sem onClick/href — botão inerte`).toMatch(/href\s*=\s*\{?\s*[`'"]\/api\//);
      const url = elemento.match(/href\s*=\s*\{?\s*[`'"](\/api\/[^`'"$]*)/)![1]!;
      expect(rotaApiExiste(url), `${rel}: ${url} não corresponde a nenhum route.ts`).toBe(true);
      const generica = url.match(/^\/api\/export\/([^/?]+)/);
      if (generica) {
        const registo = fs.readFileSync(path.join(SRC, 'server/services/plataforma/export.service.ts'), 'utf8');
        const bloco = registo.slice(registo.indexOf('EXPORT_REGISTRY'));
        expect(bloco, `${rel}: módulo «${generica[1]}» fora do EXPORT_REGISTRY`).toMatch(
          new RegExp(`['"]?${generica[1]!.replace(/[-]/g, '\\-')}['"]?\\s*:`),
        );
      }
    }
  });
});
