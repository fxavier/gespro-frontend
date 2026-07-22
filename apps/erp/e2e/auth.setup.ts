/**
 * Setup de autenticação — cria e persiste o estado de sessão do utilizador admin.
 *
 * Executado antes de todos os testes E2E.
 * Guarda cookies/localStorage em playwright/.auth/admin.json.
 *
 * NOTA: "Iniciar Sessão" é um CardTitle (div), NÃO um heading semântico.
 * O heading real da página é o h2 "Autenticação Segura".
 */

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/admin.json');

setup('autenticar como admin', async ({ page }) => {
  await page.goto('/auth/login');

  // Aguarda o campo de e-mail estar visível (mais robusto que esperar pelo heading)
  await expect(page.getByLabel('E-mail Corporativo')).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('E-mail Corporativo').fill('admin@demo.mz');
  await page.getByLabel('Palavra-passe').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();

  // Aguarda redirecionamento para o dashboard
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 20_000 });

  // Guardar estado de sessão autenticada
  await page.context().storageState({ path: AUTH_FILE });
});
