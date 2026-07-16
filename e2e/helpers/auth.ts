/**
 * Helper de autenticação para testes E2E.
 *
 * Usa a API de login do next-auth com credentials provider.
 * Sem sleeps: usa expect com auto-retry.
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
}

export const USERS = {
  admin: { email: 'admin@demo.mz', password: 'demo1234' },
  gestor: { email: 'gestor@demo.mz', password: 'demo1234' },
  financeiro: { email: 'financeiro@demo.mz', password: 'demo1234' },
  operador: { email: 'operador@demo.mz', password: 'demo1234' },
  leitura: { email: 'leitura@demo.mz', password: 'demo1234' },
} satisfies Record<string, TestUser>;

/**
 * Login via formulário — aguarda redirecionamento com auto-retry.
 * Não usa sleep; confia no waitForURL com timeout explícito.
 */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading', { name: 'Iniciar Sessão' })).toBeVisible();

  await page.getByLabel('E-mail Corporativo').fill(user.email);
  await page.getByLabel('Palavra-passe').fill(user.password);
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();

  await page.waitForURL(/\/(dashboard|$)/, { timeout: 15_000 });
}

/**
 * Verifica que uma mensagem de erro de autenticação está visível.
 */
export async function expectLoginError(page: Page): Promise<void> {
  await expect(
    page.locator('[role="alert"], .text-destructive').first()
  ).toBeVisible({ timeout: 5_000 });
}
