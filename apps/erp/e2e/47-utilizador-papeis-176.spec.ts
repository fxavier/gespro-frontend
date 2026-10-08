/**
 * Oráculo E2E — issue #176: sem ecrã para mudar os papéis de um utilizador existente.
 *
 * Contrato de UI (decisão do orquestrador; rota escolhida pelo verificador como a opção mais
 * conservadora — a página de edição que já existe, sem rota nova):
 *   - `/core-tenancy/utilizadores/<id>/editar` mostra TODOS os papéis do tenant como caixas de
 *     selecção (`role=checkbox`) cujo nome acessível começa pelo nome do papel, marcadas as que o
 *     utilizador tem — deixa de ser a lista só de leitura «Papéis Actuais»;
 *   - guardar (botão «Guardar papéis» se existir um próprio, senão «Guardar Alterações») chama a
 *     action `atribuirRoles` e a lista nova fica gravada — o detalhe mostra o papel novo;
 *   - retirar o ADMIN ao último administrador é recusado pelo serviço (`ULTIMO_ADMIN`) e o ecrã
 *     MOSTRA a recusa (texto «último administrador»), sem nada gravado — nunca um silêncio;
 *   - sem modais (regra da casa): nenhum `dialog` aberto no fluxo.
 *
 * A regra (último ADMIN, delegação do #181, inactivos não contam, action → ActionResult) é provada
 * no oráculo de integração `test/integration/utilizador-papeis-176.test.ts`; aqui só a porta na UI.
 *
 * Dados (prefixo único `utilizador-papeis-176`): no tenant `demo`, o utilizador `leitura@demo.mz`
 * ganha o papel OPERADOR e perde-o de novo; os papéis originais são guardados no beforeAll e
 * repostos por SQL no afterAll, aconteça o que acontecer. O caso do último ADMIN usa o
 * `admin@demo.mz` e não grava nada (salta se o demo tiver mais de um ADMIN activo).
 *
 * ESTADO ESPERADO antes da implementação: RED — a página de edição não tem caixas de papéis.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/47-utilizador-papeis-176.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó C:utilizador-papeis-176; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'utilizador-papeis-176';

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

async function tenantDemo(c: Client): Promise<string> {
  const r = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
  if (!r.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  return r.rows[0].id;
}

async function userId(c: Client, tenantId: string, email: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `SELECT id FROM "User" WHERE "tenantId" = $1 AND email = $2 AND "deletedAt" IS NULL LIMIT 1`,
    [tenantId, email],
  );
  if (!r.rows[0]) throw new Error(`STOP: ${email} não existe no demo (pnpm db:seed)`);
  return r.rows[0].id;
}

async function papeisDe(c: Client, uid: string): Promise<string[]> {
  const r = await c.query<{ nome: string }>(
    `SELECT r.nome FROM "UserRole" ur JOIN "Role" r ON r.id = ur."roleId" WHERE ur."userId" = $1 ORDER BY r.nome`,
    [uid],
  );
  return r.rows.map((x) => x.nome);
}

const editar = (id: string) => `${BASE}/core-tenancy/utilizadores/${id}/editar`;
const detalhe = (id: string) => `${BASE}/core-tenancy/utilizadores/${id}`;

const PAPEIS_SISTEMA = ['ADMIN', 'GESTOR', 'FINANCEIRO', 'OPERADOR', 'LEITURA'];

/**
 * Caixa do papel: o nome acessível é exactamente o nome do papel ou começa por ele (o rótulo pode
 * levar a descrição). Exacto primeiro, para que «ADMIN» não apanhe um «ADMIN AUDITORIA» de outro teste.
 */
const caixaPapel = (page: Page, nome: string): Locator => {
  const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page
    .getByRole('checkbox', { name: nome, exact: true })
    .or(page.getByRole('checkbox', { name: new RegExp(`^${esc}(?:\\s*[—–:-]|\\s+[A-Za-zÀ-ú]?[a-zà-ú])`) }));
};

async function guardar(page: Page): Promise<void> {
  const proprio = page.getByRole('button', { name: /guardar papéis/i });
  if ((await proprio.count()) > 0) {
    await proprio.first().click();
  } else {
    await page.getByRole('button', { name: /guardar alterações/i }).click();
  }
}

