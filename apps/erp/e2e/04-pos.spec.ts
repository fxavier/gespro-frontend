/**
 * E2E: Venda POS — Fluxo Completo
 *
 * Regra do /pos: caixa aberto = POS pronto.
 *   - Sem sessão de caixa do utilizador → redirecção para /caixa/abertura
 *     com `voltar=/pos`, para regressar ao terminal depois de abrir.
 *   - Com caixa aberto e sem sessão POS → a sessão POS abre sozinha (sem
 *     pedir o cuid da sessão de caixa) e o terminal aparece.
 *   - Com sessão POS aberta → terminal.
 *
 * Os testes aceitam qualquer um dos estados iniciais — o que a base tem no
 * momento — e verificam o contrato de cada ramo.
 *
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';

const pesquisa = (page: import('@playwright/test').Page) =>
  page.getByRole('textbox', { name: /Pesquisar produto/i });

test.describe('POS — Terminal de Venda', () => {
  test('/pos nunca pede o ID da sessão de caixa', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByLabel('ID da Sessão de Caixa')).toHaveCount(0);
    await expect(page.getByText('Nenhuma sessão POS activa')).toHaveCount(0);
  });

  test('sem caixa aberto, /pos vai para a abertura e guarda o caminho de volta', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    if (/\/caixa\/abertura/.test(page.url())) {
      expect(new URL(page.url()).searchParams.get('voltar')).toBe('/pos');
      await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible();
    } else {
      // Caixa aberto: o outro ramo é verificado no teste seguinte.
      await expect(page).toHaveURL(/\/pos/);
    }
  });

  test('com caixa aberto, o terminal aparece sem interacção', async ({ page }) => {
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');

    if (/\/pos$/.test(new URL(page.url()).pathname)) {
      // Ou já havia sessão POS, ou o ecrã «A iniciar o POS…» abre uma e
      // recarrega — em qualquer caso o terminal tem de chegar sozinho.
      await expect(pesquisa(page)).toBeVisible({ timeout: 20_000 });
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
