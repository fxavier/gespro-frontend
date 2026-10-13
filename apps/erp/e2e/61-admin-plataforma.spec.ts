/**
 * E2E — issue #525 (nó B:admin-plataforma): área `/plataforma` do
 * administrador geral do sistema (ORÁCULO, escrito pelo verificador — alterá-lo
 * do lado de quem implementa é BLOCKER).
 *
 * Contra um Keycloak REAL com o realm local actualizado (utilizador
 * `plataforma@gespro.mz`, papel de realm `plataforma-admin`, sem `User` de
 * tenant). Não escreve nada na base.
 *
 * 1. `plataforma@gespro.mz` / demo1234 entra pelo NOSSO formulário e acaba em
 *    `/plataforma`: página em pt-PT, com «Início» no menu e «Sair», sem a barra
 *    lateral do tenant.
 * 2. Esse utilizador a pedir uma rota de tenant (`/dashboard`) volta a `/plataforma`.
 * 3. `admin@demo.mz` (administrador de TENANT, sem o papel) a pedir `/plataforma`
 *    recebe 404 — nunca vê a área.
 *
 * Prefixo único: admin-plataforma.
 */
import { test, expect } from '@playwright/test';
import { preencherLogin } from './helpers/auth';

const PLATAFORMA = { email: 'plataforma@gespro.mz', password: 'demo1234' };

test.describe('admin-plataforma — administrador de plataforma', () => {
  // Sessão limpa: o projecto `e2e` traz a do admin do tenant demo.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('admin-plataforma: login de plataforma@gespro.mz leva a /plataforma', async ({ page }) => {
    await page.goto('/auth/login');
    await preencherLogin(page, PLATAFORMA);
    await page.waitForURL(/\/plataforma(\/|\?|$)/, { timeout: 60_000 });

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: /^início$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sair/i }).or(page.getByRole('link', { name: /sair/i }))).toBeVisible();
    // Sem a barra lateral do tenant: nenhum módulo de tenant no menu.
    await expect(page.getByRole('link', { name: /^faturação$|^contabilidade$|^vendas$/i })).toHaveCount(0);
  });

  test('admin-plataforma: rota de tenant sem tenant volta a /plataforma', async ({ page }) => {
    await page.goto('/auth/login');
    await preencherLogin(page, PLATAFORMA);
    await page.waitForURL(/\/plataforma(\/|\?|$)/, { timeout: 60_000 });

    const resp = await page.goto('/dashboard');
    expect(resp?.status() ?? 0).toBeLessThan(500);
    await expect(page).toHaveURL(/\/plataforma(\/|\?|$)/);
  });
});

test.describe('admin-plataforma — administrador de tenant', () => {
  test('admin-plataforma: admin@demo.mz a pedir /plataforma recebe 404', async ({ page }) => {
    const resp = await page.goto('/plataforma');
    expect(resp?.status()).toBe(404);
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
