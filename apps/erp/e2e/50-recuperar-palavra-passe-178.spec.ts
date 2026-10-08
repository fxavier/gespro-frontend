/**
 * Oráculo E2E — issue #178: não havia recuperação de palavra-passe self-service.
 *
 * Contrato de UI (decisão do orquestrador; ADR-0029 — o ecrã é nosso, quem autentica é o Keycloak):
 *   - o ecrã de login (`/auth/login`), sem sessão, tem uma ligação para `/auth/recuperar`;
 *   - `/auth/recuperar` abre sem sessão (middleware não redirige), com um campo de e-mail
 *     (rótulo com «e-mail») e um botão de submissão;
 *   - submeter mostra uma confirmação numa região `role="status"` (anunciada a leitores de ecrã)
 *     cujo texto é EXACTAMENTE o mesmo para um endereço que existe e para um que não existe;
 *   - sem modais: nenhum `dialog` aberto no fluxo;
 *   - pedir a recuperação não tranca a conta: o Keycloak não ganha acções obrigatórias e a
 *     pessoa continua a entrar com a palavra-passe antiga enquanto não usar a ligação.
 *
 * A regra (pedido à Admin API com `["UPDATE_PASSWORD"]`, resposta neutra em todos os desfechos,
 * rate-limit por e-mail e por IP) é provada no oráculo unitário
 * `src/app/(auth)/auth/recuperar/__tests__/recuperar-palavra-passe-178.test.ts`; aqui só a porta
 * na UI, contra o Keycloak REAL.
 *
 * Dados (prefixo único `recuperar-palavra-passe-178`): pede-se a recuperação para
 * `operador@demo.mz` (existe) e para `recuperar-palavra-passe-178-<ts>@inexistente.mz` (não
 * existe). Nada é escrito em Postgres. Sem SMTP no perfil por omissão o Keycloak pode recusar o
 * envio — a resposta tem de ser a mesma na mesma, é parte do contrato.
 *
 * ESTADO ESPERADO antes da implementação: RED — o login não tem a ligação e `/auth/recuperar`
 * não existe.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/50-recuperar-palavra-passe-178.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó C:recuperar-palavra-passe-178; um agente de implementação que o
 * altere é BLOCKER.
 */

import { test, expect, type Page } from '@playwright/test';
import { KEYCLOAK_BASE, USERS, keycloakAdminToken, loginAs } from './helpers/auth';

const MARCA = 'recuperar-palavra-passe-178';
const EXISTENTE = USERS.operador;

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(90_000);

async function accoesObrigatorias(email: string): Promise<string[]> {
  const token = await keycloakAdminToken();
  const res = await fetch(
    `${KEYCLOAK_BASE}/admin/realms/gespro/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`procura no Keycloak falhou: HTTP ${res.status}`);
  const lista = (await res.json()) as { requiredActions?: string[] }[];
  if (!lista[0]) throw new Error(`${email} não existe no realm`);
  return lista[0].requiredActions ?? [];
}

async function pedirRecuperacao(page: Page, email: string): Promise<string> {
  await page.goto('/auth/recuperar');
  await expect(page).toHaveURL(/\/auth\/recuperar/);
  await page.waitForLoadState('networkidle');
  const campo = page.getByLabel(/e-?mail/i);
  await expect(campo).toBeVisible();
  await campo.fill(email);
  await page.locator('button[type=submit]').click();
  const estado = page.getByRole('status').filter({ hasText: /\S/ });
  await expect(estado.first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const texto = (await estado.first().innerText()).trim();
  // A confirmação não ecoa o endereço — senão já não seria a mesma para os dois.
  expect(texto.toLowerCase()).not.toContain(email.toLowerCase());
  return texto;
}

test.describe(`#178 — recuperação de palavra-passe (${MARCA})`, () => {
  test('o ecrã de login, sem sessão, liga para /auth/recuperar', async ({ page }) => {
    await page.goto('/auth/login');
    const ligacao = page.locator('a[href="/auth/recuperar"]');
    await expect(ligacao).toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    await ligacao.click();
    await expect(page).toHaveURL(/\/auth\/recuperar/);
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
  });

  test('a confirmação é a mesma para um endereço que existe e para um que não existe', async ({ page }) => {
    const antes = await accoesObrigatorias(EXISTENTE.email);

    const textoExiste = await pedirRecuperacao(page, EXISTENTE.email);
    const textoNaoExiste = await pedirRecuperacao(page, `${MARCA}-${Date.now()}@inexistente.mz`);

    expect(textoExiste.length).toBeGreaterThan(0);
    expect(textoNaoExiste).toBe(textoExiste);

    // Pedir a recuperação não tranca a conta: nenhuma acção obrigatória nova no realm.
    expect(await accoesObrigatorias(EXISTENTE.email)).toEqual(antes);
  });

  test('depois do pedido, a palavra-passe antiga continua a entrar', async ({ page }) => {
    await pedirRecuperacao(page, EXISTENTE.email);
    await page.context().clearCookies();
    await loginAs(page, EXISTENTE);
    await expect(page).not.toHaveURL(/\/auth\/(login|recuperar|mudar-palavra-passe)/);
  });
});
