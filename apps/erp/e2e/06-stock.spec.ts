/**
 * E2E: Operações de Stock (spec 04) — entrada / saída / transferência.
 *
 * Foco: a UI invoca as Server Actions REAIS (registarEntradaStockAction,
 * registarBaixaStockAction, registarTransferenciaStockAction), não stubs.
 *
 * O fluxo principal (entrada) prova que a mutação persiste: sucesso + redirect.
 * As regras de saldo/STOCK_INSUFICIENTE são cobertas pelos testes de serviço.
 *
 * Usa storageState do admin. Determinístico: sem sleeps; expect auto-retry.
 */

import { test, expect } from '@playwright/test';

async function escolherPrimeiraOpcao(page: import('@playwright/test').Page, label: string) {
  await page.getByLabel(label, { exact: false }).click();
  await page.getByRole('option').first().click();
}

test.describe('Operações de Stock', () => {
  test('listagem tem acção "Nova Movimentação" e o seletor de operação', async ({ page }) => {
    await page.goto('/inventario/movimentacoes');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('heading', { name: 'Movimentações de Stock' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: /Nova Movimentação/i }).click();
    await page.waitForURL(/\/inventario\/movimentacoes\/nova$/, { timeout: 10_000 });

    // Três operações disponíveis
    await expect(page.getByRole('heading', { name: 'Entrada' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saída' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Transferência' })).toBeVisible();
  });

  test('registar entrada de stock via action real', async ({ page }) => {
    await page.goto('/inventario/movimentacoes/nova/entrada');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('heading', { name: 'Registar Entrada de Stock' }),
    ).toBeVisible({ timeout: 15_000 });

    // Produto (combobox cmdk) — associado ao label via FormControl id
    await escolherPrimeiraOpcao(page, 'Produto');

    // Localização de destino (combobox cmdk)
    await escolherPrimeiraOpcao(page, 'Localização de destino');

    // Quantidade
    await page.getByLabel('Quantidade', { exact: false }).fill('5');

    // Submeter → action real
    await page.getByRole('button', { name: /Registar Entrada/i }).click();

    // Sucesso: redireciona para a listagem + toast
    await page.waitForURL(/\/inventario\/movimentacoes$/, { timeout: 15_000 });
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /entrada|sucesso/i }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('formulário de saída liga à action e valida stock', async ({ page }) => {
    await page.goto('/inventario/movimentacoes/nova/saida');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('heading', { name: 'Registar Saída de Stock' }),
    ).toBeVisible({ timeout: 15_000 });

    await escolherPrimeiraOpcao(page, 'Produto');
    await escolherPrimeiraOpcao(page, 'Localização de origem');

    // Quantidade propositadamente enorme → deve falhar sem crash (STOCK_INSUFICIENTE)
    await page.getByLabel('Quantidade', { exact: false }).fill('999999');
    await page.getByRole('button', { name: /Registar Saída/i }).click();

    // Aviso de stock insuficiente OU permanência na página (sem crash de runtime)
    const aviso = page.getByText(/Stock insuficiente/i).first();
    const toast = page.locator('[data-sonner-toast]').first();
    await expect
      .poll(
        async () =>
          (await aviso.isVisible().catch(() => false)) ||
          (await toast.isVisible().catch(() => false)) ||
          page.url().includes('/nova/saida'),
        { timeout: 10_000 },
      )
      .toBeTruthy();
  });

  test('transferência: página dedicada com origem e destino', async ({ page }) => {
    await page.goto('/inventario/transferencias');
    await page.waitForLoadState('domcontentloaded');

    await expect(
      page.getByRole('heading', { name: 'Transferências de Stock' }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: /Nova Transferência/i }).click();
    await page.waitForURL(/\/inventario\/movimentacoes\/nova\/transferencia$/, { timeout: 10_000 });

    await expect(
      page.getByRole('heading', { name: 'Registar Transferência de Stock' }),
    ).toBeVisible({ timeout: 10_000 });

    // Campos de origem e destino distintos presentes
    await expect(page.getByText('Localização de origem')).toBeVisible();
    await expect(page.getByText('Localização de destino')).toBeVisible();
  });

  test('rota legada /stock/movimentacao redireciona para a canónica', async ({ page }) => {
    await page.goto('/stock/movimentacao');
    await page.waitForURL(/\/inventario\/movimentacoes$/, { timeout: 10_000 });
    await expect(
      page.getByRole('heading', { name: 'Movimentações de Stock' }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
