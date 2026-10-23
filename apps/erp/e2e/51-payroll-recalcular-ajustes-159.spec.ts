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
 * Precondição — uma folha PENDENTE: a do seed (mês anterior) é paga pelo 42-payroll-pagar-96, que
 * corre antes deste na suite. Sem nenhum payroll PENDENTE, o `beforeAll` processa pela UI
 * (/rh/payroll/novo) a folha do mês mais recente que ainda não esteja PROCESSADO/PAGO. Uma folha
 * PENDENTE não tem lançamentos; deixa-a no `demo` (a corrida seguinte reutiliza-a). Limpeza:
 *
 *   -- F = folhas PENDENTE do demo criadas assim (filtra também por mês/ano)
 *   DELETE FROM "LinhaPayroll" WHERE "payrollId" IN (SELECT id FROM "Payroll" WHERE "folhaId" IN (F));
 *   DELETE FROM "Payroll" WHERE "folhaId" IN (F);
 *   DELETE FROM "FolhaPagamento" WHERE id IN (F);
 *
 * Correr:
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/51-payroll-recalcular-ajustes-159.spec.ts --project=e2e
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { comBaseDados } from './helpers/db';

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

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Mês de referência mais recente (de hoje em Maputo para trás) sem folha PROCESSADO/PAGO no
 * `demo` — o único que `processarFolhaMes` aceita sem cancelar nada. Só leitura.
 */
async function mesLivreParaFolha(): Promise<{ mes: number; ano: number }> {
  const ocupados = await comBaseDados(async (c) => {
    const r = await c.query<{ ano: number; mes: number }>(
      `SELECT f."anoReferencia" AS ano, f."mesReferencia" AS mes
         FROM "FolhaPagamento" f JOIN "Tenant" t ON t.id = f."tenantId"
        WHERE t.slug = 'demo' AND f.status IN ('PROCESSADO', 'PAGO')`,
    );
    return new Set(r.rows.map((l) => `${l.ano}-${l.mes}`));
  });
  const [ano0, mes0] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  for (let k = 0; k < 24; k++) {
    const total = ano0 * 12 + (mes0 - 1) - k;
    const ano = Math.floor(total / 12);
    const mes = (total % 12) + 1;
    if (!ocupados.has(`${ano}-${mes}`)) return { mes, ano };
  }
  throw new Error('STOP CONDITION: os últimos 24 meses já têm folha processada ou paga no tenant demo.');
}

/** Processa pela UI a folha de um mês livre; a folha nasce PENDENTE (sem lançamentos). */
async function processarFolhaPendente(page: Page): Promise<void> {
  const { mes, ano } = await mesLivreParaFolha();
  await page.goto(`${BASE}/rh/payroll/novo`);
  await page.waitForLoadState('networkidle');
  await page.locator('main').getByRole('combobox').first().click();
  await page.getByRole('option', { name: MESES[mes - 1], exact: true }).click();
  await page.locator('input[name="ano"]').fill(String(ano));
  await page.getByRole('button', { name: 'Processar Folha do Mês', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]', { hasText: 'processada para' })).toBeVisible({ timeout: 60_000 });
  await page.waitForURL(/\/rh\/payroll(\?.*)?$/, { timeout: 30_000 });
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
      // A lista vazia também é uma `tbody tr` («Sem processamentos salariais») — `.first()` no
      // composto, e o vazio decide-se pelo texto, não pela contagem de linhas.
      const vazio = page.getByText(/sem processamentos/i);
      const tabelaOuVazio = page.locator('tbody tr').first().or(vazio).first();
      await page.goto(LISTA_PENDENTE);
      await expect(tabelaOuVazio).toBeVisible({ timeout: 30_000 });
      if (await vazio.isVisible()) {
        await processarFolhaPendente(page);
        await page.goto(LISTA_PENDENTE);
        await expect(tabelaOuVazio).toBeVisible({ timeout: 30_000 });
        if (await vazio.isVisible()) {
          throw new Error('STOP CONDITION: a folha processada não deixou nenhum payroll PENDENTE no tenant demo.');
        }
      }
      const primeiraTr = page.locator('tbody tr').first();
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
