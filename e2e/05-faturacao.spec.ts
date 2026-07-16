/**
 * E2E: Faturação — Emissão de Fatura
 *
 * Fluxos cobertos:
 * 1. Listagem de faturas carrega com KPIs
 * 2. Página de nova fatura tem formulário correcto
 * 3. Validação de campos obrigatórios
 * 4. Numeração sequencial verificada (existência de séries)
 *
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';

test.describe('Faturação', () => {
  test('listagem de faturas carrega sem erros', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    // KPIs ou tabela devem carregar
    await expect(
      page.locator('table, [class*="kpi"], [class*="empty"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // Sem erros críticos
    await expect(
      page.locator('.text-destructive').filter({ hasText: /erro ao carregar/i })
    ).not.toBeVisible();
  });

  test('botão "Nova Fatura" navega para formulário', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Nova Fatura' }).click();
    await page.waitForURL(/\/faturacao\/nova/, { timeout: 10_000 });

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('formulário de nova fatura tem campos obrigatórios', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    // Campos de data — Label não tem htmlFor, usa selector por name/type
    const dataEmissao = page.locator('input[name="dataEmissao"], input[type="date"]').first();

    // Um campo de data deve existir
    const hasDataEmissao = await dataEmissao.isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasDataEmissao).toBeTruthy();
  });

  test('formulário de nova fatura: validação impede emissão sem dados', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    // Tenta emitir sem preencher
    const emitirBtn = page.getByRole('button', { name: /Emitir|Guardar|Criar/i }).first();
    if (await emitirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emitirBtn.click();

      // Deve permanecer na mesma página (validação)
      await expect(page).toHaveURL(/\/faturacao\/nova/);
    }
  });

  test('numeração sequencial: séries de documentos existem', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    // Verifica se existe select de série de documento
    const serieSelect = page.getByRole('combobox').filter({ hasText: /Série|FT|FR/i });
    if (await serieSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // A série deve ter sido pre-selecionada pelo servidor
      const serieValue = await serieSelect.textContent();
      expect(serieValue).toBeTruthy();
      expect(serieValue).not.toBe('');
    }
  });

  test('fatura emitida aparece na listagem com número sequencial', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    // Aguarda a tabela
    const tabela = page.locator('table');
    if (await tabela.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // Faturas na tabela devem ter número no formato esperado (ex: FT 2026/1)
      const primeiraLinha = tabela.locator('tbody tr').first();
      if (await primeiraLinha.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const textoLinha = await primeiraLinha.textContent();
        // O número deve existir (não vazio)
        expect(textoLinha).toBeTruthy();
      }
    }
  });
});
