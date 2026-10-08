/**
 * E2E — ecrã de categorias de produto (issue #119; nó D:categorias-produto-119, oráculo do
 * verificador — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * O defeito: a categoria é obrigatória no produto, mas não havia ecrã para gerir
 * `CategoriaProduto` (`/inventario/categorias` é de activos). Contrato da UI (molde golden
 * standard, sem modais):
 *   - `/produtos/categorias` — lista (Server Component) com as categorias do tenant e uma
 *     ligação «Nova categoria» para a rota de criação;
 *   - rota de criação (`/produtos/categorias/nova` ou `/novo`) — formulário com «Nome»; gravar
 *     volta à lista, onde a categoria aparece;
 *   - `/produtos/categorias/[id]/editar` — formulário pré-preenchido; gravar actualiza o nome;
 *   - a categoria criada fica escolhível no combobox «Categoria» de `/produtos/novo`.
 * (A ligação do formulário de produto quando NÃO há categorias é provada pelo unit
 * `produtos/_components/__tests__/novo-produto-form-sem-categorias-119.test.ts` — o tenant
 * `demo` tem sempre categorias.)
 *
 * Escreve no tenant `demo` categorias com o prefixo `categorias-produto-119`; o `afterAll`
 * apaga-as (nenhum produto as referencia).
 */

import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const PREFIXO = 'categorias-produto-119';

function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function comBase<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

type LinhaCategoria = { id: string; nome: string; deletedAt: unknown };

async function categoriasDemo(nome: string): Promise<LinhaCategoria[]> {
  return comBase(async (c) => {
    const r = await c.query(
      `SELECT cp.id, cp.nome, cp."deletedAt"
         FROM "CategoriaProduto" cp
         JOIN "Tenant" t ON t.id = cp."tenantId" AND t.slug = 'demo'
        WHERE cp.nome = $1`,
      [nome],
    );
    return r.rows as LinhaCategoria[];
  });
}

test.afterAll(async () => {
  await comBase((c) =>
    c.query(
      `DELETE FROM "CategoriaProduto" cp
        USING "Tenant" t
        WHERE t.id = cp."tenantId" AND t.slug = 'demo' AND cp.nome LIKE $1
          AND NOT EXISTS (SELECT 1 FROM "Produto" p WHERE p."categoriaId" = cp.id)`,
      [`${PREFIXO}%`],
    ),
  );
});

const URL_LISTA = /\/produtos\/categorias\/?(\?.*)?$/;
const URL_CRIAR = /\/produtos\/categorias\/nov[ao]\/?(\?.*)?$/;

async function gravar(page: Page) {
  await page.getByRole('button', { name: /guardar|gravar|criar|salvar/i }).first().click();
}

/** Cria uma categoria pela UI a partir da lista. */
async function criarPelaUI(page: Page, nome: string): Promise<void> {
  await page.goto('/produtos/categorias');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /categorias/i }).first()).toBeVisible();

  await page.getByRole('link', { name: /nova categoria/i }).first().click();
  await page.waitForURL(URL_CRIAR);
  await page.waitForLoadState('networkidle');

  await page.getByLabel(/^nome/i).fill(nome);
  await gravar(page);

  await page.waitForURL(URL_LISTA, { timeout: 20_000 });
}

test.describe('#119 — categorias de produto: lista, criação e edição', () => {
  test('criar pela UI: a categoria fica na base e aparece na lista', async ({ page }) => {
    const nome = `${PREFIXO} criar ${Date.now()}`;

    await criarPelaUI(page, nome);

    await expect.poll(async () => (await categoriasDemo(nome)).filter((l) => l.deletedAt === null).length).toBe(1);
    await expect(page.getByText(nome, { exact: true }).first()).toBeVisible();
  });

  test('editar pela UI: o formulário vem pré-preenchido e o nome novo é gravado', async ({ page }) => {
    const nome = `${PREFIXO} editar ${Date.now()}`;
    const novoNome = `${nome} (editada)`;
    await criarPelaUI(page, nome);
    const [linha] = await categoriasDemo(nome);
    expect(linha, 'a categoria criada existe na base').toBeTruthy();

    await page.goto(`/produtos/categorias/${linha.id}/editar`);
    await page.waitForLoadState('networkidle');
    const campoNome = page.getByLabel(/^nome/i);
    await expect(campoNome).toHaveValue(nome);

    await campoNome.fill(novoNome);
    await gravar(page);
    await page.waitForURL(URL_LISTA, { timeout: 20_000 });

    await expect.poll(async () => (await categoriasDemo(novoNome)).map((l) => l.id)).toEqual([linha.id]);
    expect(await categoriasDemo(nome)).toHaveLength(0);
    await expect(page.getByText(novoNome, { exact: true }).first()).toBeVisible();
  });

  test('a categoria criada é escolhível no combobox «Categoria» de /produtos/novo', async ({ page }) => {
    const nome = `${PREFIXO} produto ${Date.now()}`;
    await criarPelaUI(page, nome);

    await page.goto('/produtos/novo');
    await page.waitForLoadState('networkidle');

    const caixa = page
      .getByRole('combobox')
      .filter({ hasText: /seleccionar categoria/i })
      .first();
    await caixa.click();
    await page.locator('[data-radix-popper-content-wrapper]').last().getByPlaceholder('Pesquisar…').fill(nome);
    await expect(page.getByRole('option', { name: nome })).toBeVisible();
  });
});
