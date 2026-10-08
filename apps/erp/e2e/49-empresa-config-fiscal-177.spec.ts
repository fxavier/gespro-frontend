/**
 * Oráculo E2E — issue #177: dados da empresa e configuração fiscal sem ecrã.
 *
 * Contrato de UI (decisão do orquestrador; rota escolhida pelo verificador — a primeira do
 * contrato, ao lado da Subscrição):
 *   - `/definicoes/empresa` é uma rota dedicada (sem modal) com um formulário pré-preenchido com
 *     os dados do tenant da sessão: «Nome», «NUIT», «Regime de IVA» e a morada («Endereço»,
 *     «Cidade», «Província», «Código postal»), mais contactos;
 *   - o hub `/core-tenancy` tem uma ligação para `/definicoes/empresa`;
 *   - «Guardar» grava (o valor novo fica na base e aparece depois de recarregar);
 *   - um NUIT inválido mostra o erro junto do campo e não grava nada;
 *   - sem `core_tenancy:configurar` (GESTOR) a rota mostra «Sem permissão» e não o formulário.
 *
 * A regra (âmbito do tenant, NUIT duplicado, auditoria singular, PDF) é provada no oráculo de
 * integração `test/integration/empresa-config-fiscal-177.test.ts`; aqui só a porta na UI.
 *
 * Dados (prefixo único `empresa-config-fiscal-177`): mexe no `endereco`/`cidade` do tenant `demo`.
 * O afterAll repõe, aconteça o que acontecer, nome, NUIT e a configuração fiscal lidos no beforeAll
 * — o PDF de todas as outras specs sai com estes dados.
 *
 * ESTADO ESPERADO antes da implementação: RED — a rota não existe (404) e o hub não tem a ligação.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/49-empresa-config-fiscal-177.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó C:empresa-config-fiscal-177; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';
import { Client } from 'pg';
import { loginAs, USERS } from './helpers/auth';

const MARCA = 'empresa-config-fiscal-177';
const ROTA = '/definicoes/empresa';

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

type Estado = {
  id: string;
  nome: string;
  nuit: string;
  regimeIva: string | null;
  endereco: string | null;
  cidade: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  email: string | null;
  telefone: string | null;
};

async function lerEstado(): Promise<Estado> {
  return withPg(async (c) => {
    const r = await c.query<Estado>(
      `SELECT t.id, t.nome, t.nuit, cf."regimeIva"::text AS "regimeIva", cf.endereco, cf.cidade,
              cf.provincia, cf."codigoPostal", cf.email, cf.telefone
         FROM "Tenant" t LEFT JOIN "ConfiguracaoFiscal" cf ON cf."tenantId" = t.id
        WHERE t.slug = 'demo'
        LIMIT 1`,
    );
    if (!r.rows[0]) throw new Error('STOP: tenant demo não existe (pnpm db:seed)');
    return r.rows[0];
  });
}

async function repor(e: Estado): Promise<void> {
  await withPg(async (c) => {
    await c.query(`UPDATE "Tenant" SET nome = $2, nuit = $3 WHERE id = $1`, [e.id, e.nome, e.nuit]);
    await c.query(
      `UPDATE "ConfiguracaoFiscal"
          SET "regimeIva" = COALESCE($2::"RegimeIva", "regimeIva"), endereco = $3, cidade = $4,
              provincia = $5, "codigoPostal" = $6, email = $7, telefone = $8
        WHERE "tenantId" = $1`,
      [e.id, e.regimeIva, e.endereco, e.cidade, e.provincia, e.codigoPostal, e.email, e.telefone],
    );
  });
}

function principal(page: Page): Locator {
  return page.locator('#main-content');
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
}

async function abrir(page: Page): Promise<void> {
  await page.goto(ROTA);
  await aguardar(page);
}

const campo = (page: Page, rotulo: RegExp): Locator => principal(page).getByLabel(rotulo).first();

test.describe(`${ROTA} — dados da empresa e configuração fiscal (#177, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  let original: Estado;

  test.beforeAll(async () => {
    original = await lerEstado();
  });

  test.afterAll(async () => {
    if (original) await repor(original);
  });

  test('o hub /core-tenancy liga para a rota', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/core-tenancy');
    await aguardar(page);
    await expect(principal(page).locator(`a[href="${ROTA}"]`).first()).toBeVisible({ timeout: 30_000 });
  });

  test('o formulário abre pré-preenchido com os dados do tenant da sessão, sem modal', async ({ page }) => {
    test.setTimeout(120_000);
    await abrir(page);
    await expect(principal(page).getByText('Sem permissão')).toHaveCount(0);
    await expect(campo(page, /^nome/i)).toHaveValue(original.nome, { timeout: 30_000 });
    await expect(campo(page, /^nuit/i)).toHaveValue(original.nuit);
    await expect(campo(page, /regime/i)).toBeVisible();
    await expect(campo(page, /endere[cç]o|morada/i)).toBeVisible();
    await expect(campo(page, /cidade/i)).toBeVisible();
    await expect(campo(page, /prov[ií]ncia/i)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('«Guardar» grava a morada nova; recarregar mostra-a', async ({ page }) => {
    test.setTimeout(120_000);
    const endereco = `Rua ${MARCA} ${Date.now()}`;
    const cidade = `Cidade ${MARCA}`;
    await abrir(page);
    await campo(page, /endere[cç]o|morada/i).fill(endereco);
    await campo(page, /cidade/i).fill(cidade);
    await principal(page).getByRole('button', { name: /guardar/i }).click();

    await expect
      .poll(async () => (await lerEstado()).endereco, { timeout: 15_000, message: 'endereço na base' })
      .toBe(endereco);
    const depois = await lerEstado();
    expect(depois.cidade).toBe(cidade);
    expect(depois.nuit, 'o NUIT não mudou sem ser pedido').toBe(original.nuit);
    expect(depois.nome).toBe(original.nome);

    await abrir(page);
    await expect(campo(page, /endere[cç]o|morada/i)).toHaveValue(endereco, { timeout: 30_000 });
    await expect(campo(page, /cidade/i)).toHaveValue(cidade);
  });

  test('NUIT inválido mostra o erro e não grava nada', async ({ page }) => {
    test.setTimeout(120_000);
    const antes = await lerEstado();
    await abrir(page);
    await campo(page, /^nuit/i).fill('111111111');
    await campo(page, /endere[cç]o|morada/i).fill(`Não gravar ${MARCA}`);
    await principal(page).getByRole('button', { name: /guardar/i }).click();

    await expect(principal(page).getByText(/NUIT inv[aá]lido/i).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_000);
    const depois = await lerEstado();
    expect(depois.nuit).toBe(antes.nuit);
    expect(depois.endereco).toBe(antes.endereco);
  });
});

test.describe(`${ROTA} — sem core_tenancy:configurar (#177, ${MARCA})`, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('GESTOR vê «Sem permissão» e não o formulário', async ({ page }) => {
    test.setTimeout(180_000); // login real + compilação fria
    await loginAs(page, USERS.gestor);
    await abrir(page);
    await expect(principal(page).getByText('Sem permissão').first()).toBeVisible({ timeout: 30_000 });
    await expect(principal(page).getByLabel(/^nuit/i)).toHaveCount(0);
    await expect(principal(page).getByRole('button', { name: /guardar/i })).toHaveCount(0);
  });
});
