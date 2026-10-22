/**
 * #551 — redireccionamento aberto no login.
 *
 * O formulário de `/auth/login` (ADR-0029) navega para o `callbackUrl` da
 * query string depois do direct grant. Um URL absoluto ou de protocolo
 * relativo levava o utilizador, já autenticado, para fora do domínio. Só um
 * caminho relativo da mesma origem pode passar (`destinoSeguro`).
 *
 * Login feito no próprio teste, contra o Keycloak real — nunca o storageState
 * partilhado do setup. Não deixa dados no tenant `demo`.
 */

import { test, expect } from '@playwright/test';
import { USERS, preencherLogin } from './helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login: callbackUrl só para a mesma origem (#551)', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    // Se o defeito voltar, o browser sai para o domínio de fora; cortar o pedido
    // mantém o teste rápido e sem rede — a afirmação sobre o URL decide.
    // Pelo host, não pelo texto: o próprio `/auth/login?callbackUrl=…` contém-no.
    await page.route((url) => url.hostname.endsWith('exemplo.invalid'), (rota) => rota.abort());
  });

  for (const cb of ['https://exemplo.invalid', '//exemplo.invalid', '/\\exemplo.invalid']) {
    test(`callbackUrl=${cb} termina em /dashboard`, async ({ page, baseURL }) => {
      await page.goto(`/auth/login?callbackUrl=${encodeURIComponent(cb)}`);
      await page.waitForLoadState('networkidle');
      await preencherLogin(page, USERS.admin);

      await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
      const final = new URL(page.url());
      expect(final.origin).toBe(new URL(baseURL!).origin);
      expect(final.pathname).toBe('/dashboard');
    });
  }

  test('callbackUrl=/faturacao continua a funcionar', async ({ page, baseURL }) => {
    await page.goto(`/auth/login?callbackUrl=${encodeURIComponent('/faturacao')}`);
    await page.waitForLoadState('networkidle');
    await preencherLogin(page, USERS.admin);

    await page.waitForURL(/\/faturacao(\?|$)/, { timeout: 60_000 });
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });

  test('o proxy guarda o caminho pedido e o login devolve-o', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForURL(/\/auth\/login\?/, { timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe('/faturacao');
    await page.waitForLoadState('networkidle');
    await preencherLogin(page, USERS.admin);

    await page.waitForURL(/\/faturacao(\?|$)/, { timeout: 60_000 });
  });
});
