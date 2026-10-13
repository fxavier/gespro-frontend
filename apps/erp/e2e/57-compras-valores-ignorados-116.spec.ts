/**
 * Oráculo E2E — issue #116: valores do formulário de serviço ignorados / mal mostrados.
 *
 * Contrato de UI (o do servidor está em `test/integration/compras-valores-ignorados-116.test.ts`):
 *   - o formulário /servicos/novo tem um campo «Categoria» (combobox com rótulo «Categoria») que
 *     lista as categorias de serviço do tenant; a escolhida é gravada em `categoriaServicoId`;
 *   - o código escrito à mão no formulário é o código gravado (não um SRV-NNNN automático);
 *   - o detalhe /servicos/lista/[id] mostra a taxa de IVA como percentagem («16%»), nunca a
 *     fracção com sinal de percentagem («0.16%»).
 *
 * Dados (prefixo único `compras-valores-ignorados-116`): uma categoria e um serviço inseridos por
 * SQL no tenant `demo` e o serviço criado pelo formulário; tudo apagado no beforeAll e no afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — o formulário não tem «Categoria», o código
 * gravado é automático e o detalhe mostra «0.16%».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/57-compras-valores-ignorados-116.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:compras-valores-ignorados-116; um agente de implementação que
 * o altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'compras-valores-ignorados-116';
const cuid = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const ID_CAT = cuid();
const NOME_CAT = `${MARCA} Climatização ${ID_CAT.slice(-5)}`;
const ID_SRV_SQL = cuid();
const CODIGO_SRV_SQL = `${MARCA}-SQL-${ID_SRV_SQL.slice(-5)}`;
const CODIGO_FORM = `${MARCA}-F${ID_CAT.slice(-5)}`.slice(0, 50);
const NOME_FORM = `E2E Serviço 116 ${ID_CAT.slice(-5)}`;

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
  await c.query(`DELETE FROM "Servico" WHERE "tenantId" = $1 AND (codigo LIKE $2 OR nome = $3)`, [
    tenantId,
    `${MARCA}%`,
    NOME_FORM,
  ]);
  await c.query(`DELETE FROM "CategoriaServico" WHERE "tenantId" = $1 AND nome LIKE $2`, [tenantId, `${MARCA}%`]);
}

async function abrir(page: Page, rota: string) {
  const resp = await page.goto(`${BASE}${rota}`);
  await page.waitForLoadState('networkidle');
  return resp;
}

/** O valor (dd) ao lado de um rótulo (dt) no detalhe. */
const valorDe = (page: Page, rotulo: string) =>
  page.locator('dt', { hasText: new RegExp(`^${rotulo}$`) }).locator('xpath=following-sibling::dd[1]');

test.describe(`#116 — formulário e detalhe de serviço (${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      await c.query(
        `INSERT INTO "CategoriaServico" (id, "tenantId", nome, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, now(), now())`,
        [ID_CAT, tenantId, NOME_CAT],
      );
      await c.query(
        `INSERT INTO "Servico" (id, "tenantId", codigo, nome, preco, "duracaoEstimada", "taxaIva", "diasDisponibilidade", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 1000, 60, 0.16, '{}', now(), now())`,
        [ID_SRV_SQL, tenantId, CODIGO_SRV_SQL, `E2E Serviço SQL 116 ${ID_SRV_SQL.slice(-5)}`],
      );
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('detalhe: a taxa de IVA aparece como «16%», não «0.16%»', async ({ page }) => {
    await abrir(page, `/servicos/lista/${ID_SRV_SQL}`);
    await expect(valorDe(page, 'Taxa IVA')).toHaveText('16%');
    await expect(page.getByText('0.16%')).toHaveCount(0);
  });

  test('novo serviço: o formulário tem «Categoria»; código manual e categoria são gravados', async ({ page }) => {
    await abrir(page, '/servicos/novo');

    await page.getByLabel(/^código/i).fill(CODIGO_FORM);
    await page.getByLabel(/^nome do serviço/i).fill(NOME_FORM);
    await page.getByLabel(/^preço/i).fill('1500');

    const categoria = page.getByRole('combobox', { name: /categoria/i });
    await expect(categoria, 'o formulário de serviço não tem o campo «Categoria»').toBeVisible();
    await categoria.click();
    const popover = page.locator('[data-radix-popper-content-wrapper]').last();
    const pesquisa = popover.getByPlaceholder(/pesquisar/i);
    if ((await pesquisa.count()) > 0) await pesquisa.fill(NOME_CAT);
    await page.getByRole('option', { name: NOME_CAT }).click();

    await page.getByRole('button', { name: /guardar serviço/i }).click();

    const gravado = () =>
      withPg(async (c) => {
        const r = await c.query<{ id: string; codigo: string; categoria: string | null }>(
          `SELECT id, codigo, "categoriaServicoId" AS categoria FROM "Servico" WHERE "tenantId" = $1 AND nome = $2`,
          [await tenantDemo(c), NOME_FORM],
        );
        return r.rows[0] ?? null;
      });
    await expect
      .poll(async () => {
        const g = await gravado();
        return g && { codigo: g.codigo, categoria: g.categoria };
      }, { timeout: 15_000 })
      .toEqual({ codigo: CODIGO_FORM, categoria: ID_CAT });

    const g = await gravado();
    await abrir(page, `/servicos/lista/${g!.id}`);
    await expect(page.getByText(CODIGO_FORM).first()).toBeVisible();
    await expect(valorDe(page, 'Taxa IVA')).toHaveText('16%');
  });
});
