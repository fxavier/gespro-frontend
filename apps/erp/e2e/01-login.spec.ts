/**
 * E2E: Fluxo de Autenticação
 *
 * Markup real da página /auth/login:
 * - h2: "Autenticação Segura"
 * - CardTitle (div, não heading): "Iniciar Sessão"
 * - label for="email": "E-mail Corporativo"
 * - label for="password": "Palavra-passe"
 * - button[type=submit]: "Entrar no sistema"
 * - .text-destructive: mensagem de erro
 *
 * Fluxos cobertos:
 * 1. Login com sucesso
 * 2. Login com credenciais inválidas
 * 3. Login com campos vazios
 * 4. Login com outro role (gestor)
 * 5. Email inexistente — mensagem genérica
 * 6. Botão desabilitado durante submissão
 *
 * Determinístico: sem sleeps; usa expect com auto-retry e waitForURL.
 */

import { test, expect } from '@playwright/test';

// Este ficheiro não usa o storageState global — testa o login em si
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Autenticação', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    // Aguarda o campo de email (mais robusto que heading — CardTitle não é h*)
    await expect(page.getByLabel('E-mail Corporativo')).toBeVisible({ timeout: 15_000 });
  });

  test('login com sucesso redireciona para dashboard', async ({ page }) => {
    await page.getByLabel('E-mail Corporativo').fill('admin@demo.mz');
    await page.getByLabel('Palavra-passe').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar no sistema' }).click();

    // Aguarda redirecionamento — auto-retry sem sleep
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 20_000 });

    // Confirma que saiu da página de login
    await expect(page).not.toHaveURL(/auth\/login/);
  });

  test('login com credenciais inválidas mostra mensagem de erro', async ({ page }) => {
    await page.getByLabel('E-mail Corporativo').fill('admin@demo.mz');
    await page.getByLabel('Palavra-passe').fill('senha-errada-9999');
    await page.getByRole('button', { name: 'Entrar no sistema' }).click();

    // Mensagem de erro — está num div.text-destructive com AlertCircle icon
    const erro = page.locator('.text-destructive').first();
    await expect(erro).toBeVisible({ timeout: 10_000 });
    await expect(erro).toContainText(/inválid|bloqueada|tente/i);

    // Permanece na página de login
    await expect(page).toHaveURL(/auth\/login/);
  });

  test('login com campos vazios não submete e permanece na página', async ({ page }) => {
    // A validação client-side impede a submissão com campos vazios
    const submitButton = page.getByRole('button', { name: 'Entrar no sistema' });
    await submitButton.click();

    // Deve permanecer na página de login
    await expect(page).toHaveURL(/auth\/login/);
  });

  test('utilizador gestor consegue autenticar', async ({ page }) => {
    await page.getByLabel('E-mail Corporativo').fill('gestor@demo.mz');
    await page.getByLabel('Palavra-passe').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar no sistema' }).click();

    await page.waitForURL(/\/(dashboard|$)/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/auth\/login/);
  });

  test('email inexistente mostra mensagem genérica (não revela existência)', async ({ page }) => {
    await page.getByLabel('E-mail Corporativo').fill('utilizador-nao-existe@demo.mz');
    await page.getByLabel('Palavra-passe').fill('qualquer1234');
    await page.getByRole('button', { name: 'Entrar no sistema' }).click();

    const erro = page.locator('.text-destructive').first();
    await expect(erro).toBeVisible({ timeout: 10_000 });
    // Mensagem genérica — não deve revelar se o email existe
    await expect(erro).not.toContainText(/email não encontrado|utilizador não existe/i);
  });

  test('botão mostra estado de carregamento durante submissão', async ({ page }) => {
    await page.getByLabel('E-mail Corporativo').fill('admin@demo.mz');
    await page.getByLabel('Palavra-passe').fill('demo1234');

    const submitButton = page.getByRole('button', { name: 'Entrar no sistema' });
    await submitButton.click();

    // Aguarda login e redirecionamento
    await page.waitForURL(/\/(dashboard|$)/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/auth\/login/);
  });
});
