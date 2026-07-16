/**
 * Helpers de navegação para testes E2E.
 * Funções reutilizáveis para navegar e aguardar estados da UI.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Navega para uma página e aguarda o carregamento completo.
 * Usa networkidle para garantir SSR + hydration.
 */
export async function gotoAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Aguarda que um toast de sucesso do sonner apareça.
 */
export async function expectSuccessToast(page: Page, textFragment?: string): Promise<void> {
  const toast = page.locator('[data-sonner-toast][data-type="success"]');
  await expect(toast.first()).toBeVisible({ timeout: 10_000 });
  if (textFragment) {
    await expect(toast.first()).toContainText(textFragment);
  }
}

/**
 * Aguarda que um toast de erro apareça.
 */
export async function expectErrorToast(page: Page, textFragment?: string): Promise<void> {
  const toast = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(toast.first()).toBeVisible({ timeout: 10_000 });
  if (textFragment) {
    await expect(toast.first()).toContainText(textFragment);
  }
}

/**
 * Aguarda que a tabela de dados carregue (sai do skeleton).
 */
export async function waitForTable(page: Page): Promise<void> {
  // Aguarda que o skeleton desapareça e a tabela apareça
  await expect(page.locator('table')).toBeVisible({ timeout: 15_000 });
}

/**
 * Clica num botão e aguarda que o spinner desapareça.
 */
export async function clickAndWait(page: Page, buttonText: string): Promise<void> {
  const button = page.getByRole('button', { name: buttonText });
  await button.click();
  // Aguarda que o botão saia do estado pending
  await expect(button).not.toBeDisabled({ timeout: 10_000 });
}
