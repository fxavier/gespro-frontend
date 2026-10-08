/**
 * Oráculo E2E — issue #179: «Desactivar» utilizador gravava `deletedAt` e era irreversível, contra o
 * texto da própria confirmação («Esta acção pode ser revertida posteriormente»).
 *
 * Contrato de UI (decisão do orquestrador; local da acção escolhido pelo verificador como o mais
 * conservador — o mesmo menu de linha onde já vive «Desactivar», sem rota nova):
 *   - na listagem `/core-tenancy/utilizadores`, o menu «Acções para <nome>» de um utilizador activo
 *     tem «Desactivar»; confirmar no AlertDialog passa o `User` a `ativo = false` com `deletedAt`
 *     a `null`, e desliga a identidade no Keycloak (`enabled = false`);
 *   - o texto da confirmação continua a dizer que a acção é reversível — e agora é verdade;
 *   - o utilizador desactivado CONTINUA na listagem (pesquisa pelo e-mail), com o estado «Inactivo»;
 *   - o menu «Acções para <nome>» de um utilizador inactivo tem «Reactivar» (menuitem ou botão; se
 *     pedir confirmação num AlertDialog, confirma-se); reactivar volta a `ativo = true`,
 *     `deletedAt` a `null` e `enabled = true` no Keycloak;
 *   - sem modais de recolha de dados: nenhum `dialog` (não-alert) aberto no fluxo.
 *
 * A regra (limite do plano do #98, travão do ADR-0031, Keycloak primeiro, âmbito do tenant,
 * eliminados continuam eliminados) é provada no oráculo de integração
 * `test/integration/utilizador-desactivar-179.test.ts`; aqui só a porta na UI.
 *
 * Dados (prefixo único `utilizador-desactivar-179`): no tenant `demo`, o `leitura@demo.mz` é
 * desactivado e reactivado. O afterAll repõe, aconteça o que acontecer, `ativo = true`,
 * `deletedAt = null` em Postgres E `enabled = true` no Keycloak (Admin API, conta de serviço do
 * ERP) — senão as outras specs que entram como `leitura@` caíam no login.
 * O tenant `demo` não tem `Assinatura` (ilimitado): o limite do plano não interfere.
 *
 * ESTADO ESPERADO antes da implementação: RED — desactivar grava `deletedAt`, o utilizador
 * desaparece da lista e não há «Reactivar».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/48-utilizador-desactivar-179.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó C:utilizador-desactivar-179; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';
import { KEYCLOAK_BASE, keycloakAdminToken } from './helpers/auth';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'utilizador-desactivar-179';
const EMAIL = 'leitura@demo.mz';

function dbUrl(): string {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // já carregado ou inexistente
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

type Linha = { id: string; nome: string; keycloakSub: string; ativo: boolean; eliminado: boolean };

async function lerUtilizador(): Promise<Linha> {
  return withPg(async (c) => {
    const r = await c.query<Linha>(
      `SELECT u.id, u.nome, u."keycloakSub", u.ativo, (u."deletedAt" IS NOT NULL) AS eliminado
         FROM "User" u JOIN "Tenant" t ON t.id = u."tenantId"
        WHERE t.slug = 'demo' AND u.email = $1
        LIMIT 1`,
      [EMAIL],
    );
    if (!r.rows[0]) throw new Error(`STOP: ${EMAIL} não existe no demo (pnpm db:seed)`);
    return r.rows[0];
  });
}

async function keycloakEnabled(sub: string): Promise<boolean> {
  const token = await keycloakAdminToken();
  const res = await fetch(`${KEYCLOAK_BASE}/admin/realms/gespro/users/${encodeURIComponent(sub)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`leitura do utilizador no Keycloak falhou: HTTP ${res.status}`);
  return ((await res.json()) as { enabled: boolean }).enabled;
}

async function keycloakDefinirEnabled(sub: string, enabled: boolean): Promise<void> {
  const token = await keycloakAdminToken();
  const res = await fetch(`${KEYCLOAK_BASE}/admin/realms/gespro/users/${encodeURIComponent(sub)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`reposição no Keycloak falhou: HTTP ${res.status}`);
}

const lista = () => `${BASE}/core-tenancy/utilizadores?search=${encodeURIComponent(EMAIL)}`;

async function abrirMenu(page: Page, nome: string): Promise<void> {
  await page.goto(lista());
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: `Acções para ${nome}` }).first().click();
}

test.describe(`/core-tenancy/utilizadores — desactivar é reversível (#179, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  let alvo: Linha;

  test.beforeAll(async () => {
    alvo = await lerUtilizador();
    if (!alvo.ativo || alvo.eliminado) {
      throw new Error(`STOP: ${EMAIL} não está activo — resíduo de uma corrida anterior; repor à mão`);
    }
    if (!(await keycloakEnabled(alvo.keycloakSub))) {
      throw new Error(`STOP: ${EMAIL} está desligado no Keycloak — resíduo de uma corrida anterior`);
    }
  });

  test.afterAll(async () => {
    if (!alvo) return;
    await withPg((c) =>
      c.query(`UPDATE "User" SET ativo = true, "deletedAt" = NULL WHERE id = $1`, [alvo.id]),
    );
    await keycloakDefinirEnabled(alvo.keycloakSub, true);
  });

  test('desactivar pelo menu da linha: ativo=false, deletedAt null, desligado no Keycloak', async ({ page }) => {
    await abrirMenu(page, alvo.nome);
    await page.getByRole('button', { name: /^desactivar/i }).first().click();

    const confirmacao = page.getByRole('alertdialog');
    await expect(confirmacao).toBeVisible();
    // A promessa do texto passa a ser verdadeira — e tem de continuar a ser feita.
    await expect(confirmacao).toContainText(/revert|reactiv/i);
    await confirmacao.getByRole('button', { name: /confirmar desactiva/i }).click();

    await expect
      .poll(async () => (await lerUtilizador()).ativo, { timeout: 15_000 })
      .toBe(false);
    const depois = await lerUtilizador();
    expect(depois.eliminado, 'desactivar gravou deletedAt — irreversível').toBe(false);
    expect(await keycloakEnabled(alvo.keycloakSub)).toBe(false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('o desactivado continua na listagem, como Inactivo', async ({ page }) => {
    await page.goto(lista());
    await page.waitForLoadState('networkidle');
    const linha = page.getByRole('row').filter({ hasText: EMAIL });
    await expect(linha, `${EMAIL} desapareceu da listagem depois de desactivado`).toHaveCount(1);
    await expect(linha).toContainText(/inactivo/i);
  });

  test('reactivar pelo menu da linha: ativo=true, deletedAt null, ligado no Keycloak', async ({ page }) => {
    await abrirMenu(page, alvo.nome);
    const accao = page
      .getByRole('menuitem', { name: /reactivar/i })
      .or(page.getByRole('button', { name: /reactivar/i }));
    await expect(accao.first(), 'sem acção «Reactivar» no menu do utilizador inactivo').toBeVisible();
    await accao.first().click();

    // Confirmação opcional (AlertDialog é a única excepção à regra sem modais).
    const confirmacao = page.getByRole('alertdialog');
    const pediuConfirmacao = await confirmacao
      .waitFor({ state: 'visible', timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (pediuConfirmacao) {
      await confirmacao.getByRole('button', { name: /reactivar|confirmar/i }).first().click();
    }

    await expect
      .poll(async () => (await lerUtilizador()).ativo, { timeout: 15_000 })
      .toBe(true);
    expect((await lerUtilizador()).eliminado).toBe(false);
    await expect.poll(() => keycloakEnabled(alvo.keycloakSub), { timeout: 15_000 }).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.goto(lista());
    await page.waitForLoadState('networkidle');
    const linha = page.getByRole('row').filter({ hasText: EMAIL });
    await expect(linha).toHaveCount(1);
    await expect(linha).not.toContainText(/inactivo/i);
  });
});
