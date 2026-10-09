/**
 * Oráculo E2E — issue #136: o motivo da desactivação de cliente chega ao servidor.
 *
 * Contrato de UI (regras «sem modais» do CLAUDE.md — um campo de texto é formulário, logo é rota):
 *   - na ficha /clientes/[id] de um cliente activo, «Desactivar» é uma ligação para a rota
 *     própria /clientes/[id]/desactivar (já não abre um AlertDialog com texto);
 *   - a rota tem um campo «Motivo» e um botão de submissão («Desactivar…»/«Confirmar…»);
 *     pode pedir confirmação num AlertDialog, mas esse AlertDialog NUNCA tem campo de texto;
 *   - submeter grava: o cliente fica INATIVO (soft delete) e o histórico do cliente recebe UMA
 *     entrada AJUSTE de 0 MT cuja descrição contém o motivo escrito; a página sai da rota
 *     /desactivar (redirecção);
 *   - «Voltar»/cancelar na rota não desactiva.
 *
 * Dados (prefixo único `cliente-motivo-desactivacao-136`): no tenant `demo`, dois clientes
 * inseridos por SQL (código com o prefixo); apagados, com o histórico deles, no beforeAll e no
 * afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — a rota /desactivar não existe e a ficha abre
 * um AlertDialog com Textarea.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/56-cliente-motivo-desactivacao-136.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó C:cliente-motivo-desactivacao-136; um agente de implementação
 * que o altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'cliente-motivo-desactivacao-136';
// Forma cuid: a action valida o id com `.cuid()`.
const novoId = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const ID_DESACTIVAR = novoId();
const ID_CANCELAR = novoId();
const MOTIVO = `Encerrou a actividade ${MARCA} ${Date.now()}`;

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
  await c.query(
    `DELETE FROM "HistoricoTransacao" h
     WHERE h."tenantId" = $1
       AND h."clienteId" IN (SELECT id FROM "Cliente" WHERE "tenantId" = $1 AND codigo LIKE $2)`,
    [tenantId, `${MARCA}%`],
  );
  await c.query(`DELETE FROM "Cliente" WHERE "tenantId" = $1 AND codigo LIKE $2`, [tenantId, `${MARCA}%`]);
}

async function estado(id: string): Promise<{ status: string; desactivado: boolean } | null> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; desactivado: boolean }>(
      `SELECT status::text AS status, ("deletedAt" IS NOT NULL) AS desactivado FROM "Cliente" WHERE id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  });
}

async function historico(id: string): Promise<{ tipo: string; valor: string; descricao: string }[]> {
  return withPg(async (c) => {
    const r = await c.query<{ tipo: string; valor: string; descricao: string }>(
      `SELECT tipo::text AS tipo, valor::text AS valor, descricao FROM "HistoricoTransacao" WHERE "clienteId" = $1`,
      [id],
    );
    return r.rows;
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState('networkidle');
}

test.describe(`/clientes/[id]/desactivar — motivo da desactivação (#136, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      let n = 0;
      for (const [id, nome] of [
        [ID_DESACTIVAR, 'E2E Cliente a desactivar 136'],
        [ID_CANCELAR, 'E2E Cliente a manter 136'],
      ] as const) {
        n += 1;
        const nuit = `7${String(Date.now()).slice(-7)}${n}`;
        await c.query(
          `INSERT INTO "Cliente" (id, "tenantId", codigo, nome, tipo, nuit, email, telefone, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'JURIDICA', $5, $6, '840000000', now(), now())`,
          [id, tenantId, `${MARCA}-${id.slice(-6)}`, nome, nuit, `${MARCA}-${id.slice(-6)}@e2e.mz`],
        );
      }
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('na ficha, «Desactivar» leva à rota própria /clientes/[id]/desactivar (sem AlertDialog com texto)', async ({
    page,
  }) => {
    await abrir(page, `/clientes/${ID_DESACTIVAR}`);
    const ligacao = page.getByRole('link', { name: /desactivar/i }).first();
    await expect(ligacao).toBeVisible();
    await ligacao.click();
    await page.waitForURL(new RegExp(`/clientes/${ID_DESACTIVAR}/desactivar$`));
    await expect(page.getByRole('alertdialog').getByRole('textbox')).toHaveCount(0);
    await expect(page.getByLabel(/motivo/i)).toBeVisible();
    expect(await estado(ID_DESACTIVAR)).toEqual({ status: 'ATIVO', desactivado: false });
  });

  test('sair da rota sem submeter não desactiva', async ({ page }) => {
    await abrir(page, `/clientes/${ID_CANCELAR}/desactivar`);
    await page.getByLabel(/motivo/i).fill('Não era para desactivar');
    await page
      .getByRole('link', { name: /voltar|cancelar/i })
      .or(page.getByRole('button', { name: /voltar|cancelar/i }))
      .first()
      .click();
    await page.waitForURL((u) => !u.pathname.endsWith('/desactivar'));
    await page.waitForTimeout(500);
    expect(await estado(ID_CANCELAR)).toEqual({ status: 'ATIVO', desactivado: false });
    expect(await historico(ID_CANCELAR)).toHaveLength(0);
  });

  test('submeter com motivo desactiva o cliente e grava o motivo no histórico', async ({ page }) => {
    await abrir(page, `/clientes/${ID_DESACTIVAR}/desactivar`);
    await page.getByLabel(/motivo/i).fill(MOTIVO);
    await page.getByRole('button', { name: /desactivar|confirmar/i }).first().click();

    // Confirmação opcional num AlertDialog — que nunca recolhe texto.
    const dialogo = page.getByRole('alertdialog');
    const pediuConfirmacao = await dialogo
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (pediuConfirmacao) {
      await expect(dialogo.getByRole('textbox')).toHaveCount(0);
      await dialogo.getByRole('button', { name: /desactivar|confirmar/i }).click();
    }

    await expect.poll(() => estado(ID_DESACTIVAR), { timeout: 15_000 }).toEqual({ status: 'INATIVO', desactivado: true });
    await page.waitForURL((u) => !u.pathname.endsWith('/desactivar'), { timeout: 15_000 });

    const linhas = await historico(ID_DESACTIVAR);
    expect(linhas, 'uma entrada no histórico com o motivo').toHaveLength(1);
    expect(linhas[0].tipo).toBe('AJUSTE');
    expect(Number(linhas[0].valor)).toBe(0);
    expect(linhas[0].descricao).toContain(MOTIVO);
  });
});
