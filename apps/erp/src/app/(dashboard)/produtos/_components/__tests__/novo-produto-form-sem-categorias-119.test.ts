/**
 * Oráculo #119 — o formulário de Novo Produto liga para criar categoria quando não há nenhuma.
 *
 * A categoria é obrigatória no produto (`ProdutoCreateSchema.categoriaId`). Um tenant acabado de
 * registar não tem categorias de produto (o `tenant-bootstrap` não as cria): sem uma ligação no
 * próprio formulário, o utilizador fica num combobox vazio e não consegue gravar o produto.
 *
 * Contrato:
 *   - `NovoProdutoForm` com `categorias: []` mostra uma ligação (`<a href>`) para
 *     `/produtos/categorias/nov[ao]` (o ecrã de criação de categoria de produto);
 *
 * Render no servidor (`react-dom/server`), sem browser: a action, o router e o toast são dobrados.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/server/actions/inventario.actions', () => ({
  criarProdutoAction: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/produtos/novo',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

/** Todos os href de <a> no HTML renderizado. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
}

const LIGACAO_CRIAR_CATEGORIA = /^\/produtos\/categorias\/nov[ao](?:[?#].*)?$/;

async function renderForm(categorias: unknown[]): Promise<string> {
  const mod: any = await import('../novo-produto-form');
  return renderToStaticMarkup(createElement(mod.NovoProdutoForm, { categorias }));
}

describe('#119 — NovoProdutoForm sem categorias liga para criar categoria', () => {
  it('sem nenhuma categoria → há uma ligação para /produtos/categorias/nov[ao]', async () => {
    const html = await renderForm([]);
    const ligacoes = hrefs(html).filter((h) => LIGACAO_CRIAR_CATEGORIA.test(h));
    expect(ligacoes, `ligações encontradas: ${JSON.stringify(hrefs(html))}`).not.toHaveLength(0);
  });
});
