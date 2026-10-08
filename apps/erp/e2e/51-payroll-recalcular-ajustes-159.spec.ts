/**
 * E2E oracle — payroll-recalcular-ajustes-159 (issue #159): «Recalcular» com confirmação
 * (AlertDialog) e ajuste manual que o recálculo preserva.
 *
 * Contrato:
 *   C1 — Detalhe PENDENTE: «Recalcular» abre um alertdialog; «Cancelar» fecha-o sem
 *        recalcular (nenhum toast «Payroll recalculado»).
 *   C2 — Ajuste manual (PROVENTO/Bónus, com descrição-motivo) entra no detalhe como
 *        «<descrição> (ajuste)»; confirmar «Recalcular» mostra o toast e a linha manual
 *        continua lá, com o Total bruto igual ao de antes do recálculo.
 *
 * Higiene de dados — escreve uma LinhaPayroll PROVENTO de 1,00 no tenant demo:
 *
 *   docker exec gespro-db psql \
 *     -U "$(docker exec gespro-db printenv POSTGRES_USER)" \
 *     -d "$(docker exec gespro-db printenv POSTGRES_DB)" \
 *     -c "DELETE FROM \"LinhaPayroll\" WHERE descricao LIKE 'E2E payroll-recalcular-ajustes-159%';"
 *
 *   Depois recalcular o payroll afectado via «Recalcular» na UI.
 *
 * Correr:
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/51-payroll-recalcular-ajustes-159.spec.ts --project=e2e
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/admin.json');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LISTA_PENDENTE = `${BASE}/rh/payroll?status=PENDENTE`;
const PREFIXO = 'E2E payroll-recalcular-ajustes-159';

function parseValorMT(texto: string): number {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(limpo);
}

async function escolherOpcao(page: Page, label: string, visibleText: string): Promise<void> {
  const campo = page.getByLabel(label, { exact: true });
  await expect(campo).toBeVisible({ timeout: 10_000 });
  const tag = await campo.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    await campo.selectOption({ label: visibleText });
  } else {
    await campo.click();
    await page
      .getByRole('option', { name: visibleText })
      .or(page.getByRole('listitem').filter({ hasText: visibleText }))
      .first()
      .click();
  }
}

function totalBruto(page: Page) {
  return page.locator('text=Total bruto').locator('..').locator('span.tabular-nums');
}

let pendentePath: string;

test.describe('payroll-recalcular-ajustes-159 — recalcular com confirmação preserva ajustes', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE, baseURL: BASE });
    const page = await ctx.newPage();
    try {
      await page.goto(LISTA_PENDENTE);
      const tabelaOuVazio = page.locator('tbody tr').first().or(page.getByText(/sem processamentos/i));
      await expect(tabelaOuVazio).toBeVisible({ timeout: 30_000 });
      const primeiraTr = page.locator('tbody tr').first();
      if ((await primeiraTr.count()) === 0) {
        throw new Error('STOP CONDITION: nenhum payroll PENDENTE no tenant demo — corra pnpm db:seed.');
      }
      await primeiraTr.click();
      await page.waitForURL(/\/rh\/payroll\/[a-z0-9]{25}$/, { timeout: 30_000 });
      pendentePath = new URL(page.url()).pathname;
    } finally {
      await ctx.close();
    }
  });

  test('C1 — «Recalcular» abre AlertDialog; «Cancelar» fecha sem recalcular', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(pendentePath);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Recalcular', exact: true }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible({ timeout: 10_000 });
    await expect(dialogo).toContainText(/ajuste/i);

    await dialogo.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialogo).toBeHidden({ timeout: 10_000 });

    // Sem recálculo: nenhum toast aparece num intervalo razoável.
    await expect(page.locator('[data-sonner-toast]', { hasText: 'Payroll recalculado' })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(pendentePath);
  });

  test('C2 — ajuste manual sobrevive a «Recalcular» confirmado; Total bruto inalterado', async ({ page }) => {
    test.setTimeout(120_000);
    const descricao = `${PREFIXO} ${Date.now()}`;

    // 1) Ajuste manual pela rota dedicada
    await page.goto(`${pendentePath}/ajuste`);
    await page.waitForLoadState('networkidle');
    await escolherOpcao(page, 'Tipo', 'Provento');
    await escolherOpcao(page, 'Natureza', 'Bónus');
    await page.getByLabel('Descrição', { exact: true }).fill(descricao);
    await page.getByLabel('Valor', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Guardar ajuste', exact: true }).click();
    await page.waitForURL(new RegExp(`${pendentePath}$`), { timeout: 30_000 });
    await expect(page.locator('#main-content')).toContainText(`${descricao} (ajuste)`, { timeout: 20_000 });

    await page.waitForLoadState('networkidle');
    await expect(totalBruto(page)).toBeVisible({ timeout: 20_000 });
    const brutoAntes = parseValorMT((await totalBruto(page).textContent()) ?? '0');

    // 2) Recalcular com confirmação
    await page.getByRole('button', { name: 'Recalcular', exact: true }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible({ timeout: 10_000 });
    await dialogo.getByRole('button', { name: /^(Recalcular|Confirmar)$/ }).click();
    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'Payroll recalculado' }),
    ).toBeVisible({ timeout: 20_000 });

    // 3) A linha manual continua lá (também depois de recarregar) e o bruto não mudou
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#main-content')).toContainText(`${descricao} (ajuste)`, { timeout: 20_000 });
    const brutoDepois = parseValorMT((await totalBruto(page).textContent()) ?? '0');
    expect(brutoDepois).toBeCloseTo(brutoAntes, 2);
  });
});