test.describe(`/core-tenancy/utilizadores/[id]/editar — papéis (#176, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  let tenantId = '';
  let leituraId = '';
  let adminId = '';
  let papeisOriginaisLeitura: string[] = []; // roleIds
  let papeisOriginaisAdmin: string[] = []; // roleIds — rede de segurança se o travão falhar
  let adminsActivos = 0;

  test.beforeAll(async () => {
    await withPg(async (c) => {
      tenantId = await tenantDemo(c);
      leituraId = await userId(c, tenantId, 'leitura@demo.mz');
      adminId = await userId(c, tenantId, 'admin@demo.mz');
      papeisOriginaisLeitura = (
        await c.query<{ roleId: string }>(`SELECT "roleId" FROM "UserRole" WHERE "userId" = $1`, [leituraId])
      ).rows.map((r) => r.roleId);
      papeisOriginaisAdmin = (
        await c.query<{ roleId: string }>(`SELECT "roleId" FROM "UserRole" WHERE "userId" = $1`, [adminId])
      ).rows.map((r) => r.roleId);
      const operador = await c.query(`SELECT 1 FROM "Role" WHERE "tenantId" = $1 AND nome = 'OPERADOR'`, [tenantId]);
      if (!operador.rowCount) throw new Error('STOP: papel OPERADOR não existe no demo');
      if ((await papeisDe(c, leituraId)).includes('OPERADOR')) {
        throw new Error('STOP: leitura@ já tem OPERADOR — resíduo de uma corrida anterior; repor à mão');
      }
      adminsActivos = Number(
        (
          await c.query<{ n: string }>(
            `SELECT count(DISTINCT u.id) AS n FROM "User" u
               JOIN "UserRole" ur ON ur."userId" = u.id JOIN "Role" r ON r.id = ur."roleId"
              WHERE u."tenantId" = $1 AND u.ativo AND u."deletedAt" IS NULL AND r.nome = 'ADMIN' AND r."tenantId" = $1`,
            [tenantId],
          )
        ).rows[0].n,
      );
    });
  });

  test.afterAll(async () => {
    if (!leituraId || !adminId) return;
    await withPg(async (c) => {
      for (const [uid, originais] of [
        [leituraId, papeisOriginaisLeitura],
        [adminId, papeisOriginaisAdmin],
      ] as const) {
        if (originais.length === 0) continue;
        await c.query(`DELETE FROM "UserRole" WHERE "userId" = $1`, [uid]);
        for (const roleId of originais) {
          await c.query(`INSERT INTO "UserRole" ("userId", "roleId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
            uid,
            roleId,
          ]);
        }
      }
    });
  });

  test('a edição lista os papéis do tenant como caixas, marcadas as que o utilizador tem', async ({ page }) => {
    await page.goto(editar(leituraId));
    await page.waitForLoadState('networkidle');

    // Os cinco papéis de sistema do demo; papéis criados por outros testes podem ter nomes ambíguos.
    const nomes = PAPEIS_SISTEMA;
    const actuais = await withPg((c) => papeisDe(c, leituraId));
    for (const nome of nomes) {
      const caixa = caixaPapel(page, nome);
      await expect(caixa, `sem caixa para o papel ${nome}`).toHaveCount(1);
      if (actuais.includes(nome)) await expect(caixa).toBeChecked();
      else await expect(caixa).not.toBeChecked();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('acrescentar OPERADOR e guardar grava a lista nova; retirar e guardar repõe', async ({ page }) => {
    await page.goto(editar(leituraId));
    await page.waitForLoadState('networkidle');
    await caixaPapel(page, 'OPERADOR').click();
    await expect(caixaPapel(page, 'OPERADOR')).toBeChecked();
    await guardar(page);

    await expect
      .poll(() => withPg((c) => papeisDe(c, leituraId)), { timeout: 15_000 })
      .toContain('OPERADOR');

    await page.goto(detalhe(leituraId));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: 'OPERADOR', exact: true })).toBeVisible();

    await page.goto(editar(leituraId));
    await page.waitForLoadState('networkidle');
    await expect(caixaPapel(page, 'OPERADOR')).toBeChecked();
    await caixaPapel(page, 'OPERADOR').click();
    await guardar(page);
    await expect
      .poll(() => withPg((c) => papeisDe(c, leituraId)), { timeout: 15_000 })
      .not.toContain('OPERADOR');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('retirar o ADMIN ao último administrador mostra a recusa e não grava nada', async ({ page }) => {
    test.skip(adminsActivos !== 1, `o demo tem ${adminsActivos} ADMIN activos — o caso exige exactamente um`);
    const antes = await withPg((c) => papeisDe(c, adminId));
    expect(antes).toContain('ADMIN');

    await page.goto(editar(adminId));
    await page.waitForLoadState('networkidle');
    await expect(caixaPapel(page, 'ADMIN')).toBeChecked();
    await caixaPapel(page, 'ADMIN').click();
    // O AssignRoleSchema exige pelo menos um papel: fica com LEITURA no lugar do ADMIN.
    if (!(await caixaPapel(page, 'LEITURA').isChecked())) await caixaPapel(page, 'LEITURA').click();
    await guardar(page);

    await expect(page.getByText(/último administrador/i).first()).toBeVisible({ timeout: 15_000 });
    expect(await withPg((c) => papeisDe(c, adminId))).toEqual(antes);
  });
});
