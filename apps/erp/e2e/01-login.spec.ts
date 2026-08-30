/**
 * E2E: Fluxo de Autenticação — OIDC contra um Keycloak REAL (ADR-0010/0013).
 *
 * `/auth/login` é um redireccionamento; o formulário é o do Keycloak
 * (keycloak.v2 + tema gespro): `#username`, `#password`, `#kc-login`.
 *
 * Fluxos cobertos:
 * 1. Login com sucesso (admin) → dashboard
 * 2. Palavra-passe errada → erro DO KEYCLOAK, sem sair do realm
 * 3. Outro papel (gestor) autentica
 * 4. E-mail inexistente → mensagem genérica (não revela existência)
 * 5. Identidade no Keycloak SEM User local → recusa explícita do ERP
 *    («contacte o administrador da sua empresa»), nunca criação implícita
 * 6. Terminar sessão encerra também a SSO (não há re-login automático)
 *
 * Determinístico: sem sleeps; usa expect auto-retry e waitForURL.
 */

import { test, expect } from '@playwright/test';
import {
  USERS,
  loginAs,
  preencherLoginKeycloak,
  expectKeycloakError,
  criarIdentidadeSemUserLocal,
  apagarIdentidadeKeycloak,
} from './helpers/auth';

// Este ficheiro não usa o storageState global — testa o login em si
test.use({ storageState: { cookies: [], origins: [] } });
// Cada teste atravessa o fluxo OIDC completo (e alguns criam identidades).
test.setTimeout(90_000);

test.describe('Autenticação (Keycloak)', () => {
  test('login com sucesso redireciona para dashboard', async ({ page }) => {
    await loginAs(page, USERS.admin);
    await expect(page).not.toHaveURL(/auth\/login|realms\/gespro/);
  });

  test('palavra-passe errada mostra erro do Keycloak e não entra', async ({ page }) => {
    await page.goto('/auth/login');
    await preencherLoginKeycloak(page, { email: 'admin@demo.mz', password: 'senha-errada-9999' });

    await expectKeycloakError(page);
    // Continua no ecrã de login do realm — a força bruta é gerida lá.
    await expect(page).toHaveURL(/realms\/gespro/);
  });

  test('utilizador gestor consegue autenticar', async ({ page }) => {
    await loginAs(page, USERS.gestor);
    await expect(page).not.toHaveURL(/realms\/gespro/);
  });

  test('email inexistente mostra mensagem genérica (não revela existência)', async ({ page }) => {
    await page.goto('/auth/login');
    await preencherLoginKeycloak(page, {
      email: 'utilizador-nao-existe@demo.mz',
      password: 'qualquer1234',
    });

    await expectKeycloakError(page);
    const erro = page.locator('.kc-feedback-text, .pf-v5-c-alert').first();
    await expect(erro).not.toContainText(/não encontrado|não existe/i);
  });

  test('identidade sem User local é recusada com mensagem explícita (ADR-0011)', async ({
    page,
  }) => {
    const email = `fantasma-${Date.now()}@teste-e2e.mz`;
    const id = await criarIdentidadeSemUserLocal(email, 'segredo-fantasma-1');
    try {
      await page.goto('/auth/login');
      await preencherLoginKeycloak(page, { email, password: 'segredo-fantasma-1' });

      // O Keycloak autentica; é o ERP que recusa — nunca criação implícita.
      await page.waitForURL(/\/auth\/erro/, { timeout: 30_000 });
      await expect(page.getByText(/administrador da sua empresa/i)).toBeVisible();
    } finally {
      await apagarIdentidadeKeycloak(id);
    }
  });

  test('terminar sessão encerra a SSO — o regresso pede credenciais de novo', async ({ page }) => {
    await loginAs(page, USERS.admin);

    // O signOut local + RP-initiated logout no Keycloak (com confirmação).
    await page.goto('/api/auth/logout-keycloak');
    await page.waitForURL(/realms\/gespro/, { timeout: 20_000 });
    // Ecrã de confirmação de logout do Keycloak (sem id_token_hint).
    await page.locator('#kc-logout').click();

    // De volta a /auth/login → novo salto OIDC → SEM sessão SSO, o Keycloak
    // apresenta o formulário em vez de re-autenticar em silêncio.
    await page.waitForURL(/realms\/gespro\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
    await expect(page.locator('#username')).toBeVisible();
  });
});
