/**
 * Oráculo E2E — issue #162: «Editar» benefício dá 404; sem suspender/terminar atribuições.
 *
 * Contrato de UI (regras «sem modais» do CLAUDE.md):
 *   - o botão «Editar» do detalhe /rh/beneficios/[id] leva a /rh/beneficios/[id]/editar, uma rota
 *     dedicada (não 404) com o formulário pré-preenchido; gravar actualiza o benefício e volta ao
 *     detalhe, que mostra o nome novo;
 *   - no detalhe, cada atribuição ACTIVA tem «Suspender» e «Terminar»; uma SUSPENSA continua no
 *     detalhe com «Reactivar» e «Terminar»;
 *   - cada acção pede confirmação num AlertDialog (role=alertdialog); cancelar não grava nada;
 *   - terminar grava TERMINADO com data de fim. Decisão conservadora: o AlertDialog só confirma
 *     (não recolhe dados — regra da casa); a data de fim omitida é a do dia (omissão do serviço).
 *     Depois de terminada, a atribuição já não oferece «Suspender»/«Reactivar»/«Terminar».
 *
 * Dados (prefixo único `beneficios-editar-162`): no tenant `demo`, um benefício e uma atribuição
 * a um colaborador activo do seed, inseridos por SQL; apagados no beforeAll e no afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — /editar dá 404 e os botões não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/58-beneficios-editar-162.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:beneficios-editar-162; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'beneficios-editar-162';
// Forma cuid (`c` + alfanuméricos): os ids reais são cuid e os schemas das actions usam `.cuid()`.
const novoId = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const ID_BENEFICIO = novoId();
const ID_ATRIBUICAO = novoId();
const NOME_ORIGINAL = `${MARCA} Seguro original`;
const NOME_EDITADO = `${MARCA} Seguro editado`;

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

async function limpar(c: Client, tenantId: string): Promise<void> {
  await c.query(
    `DELETE FROM "BeneficioColaborador" bc
     WHERE bc."tenantId" = $1
       AND bc."beneficioId" IN (SELECT id FROM "Beneficio" WHERE "tenantId" = $1 AND nome LIKE $2)`,
    [tenantId, `${MARCA}%`],
  );
  await c.query(`DELETE FROM "Beneficio" WHERE "tenantId" = $1 AND nome LIKE $2`, [tenantId, `${MARCA}%`]);
}

async function atribuicao(): Promise<{ status: string; temFim: boolean } | null> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; temFim: boolean }>(
      `SELECT status::text AS status, ("dataFim" IS NOT NULL) AS "temFim" FROM "BeneficioColaborador" WHERE id = $1`,
      [ID_ATRIBUICAO],
    );
    return r.rows[0] ?? null;
  });
}

async function nomeBeneficio(): Promise<string | null> {
  return withPg(async (c) => {
    const r = await c.query<{ nome: string }>(`SELECT nome FROM "Beneficio" WHERE id = $1`, [ID_BENEFICIO]);
    return r.rows[0]?.nome ?? null;
  });
}

async function abrirDetalhe(page: Page): Promise<void> {
  await page.goto(`${BASE}/rh/beneficios/${ID_BENEFICIO}`);
  await page.waitForLoadState('networkidle');
}

async function confirmar(page: Page, accao: RegExp): Promise<void> {
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: accao }).click();
  await expect(dialogo).toBeHidden();
}

test.describe(`/rh/beneficios — editar e suspender/terminar atribuições (#162, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);

      const col = await c.query<{ id: string }>(
        `SELECT id FROM "Colaborador" WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND status = 'ACTIVO'
         ORDER BY codigo LIMIT 1`,
        [tenantId],
      );
      if (!col.rows[0]) throw new Error('STOP: o tenant demo não tem colaboradores activos (pnpm db:seed)');

      await c.query(
        `INSERT INTO "Beneficio" (id, "tenantId", nome, tipo, descricao, fornecedor, "custoTotal",
           "comparticipacaoEmpresa", "descontoColaborador", periodicidade, tributavel, ativo,
           "departamentosElegiveis", "cargosElegiveis", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'SEGURO_SAUDE', 'Criado pelo E2E 162', 'Seguradora E2E', 5000, 1000, 200,
           'MENSAL', true, true, '{}', '{}', now(), now())`,
        [ID_BENEFICIO, tenantId, NOME_ORIGINAL],
      );
      await c.query(
        `INSERT INTO "BeneficioColaborador" (id, "tenantId", "beneficioId", "colaboradorId", "dataInicio",
           "dataFim", "comparticipacaoEmpresa", "descontoColaborador", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, timestamp '2026-01-15 12:00:00', NULL, 1000, 200, 'ACTIVO', now(), now())`,
        [ID_ATRIBUICAO, tenantId, ID_BENEFICIO, col.rows[0].id],
      );
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('«Editar» abre a rota de edição pré-preenchida; gravar actualiza e volta ao detalhe', async ({ page }) => {
    await abrirDetalhe(page);
    await page.getByRole('link', { name: /^editar/i }).click();
    await page.waitForURL(new RegExp(`/rh/beneficios/${ID_BENEFICIO}/editar$`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/404|página não encontrada|could not be found/i)).toHaveCount(0);

    const nome = page.getByLabel(/^nome/i);
    await expect(nome).toHaveValue(NOME_ORIGINAL);
    await nome.fill(NOME_EDITADO);
    await page.getByRole('button', { name: /guardar|gravar|salvar|actualizar/i }).click();

    await page.waitForURL(new RegExp(`/rh/beneficios/${ID_BENEFICIO}$`));
    await expect.poll(() => nomeBeneficio()).toBe(NOME_EDITADO);
    await expect(page.getByRole('heading', { name: NOME_EDITADO })).toBeVisible();
  });

  test('cancelar o AlertDialog de «Suspender» não grava nada', async ({ page }) => {
    await abrirDetalhe(page);
    await page.getByRole('button', { name: /^suspender/i }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialogo).toBeHidden();
    await page.waitForTimeout(500);
    expect((await atribuicao())?.status).toBe('ACTIVO');
  });

  test('Suspender → AlertDialog → SUSPENSO, e a suspensa continua no detalhe com «Reactivar»', async ({ page }) => {
    await abrirDetalhe(page);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^suspender/i }).click();
    await confirmar(page, /suspender|confirmar/i);

    await expect.poll(async () => (await atribuicao())?.status).toBe('SUSPENSO');
    await abrirDetalhe(page);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^terminar/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^suspender/i })).toHaveCount(0);
  });

  test('Reactivar → AlertDialog → ACTIVO', async ({ page }) => {
    await abrirDetalhe(page);
    await page.getByRole('button', { name: /^reactivar/i }).click();
    await confirmar(page, /reactivar|confirmar/i);
    await expect.poll(async () => (await atribuicao())?.status).toBe('ACTIVO');
  });

  test('Terminar → AlertDialog → TERMINADO com data de fim; deixa de oferecer acções', async ({ page }) => {
    await abrirDetalhe(page);
    await page.getByRole('button', { name: /^terminar/i }).click();
    await confirmar(page, /terminar|confirmar/i);

    await expect.poll(async () => (await atribuicao())?.status).toBe('TERMINADO');
    expect((await atribuicao())?.temFim, 'terminada sem data de fim').toBe(true);

    await abrirDetalhe(page);
    for (const accao of [/^suspender/i, /^reactivar/i, /^terminar/i]) {
      await expect(page.getByRole('button', { name: accao })).toHaveCount(0);
    }
  });
});
