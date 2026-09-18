/**
 * E2E: Fluxo de Autenticação — Direct Access Grant contra um Keycloak REAL
 * (ADR-0029; a autenticação é mesmo dele, só o ecrã é nosso).
 *
 * `/auth/login` é o NOSSO formulário: `#identificador`, `#palavraPasse`,
 * `button[type=submit]`. Não há salto de domínio, e vários testes aqui
 * afirmam isso explicitamente — é a regressão que mais facilmente passaria
 * despercebida.
 *
 * Fluxos cobertos:
 * 1. Login com sucesso (admin) → dashboard, sem tocar no domínio do Keycloak
 * 2. Palavra-passe errada → erro NOSSO, sem sair de /auth/login
 * 3. Outro papel (gestor) autentica
 * 4. E-mail inexistente → mesma mensagem (não revela existência)
 * 5. Identidade no Keycloak SEM User local → recusa explícita do ERP,
 *    nunca criação implícita (ADR-0011)
 * 6. Terminar sessão → o regresso pede credenciais de novo
 *
 * Determinístico: sem sleeps; usa expect auto-retry e waitForURL.
 */

import { test, expect } from '@playwright/test';
import {
  USERS,
  loginAs,
  preencherLogin,
  expectErroLogin,
  criarIdentidadeSemUserLocal,
  apagarIdentidadeKeycloak,
} from './helpers/auth';

// Este ficheiro não usa o storageState global — testa o login em si
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(90_000);

test.describe('Autenticação (direct grant)', () => {
  test('login com sucesso redireciona para dashboard', async ({ page }) => {
    await loginAs(page, USERS.admin);
    await expect(page).not.toHaveURL(/auth\/login/);
  });

  test('o browser NUNCA visita o domínio do Keycloak', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) hosts.add(new URL(f.url()).host);
    });

    await loginAs(page, USERS.admin);

    // É esta a razão de ser do ADR-0029. Se um dia voltar a haver salto, é
    // aqui que se descobre — e não num relato de quem usa o produto.
    expect([...hosts].some((h) => h.includes('8081'))).toBe(false);
  });

  test('palavra-passe errada mostra erro nosso e não sai da página', async ({ page }) => {
    await page.goto('/auth/login');
    await preencherLogin(page, { email: 'admin@demo.mz', password: 'senha-errada-9999' });

    await expectErroLogin(page);
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.locator('form [role=alert]')).toContainText(/incorrect/i);
  });

  test('utilizador gestor consegue autenticar', async ({ page }) => {
    await loginAs(page, USERS.gestor);
    await expect(page).not.toHaveURL(/auth\/login/);
  });

  test('email inexistente dá a MESMA mensagem (não revela existência)', async ({ page }) => {
    await page.goto('/auth/login');
    await preencherLogin(page, {
      email: 'utilizador-nao-existe@demo.mz',
      password: 'qualquer1234',
    });

    await expectErroLogin(page);
    const erro = page.locator('form [role=alert]');
    await expect(erro).not.toContainText(/não encontrado|não existe|inexistente/i);
    // A mesma cadeia que uma palavra-passe errada numa conta que existe.
    await expect(erro).toContainText(/incorrect/i);
  });

  test('a palavra-passe nunca aparece num URL', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));

    await page.goto('/auth/login');
    await preencherLogin(page, USERS.admin);
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 60_000 });

    expect(urls.some((u) => u.includes(USERS.admin.password))).toBe(false);
  });

  test('identidade sem User local é recusada com mensagem explícita (ADR-0011)', async ({
    page,
  }) => {
    const email = `fantasma-${Date.now()}@teste-e2e.mz`;
    const id = await criarIdentidadeSemUserLocal(email, 'segredo-fantasma-1');
    try {
      await page.goto('/auth/login');
      await preencherLogin(page, { email, password: 'segredo-fantasma-1' });

      // O Keycloak autentica; é o ERP que recusa — nunca criação implícita.
      await expectErroLogin(page);
      await expect(page.locator('form [role=alert]')).toContainText(
        /administrador da sua empresa/i,
      );
    } finally {
      await apagarIdentidadeKeycloak(id);
    }
  });

  test('terminar sessão obriga a autenticar de novo', async ({ page }) => {
    await loginAs(page, USERS.admin);

    await page.goto('/api/auth/signout');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/auth\/login|\/$/, { timeout: 30_000 });

    // Sem sessão, uma página protegida devolve ao formulário — e o token de
    // renovação foi revogado no servidor (events.signOut, ADR-0029).
    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/login/, { timeout: 30_000 });
    await expect(page.locator('#identificador')).toBeVisible();
  });
});
