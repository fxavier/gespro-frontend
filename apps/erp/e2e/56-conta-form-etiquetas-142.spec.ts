/**
 * Oráculo E2E — issue #142: formulário de conta do plano com etiquetas de classe erradas;
 * desactivar sem reactivar.
 *
 * Contrato de UI (regras «sem modais» do CLAUDE.md; opção conservadora do orquestrador):
 *   - em /contabilidade/plano-contas/novo, o selector Classe mostra os nomes PGC-NIRF
 *     (classe 4 = «Contas a receber, contas a pagar, …»; nenhuma opção «Investimentos» na 4)
 *     e o campo Código não sugere `1.1.1`;
 *   - o detalhe /contabilidade/plano-contas/[id] mostra a classe com o nome PGC-NIRF;
 *   - no detalhe, uma conta inactiva tem o botão «Reactivar» (e não «Desactivar»); reactivar
 *     pede confirmação num AlertDialog (role=alertdialog) e grava `ativo = true`; uma conta
 *     activa não tem «Reactivar». Cancelar o AlertDialog não escreve.
 *
 * Dados (prefixo único `conta-form-etiquetas-142`): no tenant `demo`, uma ContaPGC INACTIVA
 * de código `6991420`, sem mãe e sem movimentos, inserida por SQL com id uuid (como as contas
 * do bootstrap). É apagada (com o AuditLog dela) no beforeAll e no afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — etiquetas erradas e sem botão «Reactivar».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/56-conta-form-etiquetas-142.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó D:conta-form-etiquetas-142; um agente de implementação
 * que o altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'conta-form-etiquetas-142';
const CODIGO = '6991420';
const ID_CONTA = randomUUID();

const CLASSE_4_PGC = /Classe 4 — Contas a receber, contas a pagar/;
const CLASSE_6_PGC = /Classe 6 — Gastos e perdas/;

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
    `DELETE FROM "AuditLog" WHERE "tenantId" = $1 AND entity = 'ContaPGC'
       AND "entityId" IN (SELECT id FROM "ContaPGC" WHERE "tenantId" = $1 AND codigo = $2)`,
    [tenantId, CODIGO],
  );
  await c.query(`DELETE FROM "ContaPGC" WHERE "tenantId" = $1 AND codigo = $2`, [tenantId, CODIGO]);
}

async function ativo(): Promise<boolean | null> {
  return withPg(async (c) => {
    const r = await c.query<{ ativo: boolean }>(`SELECT ativo FROM "ContaPGC" WHERE id = $1`, [ID_CONTA]);
    return r.rows[0]?.ativo ?? null;
  });
}

async function definirAtivo(valor: boolean): Promise<void> {
  await withPg((c) => c.query(`UPDATE "ContaPGC" SET ativo = $1, "updatedAt" = now() WHERE id = $2`, [valor, ID_CONTA]));
}

async function abrirDetalhe(page: Page): Promise<void> {
  await page.goto(`${BASE}/contabilidade/plano-contas/${ID_CONTA}`);
  await page.waitForLoadState('networkidle');
}

test.describe(`/contabilidade/plano-contas — etiquetas PGC e reactivar (#142, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      await c.query(
        `INSERT INTO "ContaPGC" (id, "tenantId", codigo, nome, classe, tipo, natureza, nivel,
           "contaMaeId", "aceitaLancamento", ativo, descricao, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'CLASSE_6', 'GASTO', 'DEVEDORA', 4, NULL, true, false, $5, now(), now())`,
        [ID_CONTA, tenantId, CODIGO, `E2E ${MARCA}`, MARCA],
      );
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('novo: o selector Classe mostra os nomes PGC-NIRF e o Código não sugere 1.1.1', async ({ page }) => {
    await page.goto(`${BASE}/contabilidade/plano-contas/novo`);
    await page.waitForLoadState('networkidle');

    const codigo = page.getByLabel('Código');
    await expect(codigo).toBeVisible();
    expect(await codigo.getAttribute('placeholder') ?? '').not.toContain('1.1.1');
    await expect(page.getByText('1.1.1')).toHaveCount(0);

    await page.getByRole('combobox', { name: /classe/i }).click();
    const lista = page.getByRole('listbox');
    await expect(lista).toBeVisible();
    await expect(lista.getByRole('option', { name: CLASSE_4_PGC })).toBeVisible();
    await expect(lista.getByRole('option', { name: /Classe 4 — Investimentos/ })).toHaveCount(0);
    await expect(lista.getByRole('option', { name: /Classe 2 — Inventários/ })).toBeVisible();
    await expect(lista.getByRole('option', { name: /Classe 3 — Investimentos/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('detalhe: a classe aparece com o nome PGC-NIRF', async ({ page }) => {
    await abrirDetalhe(page);
    await expect(page.getByText(CLASSE_6_PGC)).toBeVisible();
  });

  test('conta inactiva: tem «Reactivar» e não «Desactivar»; cancelar o AlertDialog não escreve', async ({ page }) => {
    await definirAtivo(false);
    await abrirDetalhe(page);
    await expect(page.getByRole('button', { name: /^desactivar/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^reactivar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialogo).toBeHidden();
    // Dá tempo a uma escrita indevida antes de afirmar.
    await page.waitForTimeout(500);
    expect(await ativo()).toBe(false);
  });

  test('Reactivar → AlertDialog → confirmar grava ativo=true; a conta passa a ter «Desactivar»', async ({ page }) => {
    await definirAtivo(false);
    await abrirDetalhe(page);
    await page.getByRole('button', { name: /^reactivar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /reactivar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(() => ativo()).toBe(true);
    await expect(page.getByRole('button', { name: /^desactivar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^reactivar/i })).toHaveCount(0);
  });

  test('conta activa: Desactivar → AlertDialog sem promessa «pela edição» → inactiva; aparece «Reactivar»', async ({
    page,
  }) => {
    await definirAtivo(true);
    await abrirDetalhe(page);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^desactivar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/pela edição/)).toHaveCount(0);
    await dialogo.getByRole('button', { name: /desactivar conta|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(() => ativo()).toBe(false);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toBeVisible();
  });
});
