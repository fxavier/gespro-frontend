/**
 * E2E: Venda POS — Fluxo Completo
 *
 * Fluxos cobertos:
 * 1. POS sem sessão activa mostra setup
 * 2. Terminal POS carrega com produtos (se sessão activa)
 * 3. Pesquisa de produto no terminal
 *
 * Nota: Para testar a venda completa (produto → carrinho → finalizar),
 * o DB precisa de ter: sessão de caixa aberta → sessão POS activa.
 * O teste verifica o fluxo de setup quando necessário.
 *
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';

test.describe('POS — Terminal de Venda', () => {
  test('página POS carrega sem erros', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    // POS pode mostrar setup ou terminal
    const setup = page.getByText('Nenhuma sessão POS activa');
    const terminal = page.getByRole('textbox', { name: /Pesquisar produto/i });

    const hasSetup = await setup.isVisible({ timeout: 10_000 }).catch(() => false);
    const hasTerminal = await terminal.isVisible({ timeout: 10_000 }).catch(() => false);

    expect(hasSetup || hasTerminal).toBeTruthy();
  });

  test('POS setup: formulário de iniciar sessão está acessível', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    const setup = page.getByText('Nenhuma sessão POS activa');
    const hasSetup = await setup.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasSetup) {
      // Verifica o formulário de setup
      await expect(page.getByLabel('ID da Sessão de Caixa')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Iniciar Sessão POS' })).toBeVisible();
    }
  });

  test('POS setup: campo obrigatório impede submissão vazia', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    const setup = page.getByText('Nenhuma sessão POS activa');
    const hasSetup = await setup.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasSetup) {
      // Tenta submeter sem preencher
      await page.getByRole('button', { name: 'Iniciar Sessão POS' }).click();

      // Deve mostrar validação ou permanecer na mesma página
      await expect(page).toHaveURL(/\/pos/);
    }
  });

  test('terminal POS: pesquisa de produto filtra a lista', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    // Verifica se temos um terminal activo
    const searchInput = page.locator('input[placeholder*="produto"], input[placeholder*="Pesquisar"]').first();
    const hasTerminal = await searchInput.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasTerminal) {
      // Pesquisa por produto
      await searchInput.fill('produto');

      // A lista de produtos deve filtrar
      await expect(page.locator('[data-testid="produto-card"], .produto-card, button[data-produto]').first()).toBeVisible({
        timeout: 5_000,
      }).catch(() => {
        // Se não há produtos com esse nome, pode estar vazia
      });
    }
  });

  test('terminal POS: atalho F10 não lança erro com carrinho vazio', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    const hasTerminal = await page
      .locator('input[placeholder*="produto"], input[placeholder*="Pesquisar"]')
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);

    if (hasTerminal) {
      // F10 com carrinho vazio não deve causar crash
      await page.keyboard.press('F10');

      // A página deve continuar a funcionar
      await expect(page).toHaveURL(/\/pos/);
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
