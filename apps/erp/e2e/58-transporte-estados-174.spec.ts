/**
 * Oráculo E2E — issue #174 (parte de UI): o estado operacional do motorista é editável.
 *
 * Contrato de UI (o do servidor está em `test/integration/transporte-estados-174.test.ts`):
 *   - /transporte/motoristas/[id]/editar tem um campo «Estado» (combobox com rótulo que contém
 *     «estado») com as opções Activo / Inactivo / Suspenso, pré-preenchido com o estado actual;
 *   - «Guardar Alterações» grava o estado escolhido em `Motorista.estadoOperacional` e leva ao
 *     detalhe;
 *   - a ida e volta ACTIVO → INACTIVO → ACTIVO funciona (o estado não fica preso).
 *   (SUSPENSO fica fora deste oráculo de propósito: o detalhe esconde «Editar» a motoristas
 *    suspensos e decidir se isso muda é decisão de produto, não desta issue.)
 *
 * Dados (prefixo único `transporte-estados-174`): um motorista inserido por SQL no tenant `demo`;
 * apagado no beforeAll e no afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — o formulário não tem campo de estado.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/58-transporte-estados-174.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:transporte-estados-174; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'transporte-estados-174';
const cuid = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const ID_MOT = cuid();
const NOME_MOT = `${MARCA} Motorista ${ID_MOT.slice(-5)}`;

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
  await c.query(`DELETE FROM "Motorista" WHERE "tenantId" = $1 AND "nomeCompleto" LIKE $2`, [tenantId, `${MARCA}%`]);
}

async function estadoGravado(): Promise<string | null> {
  return withPg(async (c) => {
    const r = await c.query<{ estado: string }>(
      `SELECT "estadoOperacional"::text AS estado FROM "Motorista" WHERE id = $1`,
      [ID_MOT],
    );
    return r.rows[0]?.estado ?? null;
  });
}

async function abrirEditar(page: Page) {
  await page.goto(`${BASE}/transporte/motoristas/${ID_MOT}/editar`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: new RegExp(`Editar ${NOME_MOT}`) })).toBeVisible({
    timeout: 15_000,
  });
}

/** Escolhe a opção no campo de estado — aceita `<select>` nativo ou Select do Radix. */
async function escolherEstado(page: Page, rotulo: string) {
  const campo = page.getByRole('combobox', { name: /estado/i });
  await expect(campo, 'o formulário de edição do motorista não tem o campo de estado').toBeVisible();
  const tag = await campo.evaluate((el) => el.tagName);
  if (tag === 'SELECT') {
    await campo.selectOption({ label: rotulo });
  } else {
    await campo.click();
    await page.getByRole('option', { name: rotulo, exact: true }).click();
  }
}

/** O rótulo mostrado no campo de estado (opção escolhida no `<select>`, ou texto do trigger). */
async function estadoMostrado(page: Page): Promise<string> {
  const campo = page.getByRole('combobox', { name: /estado/i });
  return campo.evaluate((el) =>
    el instanceof HTMLSelectElement
      ? (el.selectedOptions[0]?.textContent ?? '').trim()
      : (el.textContent ?? '').trim(),
  );
}

test.describe(`#174 — estado operacional do motorista editável (${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      await c.query(
        `INSERT INTO "Motorista" (id, "tenantId", "nomeCompleto", contacto, "numeroCarta", "categoriaCarta",
                                  "dataEmissaoCarta", "validadeCarta", "estadoOperacional", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, '+258840000174', $4, ARRAY['B','C'], timestamp '2020-01-01 12:00:00',
                 timestamp '2099-01-01 12:00:00', 'ACTIVO', now(), now())`,
        [ID_MOT, tenantId, NOME_MOT, `CARTA-${ID_MOT.slice(-8)}`],
      );
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('editar: o campo de estado existe, mostra o actual e grava INACTIVO', async ({ page }) => {
    await abrirEditar(page);
    const campo = page.getByRole('combobox', { name: /estado/i });
    await expect(campo, 'o formulário de edição do motorista não tem o campo de estado').toBeVisible();
    await expect
      .poll(() => estadoMostrado(page), { message: 'o campo de estado não vem pré-preenchido com o estado actual' })
      .toBe('Activo');

    await escolherEstado(page, 'Inactivo');
    await page.getByRole('button', { name: /guardar altera/i }).click();

    await page.waitForURL(new RegExp(`/transporte/motoristas/${ID_MOT}$`), { timeout: 20_000 });
    await expect.poll(estadoGravado, { timeout: 10_000 }).toBe('INACTIVO');
  });

  test('editar de volta: INACTIVO → ACTIVO (o estado não fica preso)', async ({ page }) => {
    await abrirEditar(page);
    await expect
      .poll(() => estadoMostrado(page), { message: 'o campo de estado não mostra o estado gravado' })
      .toBe('Inactivo');

    await escolherEstado(page, 'Activo');
    await page.getByRole('button', { name: /guardar altera/i }).click();

    await page.waitForURL(new RegExp(`/transporte/motoristas/${ID_MOT}$`), { timeout: 20_000 });
    await expect.poll(estadoGravado, { timeout: 10_000 }).toBe('ACTIVO');
  });
});
