/**
 * Helper de autenticação para testes E2E — contra um Keycloak REAL.
 *
 * Desde o ADR-0010/0012, `/auth/login` é um redireccionamento: a porta de
 * entrada é o ecrã do Keycloak (realm `gespro`, tema `gespro`, locale pt).
 * O login E2E conduz o formulário do Keycloak de verdade — nunca um duplo
 * (gate da fase 2, ADR-0013 §6).
 *
 * Selectores do keycloak.v2: `#username`, `#password`, `#kc-login`. O texto
 * do botão («Iniciar sessão») vem do nosso overlay de mensagens — usar os IDs
 * torna os testes imunes a ajustes de copy.
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

/** Base pública do Keycloak — a mesma que o browser usa. */
export const KEYCLOAK_BASE = process.env.KEYCLOAK_E2E_BASE ?? 'http://localhost:8081';

/** Espera pelo formulário de login do Keycloak (após o salto OIDC). */
export async function esperarFormularioKeycloak(page: Page): Promise<void> {
  await page.waitForURL(/\/realms\/gespro\/protocol\/openid-connect\/auth/, { timeout: 20_000 });
  await expect(page.locator('#username')).toBeVisible({ timeout: 15_000 });
}

/**
 * Preenche o formulário do Keycloak. NÃO navega antes — o chamador decide o
 * ponto de partida (normalmente `/auth/login`, que salta para o Keycloak).
 */
export async function preencherLoginKeycloak(page: Page, user: TestUser): Promise<void> {
  await esperarFormularioKeycloak(page);
  await page.locator('#username').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
}

/**
 * Login completo: `/auth/login` → Keycloak → callback → dashboard.
 * Sem sleeps; confia no waitForURL com timeout explícito.
 */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/login');
  await preencherLoginKeycloak(page, user);
  // 60 s: em dev a primeira compilação do /dashboard demora mais do que o
  // fluxo OIDC inteiro. Não é rede — é o Turbopack a aquecer.
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 60_000 });
}

/**
 * Mensagem de erro DO KEYCLOAK (credenciais inválidas, conta desactivada…).
 * keycloak.v2 rende-a com `kcInputErrorMessageClass` (`.kc-feedback-text`);
 * alertas de página usam `.pf-v5-c-alert`.
 */
export async function expectKeycloakError(page: Page): Promise<void> {
  await expect(page.locator('.kc-feedback-text, .pf-v5-c-alert').first()).toBeVisible({
    timeout: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Admin API do Keycloak — para cenários que manipulam a sessão SSO ou criam
// identidades descartáveis (renovação/expiração, «não provisionado»).
// Usa a conta de serviço do cliente gespro-erp, como o ERP.
// ---------------------------------------------------------------------------

const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? 'gespro-erp';
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET ?? 'gespro-erp-dev-secret';

export async function keycloakAdminToken(): Promise<string> {
  const res = await fetch(`${KEYCLOAK_BASE}/realms/gespro/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token da conta de serviço falhou: HTTP ${res.status}`);
  const corpo = (await res.json()) as { access_token: string };
  return corpo.access_token;
}

/** Encerra TODAS as sessões SSO de um utilizador (por email) no Keycloak. */
export async function terminarSessoesKeycloak(email: string): Promise<void> {
  const token = await keycloakAdminToken();
  const utilizadores = (await (
    await fetch(
      `${KEYCLOAK_BASE}/admin/realms/gespro/users?email=${encodeURIComponent(email)}&exact=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
  ).json()) as Array<{ id: string }>;
  if (!utilizadores[0]) throw new Error(`utilizador ${email} não existe no realm`);
  const res = await fetch(
    `${KEYCLOAK_BASE}/admin/realms/gespro/users/${utilizadores[0].id}/logout`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`logout administrativo falhou: HTTP ${res.status}`);
}

/**
 * Cria uma identidade Keycloak COM palavra-passe e SEM `User` local — o caso
 * «autentica mas não está provisionado» (ADR-0011). Devolve o id para limpeza.
 */
export async function criarIdentidadeSemUserLocal(
  email: string,
  password: string,
): Promise<string> {
  const token = await keycloakAdminToken();
  const res = await fetch(`${KEYCLOAK_BASE}/admin/realms/gespro/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email,
      email,
      emailVerified: true,
      enabled: true,
      // Perfil completo: sem firstName/lastName o Keycloak intercepta o login
      // com o ecrã «Actualizar informações da conta» e o teste nunca chega ao ERP.
      firstName: 'Fantasma',
      lastName: 'E2E',
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  });
  if (res.status !== 201) throw new Error(`criação da identidade falhou: HTTP ${res.status}`);
  const lista = (await (
    await fetch(
      `${KEYCLOAK_BASE}/admin/realms/gespro/users?email=${encodeURIComponent(email)}&exact=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
  ).json()) as Array<{ id: string }>;
  return lista[0].id;
}

export async function apagarIdentidadeKeycloak(id: string): Promise<void> {
  const token = await keycloakAdminToken();
  await fetch(`${KEYCLOAK_BASE}/admin/realms/gespro/users/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
