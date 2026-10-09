/**
 * Oráculo E2E — issue #445: circuito de aprovação de compras sem editar nem desactivar.
 *
 * Contrato de UI (decisão do orquestrador; sem modais):
 *   - no ecrã `/compras/configuracoes/circuitos-aprovacao`, cada circuito (a sua `section`,
 *     identificada pelo cabeçalho com o nome) tem a ligação «Editar» para a rota própria
 *     `/compras/configuracoes/circuitos-aprovacao/<id>/editar` (rota, não Dialog);
 *   - a rota de edição é um formulário (um `form`, nenhum `dialog`) com o campo «Nome»
 *     preenchido com o nome actual; guardar (botão «Guardar…») grava pela
 *     `actualizarConfiguracaoWorkflowAction` e volta à listagem, onde se lê o nome novo;
 *   - um circuito ACTIVO tem o botão «Desactivar…», que abre um AlertDialog de confirmação
 *     (role `alertdialog`) cujo botão de confirmação (nome com «desactiv») o desactiva pela
 *     `desactivarConfiguracaoWorkflowAction`; nada muda antes de confirmar; depois de
 *     desactivado o circuito aparece «Inactivo» e o botão deixa de existir.
 *
 * As regras de servidor (um activo por tipo, concorrência, permissões, isolamento, pedido de
 * compra sob tranca) são provadas em `test/integration/compras-circuito-pedido-445.test.ts`.
 *
 * Dados (prefixo único `compras-circuito-pedido-445`), no tenant `demo`, por SQL: um circuito
 * PEDIDO_COMPRA ACTIVO (o demo não tem circuitos; nenhum fluxo da UI cria aprovações de pedido,
 * logo não muda o comportamento de mais ninguém), apagado no beforeAll e no afterAll (níveis e
 * aprovadores em cascata). Se o demo já tiver um circuito PEDIDO_COMPRA activo, o teste pára.
 *
 * ESTADO ESPERADO antes da implementação: RED — não há «Editar», nem rota /editar, nem
 * «Desactivar».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/54-compras-circuito-pedido-445.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:compras-circuito-pedido-445; um agente de implementação
 * que o altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'compras-circuito-pedido-445';
const SUF = Date.now().toString(36);
const ID_WF = `cwfcircuito445${SUF}`;
const ID_NIVEL = `cnivcircuito445${SUF}`;
const ID_APROVADOR = `capvcircuito445${SUF}`;
const NOME_ORIGINAL = `Circuito ${MARCA} ${SUF}`;
const NOME_EDITADO = `Circuito ${MARCA} ${SUF} revisto`;
const LISTA = `${BASE}/compras/configuracoes/circuitos-aprovacao`;

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

async function limparCircuito(c: Client, tenantId: string): Promise<void> {
  await c.query(`DELETE FROM "ConfiguracaoWorkflow" WHERE "tenantId" = $1 AND nome LIKE $2`, [
    tenantId,
    `Circuito ${MARCA}%`,
  ]);
}

async function circuitoNaBase(): Promise<{ nome: string; ativo: boolean } | undefined> {
  return withPg(async (c) => {
    const r = await c.query<{ nome: string; ativo: boolean }>(
      `SELECT nome, ativo FROM "ConfiguracaoWorkflow" WHERE id = $1`,
      [ID_WF],
    );
    return r.rows[0];
  });
}

function seccao(page: Page, nome: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: nome, exact: true }) });
}

test.describe(`/compras/configuracoes/circuitos-aprovacao — editar e desactivar (#445, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limparCircuito(c, tenantId);
      const outro = await c.query(
        `SELECT nome FROM "ConfiguracaoWorkflow" WHERE "tenantId" = $1 AND tipo::text = 'PEDIDO_COMPRA' AND ativo = true`,
        [tenantId],
      );
      if (outro.rows.length > 0) {
        throw new Error(`STOP: o demo já tem um circuito PEDIDO_COMPRA activo (${outro.rows[0].nome})`);
      }
      const admin = await c.query<{ id: string; email: string }>(
        `SELECT id, email FROM "User" WHERE "tenantId" = $1 AND email = 'admin@demo.mz' LIMIT 1`,
        [tenantId],
      );
      if (!admin.rows[0]) throw new Error('STOP: admin@demo.mz não existe no demo (pnpm db:seed)');

      await c.query('BEGIN');
      try {
        await c.query(
          `INSERT INTO "ConfiguracaoWorkflow" (id, "tenantId", nome, tipo, ativo, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'PEDIDO_COMPRA', true, now(), now())`,
          [ID_WF, tenantId, NOME_ORIGINAL],
        );
        await c.query(
          `INSERT INTO "NivelAprovacao" (id, "tenantId", "configuracaoWorkflowId", nivel, nome, "valorMinimo",
             "valorMaximo", "tipoAprovacao", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 1, 'Direcção', 0, 1000000, 'QUALQUER_UM', now(), now())`,
          [ID_NIVEL, tenantId, ID_WF],
        );
        await c.query(
          `INSERT INTO "AprovadorNivel" (id, "tenantId", "nivelAprovacaoId", "usuarioId", email)
           VALUES ($1, $2, $3, $4, $5)`,
          [ID_APROVADOR, tenantId, ID_NIVEL, admin.rows[0].id, admin.rows[0].email],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limparCircuito(c, await tenantDemo(c)));
  });

  test('«Editar» é uma rota com o nome preenchido; guardar grava e volta à listagem', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const s = seccao(page, NOME_ORIGINAL);
    await expect(s).toHaveCount(1);
    const editar = s.getByRole('link', { name: /^editar/i });
    await expect(editar).toBeVisible();
    await expect(editar).toHaveAttribute('href', `/compras/configuracoes/circuitos-aprovacao/${ID_WF}/editar`);
    await editar.click();

    await page.waitForURL(new RegExp(`/compras/configuracoes/circuitos-aprovacao/${ID_WF}/editar$`));
    await page.waitForLoadState('networkidle');
    await expect(page.locator('form')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    const nome = page.getByLabel('Nome', { exact: true });
    await expect(nome).toHaveValue(NOME_ORIGINAL);
    await nome.fill(NOME_EDITADO);
    await page.getByRole('button', { name: /^guardar/i }).click();

    await page.waitForURL(/\/compras\/configuracoes\/circuitos-aprovacao$/, { timeout: 15_000 });
    await expect.poll(async () => (await circuitoNaBase())?.nome, { timeout: 15_000 }).toBe(NOME_EDITADO);
    expect((await circuitoNaBase())?.ativo).toBe(true);

    await page.waitForLoadState('networkidle');
    await expect(seccao(page, NOME_EDITADO)).toHaveCount(1);
    await expect(seccao(page, NOME_ORIGINAL)).toHaveCount(0);
  });

  test('«Desactivar» pede confirmação em AlertDialog e desactiva o circuito', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const s = seccao(page, NOME_EDITADO);
    await expect(s).toHaveCount(1);
    const desactivar = s.getByRole('button', { name: /^desactivar/i });
    await expect(desactivar).toBeVisible();
    await desactivar.click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    // Só confirmação: nada muda antes de confirmar.
    expect((await circuitoNaBase())?.ativo).toBe(true);
    await dialogo.getByRole('button', { name: /desactiv/i }).click();

    await expect.poll(async () => (await circuitoNaBase())?.ativo, { timeout: 15_000 }).toBe(false);

    await page.reload();
    await page.waitForLoadState('networkidle');
    const depois = seccao(page, NOME_EDITADO);
    await expect(depois.getByText(/^inactivo$/i)).toBeVisible();
    await expect(depois.getByRole('button', { name: /^desactivar/i })).toHaveCount(0);
  });
});
