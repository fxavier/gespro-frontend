/**
 * Helper de autenticação para testes E2E — contra um Keycloak REAL.
 *
 * Desde o ADR-0029 o formulário é NOSSO: `/auth/login` não salta para lado
 * nenhum, e as credenciais vão por Direct Access Grant. O Keycloak continua a
 * ser quem autentica de verdade — nunca um duplo (gate da fase 2, ADR-0013
 * §6) —, só deixou de ser ele a mostrar o ecrã.
 *
 * Selectores: `#identificador`, `#palavraPasse`, `button[type=submit]`. Usar
 * IDs torna os testes imunes a ajustes de copy.
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

/** Espera pelo nosso formulário em `/auth/login` — já não há salto a esperar. */
export async function esperarFormularioLogin(page: Page): Promise<void> {
  await expect(page.locator('#identificador')).toBeVisible({ timeout: 20_000 });
}

/**
 * Preenche o formulário. NÃO navega antes — o chamador decide o ponto de
 * partida (normalmente `/auth/login`).
 */
export async function preencherLogin(page: Page, user: TestUser): Promise<void> {
  await esperarFormularioLogin(page);
  await page.locator('#identificador').fill(user.email);
  await page.locator('#palavraPasse').fill(user.password);
  await page.locator('button[type=submit]').click();
}

/**
 * Login completo: `/auth/login` → direct grant → dashboard. Sem salto de
 * domínio — e o `loginAs` afirma-o, para a regressão não passar despercebida.
 */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/login');
  await preencherLogin(page, user);
  // 60 s: em dev a primeira compilação do /dashboard demora mais do que o
  // próprio login. Não é rede — é o Turbopack a aquecer.
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 60_000 });
  expect(new URL(page.url()).host).not.toContain('8081');
}

/**
 * Mensagem de recusa do NOSSO formulário (credenciais inválidas, conta por
 * activar, subscrição suspensa…). O ecrã rende-a num `role=alert` dentro do
 * formulário — ver `MotivoRecusaLogin` em `src/lib/auth.ts`.
 */
export async function expectErroLogin(page: Page): Promise<void> {
  await expect(page.locator('form [role=alert]').first()).toBeVisible({ timeout: 15_000 });
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
