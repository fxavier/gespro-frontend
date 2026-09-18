/**
 * E2E OBRIGATÓRIO (ADR-0013 §6): expiração e renovação silenciosa de sessão.
 *
 * É a aresta conhecida do Auth.js v5 em App Router (ADR-0010, riscos
 * assumidos) e NÃO pode ser verificada por inspecção de código — só a correr
 * contra um Keycloak real.
 *
 * O que se prova:
 *  1. RENOVAÇÃO: passado o intervalo de re-resolução (`AUTH_SESSION_MAX_AGE`,
 *     posto em segundos pelo webServer do Playwright), um pedido novo renova a
 *     sessão em silêncio — o utilizador NUNCA vê o ecrã de login.
 *  2. EXPIRAÇÃO: encerrada a sessão SSO no Keycloak (logout administrativo —
 *     o equivalente operacional de «revogar acesso já»), a sessão do ERP cai
 *     na re-resolução seguinte — a garantia dos «15 minutos, no máximo» do
 *     ADR-0011, aqui comprimida para segundos.
 *
 * Nenhum teste espera 15 minutos: é exactamente por isso que as durações são
 * parâmetros de ambiente e não valores fixos no realm.
 */

import { test, expect } from '@playwright/test';
import { USERS, loginAs, terminarSessoesKeycloak } from './helpers/auth';

// Tem de bater certo com o env do webServer (playwright.config.ts).
const INTERVALO_S = Number(process.env.AUTH_SESSION_MAX_AGE ?? '8');

// Sessões próprias — não tocar no storageState partilhado do admin.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Sessão: renovação silenciosa e expiração', () => {
  // Duas esperas deliberadas pelo deadline + navegações: mais de 30 s por teste.
  test.setTimeout(180_000);
  test.skip(
    !Number.isFinite(INTERVALO_S) || INTERVALO_S > 60,
    'AUTH_SESSION_MAX_AGE tem de estar em segundos (≤60) para este cenário — ' +
      'o webServer do Playwright define 8 s; um servidor pré-existente com 15 min não serve.',
  );

  test('a sessão renova em silêncio depois do intervalo de re-resolução', async ({ page }) => {
    await loginAs(page, USERS.gestor);
    await expect(page).not.toHaveURL(/realms\/gespro|auth\/login/);

    // Deixa o deadline de re-resolução passar em claro.
    await page.waitForTimeout((INTERVALO_S + 3) * 1000);

    // O pedido seguinte força renovação (grant refresh_token no Keycloak +
    // releitura de permissões/ativo/subscrição no Postgres) — invisível.
    await page.goto('/compras/requisicoes');
    await expect(
      page.getByRole('heading', { name: 'Requisições de Compra' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/realms\/gespro|auth\/login|auth\/erro/);

    // E renova mais do que uma vez — não é um fôlego único.
    await page.waitForTimeout((INTERVALO_S + 3) * 1000);
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/realms\/gespro|auth\/login|auth\/erro/);
  });

  test('encerrar a sessão SSO no Keycloak derruba a sessão do ERP na re-resolução seguinte', async ({
    page,
  }) => {
    await loginAs(page, USERS.operador);
    await expect(page).not.toHaveURL(/realms\/gespro|auth\/login/);

    // Revogação operacional (ADR-0011): logout administrativo no Keycloak.
    await terminarSessoesKeycloak(USERS.operador.email);

    // Dentro do intervalo, a sessão do ERP ainda vive — é JWT local (ADR-0010:
    // quem já tem sessão continua a trabalhar durante uma indisponibilidade;
    // a revogação chega na re-resolução, não no instante).
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/realms\/gespro|auth\/login/, { timeout: 15_000 });

    // Passado o intervalo, a renovação é RECUSADA pelo Keycloak e a sessão cai.
    await page.waitForTimeout((INTERVALO_S + 3) * 1000);
    await page.goto('/dashboard');
    await page.waitForURL(/realms\/gespro\/protocol\/openid-connect\/auth|auth\/login/, {
      timeout: 30_000,
    });
  });
});
