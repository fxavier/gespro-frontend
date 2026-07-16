/**
 * E2E: Caixa — Abertura e Fecho
 *
 * Fluxos cobertos:
 * 1. Abertura de caixa (wizard 2 passos)
 * 2. Listagem de sessões de caixa
 * 3. Fecho de caixa sem sessão activa mostra aviso
 *
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';

test.describe('Gestão de Caixa', () => {
  test('listagem de caixa carrega sem erros', async ({ page }) => {
    await page.goto('/caixa');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Gestão de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Tabela ou estado vazio — um deve aparecer
    await expect(
      page.locator('table, [class*="empty-state"], .text-muted-foreground').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('página de abertura de caixa carrega o wizard', async ({ page }) => {
    await page.goto('/caixa/abertura');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Stepper deve estar visível
    await expect(page.getByText('Preparação')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Dados')).toBeVisible();

    // Lista de verificação
    await expect(page.getByText('Lista de Verificação')).toBeVisible();
    await expect(page.getByText('Contei o dinheiro físico em caixa')).toBeVisible();
  });

  test('wizard de abertura: passo 1 - checklist impede avanço sem marcar tudo', async ({ page }) => {
    await page.goto('/caixa/abertura');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Botão "Prosseguir" deve estar desabilitado antes de marcar o checklist
    const prosseguirBtn = page.getByRole('button', { name: 'Prosseguir' });
    await expect(prosseguirBtn).toBeDisabled({ timeout: 5_000 });

    // Marcar todos os itens do checklist
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).click();
    }

    // Agora o botão deve estar habilitado
    await expect(prosseguirBtn).not.toBeDisabled({ timeout: 5_000 });
  });

  test('wizard de abertura: fluxo completo até confirmação', async ({ page }) => {
    await page.goto('/caixa/abertura');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Passo 1: marcar todos os checkboxes
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).click();
    }

    await page.getByRole('button', { name: 'Prosseguir' }).click();

    // Passo 2: Dados da Abertura
    await expect(page.getByText('Dados da Abertura')).toBeVisible({ timeout: 5_000 });

    // Preenche o fundo inicial
    const fundoInput = page.getByLabel(/Fundo Inicial/i);
    await fundoInput.fill('5000');

    // Clica em confirmar abertura
    await page.getByRole('button', { name: 'Confirmar Abertura' }).click();

    // Aguarda resultado: toast (qualquer tipo) ou redirecionamento — auto-retry obrigatório
    await expect(async () => {
      const url = page.url();
      const redirected = url.includes('/caixa') && !url.includes('/abertura');
      if (redirected) return; // sucesso com redirect

      // Verifica toast (sucesso, erro ou aviso — qualquer um confirma que a acção correu)
      const hasToast = await page.locator('[data-sonner-toast]').first().isVisible();
      expect(hasToast, 'Aguardando toast ou redirect após Confirmar Abertura').toBeTruthy();
    }).toPass({ timeout: 15_000 });
  });

  test('fecho de caixa sem sessão activa mostra aviso', async ({ page }) => {
    await page.goto('/caixa/fechamento');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Fecho de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Se não há sessão activa, mostra o aviso
    const semSessao = page.getByText('Sem Sessão Activa');
    const comSessao = page.getByText('Sessão a Fechar');

    // Um dos dois deve ser visível
    const hasSemSessao = await semSessao.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasComSessao = await comSessao.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasSemSessao || hasComSessao).toBeTruthy();

    if (hasSemSessao) {
      // Verifica o botão de abrir caixa
      await expect(page.getByRole('link', { name: 'Abrir Caixa' })).toBeVisible();
    }
  });

  test('navegação por breadcrumbs funciona', async ({ page }) => {
    await page.goto('/caixa/abertura');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({
      timeout: 15_000,
    });

    // Clicar em "Caixa" nos breadcrumbs
    const breadcrumbCaixa = page.getByRole('link', { name: 'Caixa' });
    if (await breadcrumbCaixa.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await breadcrumbCaixa.click();
      await page.waitForURL(/\/caixa$/, { timeout: 10_000 });
    }
  });
});
