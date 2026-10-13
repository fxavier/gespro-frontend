/**
 * Oráculo E2E — issues #114 e #115.
 *
 * #115 — arquivar fornecedor passa a ser reversível (contrato de UI, regras «sem modais»):
 *   - em /fornecedores/[id] de um fornecedor activo há «Arquivar»; a confirmação (AlertDialog)
 *     já NÃO diz que se reverte «editando» o fornecedor — o caminho é a acção «Reactivar»;
 *   - em /fornecedores/lista há uma ligação «Arquivados» que leva a uma lista onde o fornecedor
 *     arquivado aparece; daí abre-se o detalhe;
 *   - no detalhe de um arquivado há o botão «Reactivar»; pede confirmação num AlertDialog;
 *     confirmar grava `deletedAt = null` e `status = 'ATIVO'` e o fornecedor volta à lista padrão;
 *   - cancelar o AlertDialog de «Reactivar» não muda nada.
 *
 * #114 — as ligações das listas de serviços abrem páginas reais: para cada lista (serviços,
 *   agendamentos, contratos, categorias), toda a ligação de linha/«Editar» que exista responde
 *   sem 404. (O oráculo estático `src/app/(dashboard)/__tests__/rotas-fornecedor-114-115.test.ts`
 *   prova que não há ligações para rotas inexistentes; este prova o runtime.) Listas sem linhas
 *   no tenant `demo` não têm ligações a provar e são anotadas.
 *
 * Dados (prefixo único `rotas-fornecedor-114-115`): um fornecedor inserido por SQL no tenant
 * `demo`, apagado no beforeAll e no afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — o texto da confirmação fala em «editando», não
 * há «Arquivados» nem «Reactivar», e as ligações de agendamentos/contratos/editar dão 404.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/56-rotas-fornecedor-114-115.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:rotas-fornecedor-114-115; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'rotas-fornecedor-114-115';
// Forma cuid: o schema da action usa `.cuid()`.
const ID_FORN = `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const NOME_FORN = `E2E Fornecedor 114-115 ${ID_FORN.slice(-5)}`;

function dbUrl(): string {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // já carregado ou inexistente
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function tenantDemo(c: Client): Promise<string> {
  const r = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
  if (!r.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  return r.rows[0].id;
}

async function limpar(c: Client, tenantId: string): Promise<void> {
  await c.query(`DELETE FROM "Fornecedor" WHERE "tenantId" = $1 AND codigo LIKE $2`, [tenantId, `${MARCA}%`]);
}

async function estado(): Promise<{ arquivado: boolean; status: string } | null> {
  return withPg(async (c) => {
    const r = await c.query<{ arquivado: boolean; status: string }>(
      `SELECT ("deletedAt" IS NOT NULL) AS arquivado, status::text AS status FROM "Fornecedor" WHERE id = $1`,
      [ID_FORN],
    );
    return r.rows[0] ?? null;
  });
}

async function abrir(page: Page, rota: string) {
  const resp = await page.goto(`${BASE}${rota}`);
  await page.waitForLoadState('networkidle');
  return resp;
}

test.describe(`#115 — arquivar e reactivar fornecedor (${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      await c.query(
        `INSERT INTO "Fornecedor" (id, "tenantId", codigo, nome, tipo, nuit, email, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'PESSOA_JURIDICA', $5, $6, now(), now())`,
        [ID_FORN, tenantId, `${MARCA}-${ID_FORN.slice(-6)}`, NOME_FORN, `9${String(Date.now()).slice(-8)}`, `${MARCA}@e2e.mz`],
      );
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('arquivar: a confirmação já não promete reverter «editando»; confirmar arquiva', async ({ page }) => {
    await abrir(page, `/fornecedores/${ID_FORN}`);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toHaveCount(0);
    await page.getByRole('button', { name: /arquivar/i }).first().click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/editando/i), 'o texto não pode prometer reverter editando').toHaveCount(0);
    await dialogo.getByRole('button', { name: /arquivar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(estado).toEqual({ arquivado: true, status: 'INATIVO' });
  });

  test('o arquivado sai da lista padrão e encontra-se pela ligação «Arquivados»', async ({ page }) => {
    await abrir(page, '/fornecedores/lista');
    await expect(page.getByText(NOME_FORN)).toHaveCount(0);

    await page.getByRole('link', { name: /arquivados/i }).first().click();
    await page.waitForLoadState('networkidle');
    const linha = page.getByText(NOME_FORN).first();
    await expect(linha, 'o fornecedor arquivado tem de aparecer na lista dos arquivados').toBeVisible();
    await linha.click();
    await page.waitForURL(new RegExp(`/fornecedores/${ID_FORN}(?:[/?#]|$)`));
    await expect(page.getByRole('button', { name: /^reactivar/i })).toBeVisible();
  });

  test('cancelar o AlertDialog de «Reactivar» não muda nada', async ({ page }) => {
    await abrir(page, `/fornecedores/${ID_FORN}`);
    await page.getByRole('button', { name: /^reactivar/i }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialogo).toBeHidden();
    await page.waitForTimeout(500);
    expect(await estado()).toEqual({ arquivado: true, status: 'INATIVO' });
  });

  test('reactivar: AlertDialog → deletedAt null + ATIVO, e volta à lista padrão', async ({ page }) => {
    await abrir(page, `/fornecedores/${ID_FORN}`);
    await page.getByRole('button', { name: /^reactivar/i }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /reactivar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(estado).toEqual({ arquivado: false, status: 'ATIVO' });
    await expect(page.getByRole('button', { name: /^reactivar/i })).toHaveCount(0);

    await abrir(page, `/fornecedores/lista?termo=${encodeURIComponent(NOME_FORN)}`);
    await expect(page.getByText(NOME_FORN).first()).toBeVisible();
  });
});

test.describe(`#114 — ligações das listas de serviços abrem páginas reais (${MARCA})`, () => {
  const LISTAS: Array<{ lista: string; padrao: RegExp }> = [
    { lista: '/servicos/lista', padrao: /^\/servicos\/lista\/[^/?#]+(?:\/editar)?$/ },
    { lista: '/servicos/agendamentos', padrao: /^\/servicos\/agendamentos\/(?!novo$)[^/?#]+$/ },
    { lista: '/servicos/contratos', padrao: /^\/servicos\/contratos\/(?!novo$)[^/?#]+$/ },
    { lista: '/servicos/categorias', padrao: /^\/servicos\/categorias\/[^/?#]+\/editar$/ },
  ];

  for (const { lista, padrao } of LISTAS) {
    test(`${lista}: nenhuma ligação de linha dá 404`, async ({ page }) => {
      await abrir(page, lista);
      const caminhos = () =>
        page.locator('a[href]').evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
      const hrefs = await caminhos();
      // Ligações dentro do menu «Acções para …» da primeira linha (DropdownMenu: só existem abertas).
      const menu = page.getByRole('button', { name: /^acções para/i }).first();
      if ((await menu.count()) > 0) {
        await menu.click();
        await expect(page.getByRole('menu')).toBeVisible();
        hrefs.push(...(await caminhos()));
        await page.keyboard.press('Escape');
      }
      // A navegação pela linha (rowHref do DataTable): clicar numa célula sem botão nem ligação.
      const celula = page.locator('tbody tr').first().locator('td').first();
      if ((await celula.count()) > 0) {
        const antes = new URL(page.url()).pathname;
        await celula.click();
        await page.waitForTimeout(1_000);
        const depois = new URL(page.url()).pathname;
        if (depois !== antes) hrefs.push(depois);
      }
      const alvos = [...new Set(hrefs.filter((h) => padrao.test(h)))].slice(0, 4);
      if (alvos.length === 0) {
        test.info().annotations.push({ type: 'sem-dados', description: `${lista} sem linhas no tenant demo` });
        return;
      }
      for (const alvo of alvos) {
        const resp = await abrir(page, alvo);
        expect(resp?.status(), `${alvo} (ligado de ${lista})`).toBeLessThan(400);
        await expect(page.getByText(/could not be found|página não encontrada/i), alvo).toHaveCount(0);
      }
    });
  }
});
