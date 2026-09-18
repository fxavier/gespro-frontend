/**
 * Setup de autenticação — cria e persiste o estado de sessão do utilizador
 * admin, autenticando-se DE VERDADE contra o Keycloak (ADR-0013 §6: o E2E
 * conduz o formulário do realm `gespro`, nunca um duplo).
 *
 * Executado antes de todos os testes E2E.
 * Guarda cookies em playwright/.auth/admin.json e reutiliza-os nos restantes
 * cenários — o mesmo padrão de sempre, agora com o login no Keycloak.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import { loginAs, USERS } from './helpers/auth';

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/admin.json');

setup('autenticar como admin (via Keycloak)', async ({ page }) => {
  setup.setTimeout(120_000); // compilação fria do dev server + fluxo OIDC real
  await loginAs(page, USERS.admin);

  // Confirma que a sessão fechou do lado do ERP (não ficou no Keycloak).
  await expect(page).not.toHaveURL(/realms\/gespro/);

  await page.context().storageState({ path: AUTH_FILE });
});
