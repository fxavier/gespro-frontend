/**
 * Oráculo E2E — issue #156: aprovar, rejeitar e cancelar pedidos de férias em /rh/ferias, e
 * iniciar um período aquisitivo.
 *
 * Contrato de UI (molde do #94 nas ausências; regras «sem modais» do CLAUDE.md):
 *   - um pedido PENDENTE tem, na sua linha da tabela, «Aprovar» e «Rejeitar»;
 *   - Aprovar pede confirmação num AlertDialog (role=alertdialog) e grava APROVADA;
 *   - Rejeitar leva a uma ROTA própria (URL com o id do pedido, nenhum dialog) com o campo
 *     «Motivo»; submeter grava REJEITADA e o motivoRejeicao;
 *   - «Cancelar» só aparece nos pedidos PENDENTES do PRÓPRIO utilizador (quem o submeteu):
 *     um pedido submetido pelo admin pela UI tem «Cancelar»; os pedidos inseridos aqui por SQL
 *     (sem solicitante) não têm — nem para o admin, que pode aprovar. Cancelar é destrutivo,
 *     logo confirma num AlertDialog; grava CANCELADA;
 *   - /rh/ferias tem uma acção para iniciar período aquisitivo que leva a uma rota própria
 *     (sem dialog).
 *
 * Dados (prefixo único `ferias-aprovar-156`): no tenant `demo`, um período aquisitivo de 2098
 * (31 dias) para o primeiro colaborador e dois pedidos PENDENTES inseridos por SQL (março e
 * abril de 2098); o terceiro (maio) é submetido pela UI. Datas como literais SQL de timestamp
 * (o `pg` lê `timestamp` no fuso local). Limpeza idempotente no beforeAll e no afterAll: o
 * período 2098 do demo com 31 dias e todos os pedidos dele.
 *
 * ESTADO ESPERADO antes da implementação: RED — os botões não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/47-ferias-aprovar-156.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó D:ferias-aprovar-156; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LISTA = `${BASE}/rh/ferias`;
const MARCA = 'ferias-aprovar-156';
// cuid-like: os schemas das férias validam o id com `.cuid()` (e o idEntidade aceita-o).
const cuid = () => `c${randomBytes(12).toString('hex')}`;
const ID_FERIAS = cuid();
const ID_MARCO = cuid();
const ID_ABRIL = cuid();
const MOTIVO = `Fecho de contas (${MARCA})`;

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

const FILTRO_PERIODO = `"tenantId" = $1
  AND "periodoAquisitivoInicio" = timestamp '2098-01-01 10:00:00'
  AND "periodoAquisitivoFim" = timestamp '2098-12-31 10:00:00'
  AND "diasDisponiveis" = 31`;

async function limpar(c: Client, tenantId: string): Promise<void> {
  await c.query(
    `DELETE FROM "SolicitacaoFerias" WHERE "feriasId" IN (SELECT id FROM "Ferias" WHERE ${FILTRO_PERIODO})`,
    [tenantId],
  );
  await c.query(`DELETE FROM "Ferias" WHERE ${FILTRO_PERIODO}`, [tenantId]);
}

async function estado(id: string): Promise<{ status: string; motivo: string | null } | null> {
  return withPg(async (c) => {
    const r = await c.query(`SELECT status, "motivoRejeicao" FROM "SolicitacaoFerias" WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row) return null;
    return { status: row.status, motivo: row.motivoRejeicao ?? null };
  });
}

async function estadoPorObservacao(obs: string): Promise<string | null> {
  return withPg(async (c) => {
    const r = await c.query(
      `SELECT status FROM "SolicitacaoFerias" WHERE "feriasId" = $1 AND observacoes = $2`,
      [ID_FERIAS, obs],
    );
    return r.rows[0]?.status ?? null;
  });
}

const linhaDe = (page: Page, dia: RegExp) => page.getByRole('row').filter({ hasText: dia });

test.describe(`/rh/ferias — aprovar, rejeitar, cancelar e iniciar período (#156, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);
      const col = await c.query<{ id: string }>(
        `SELECT id FROM "Colaborador" WHERE "tenantId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!col.rows[0]) throw new Error('STOP: o tenant demo não tem colaboradores (pnpm db:seed)');

      await c.query(
        `INSERT INTO "Ferias" (id, "tenantId", "colaboradorId", "periodoAquisitivoInicio",
           "periodoAquisitivoFim", "diasDisponiveis", "diasUsados", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, timestamp '2098-01-01 10:00:00', timestamp '2098-12-31 10:00:00',
           31, 0, now(), now())`,
        [ID_FERIAS, tenantId, col.rows[0].id],
      );

      for (const [id, inicio, fim] of [
        [ID_MARCO, '2098-03-10 10:00:00', '2098-03-11 10:00:00'],
        [ID_ABRIL, '2098-04-14 10:00:00', '2098-04-15 10:00:00'],
      ] as const) {
        await c.query(
          `INSERT INTO "SolicitacaoFerias" (id, "tenantId", "feriasId", "dataInicio", "dataFim",
             "diasSolicitados", tipo, status, observacoes, "dataSolicitacao", "updatedAt")
           VALUES ($1, $2, $3, timestamp '${inicio}', timestamp '${fim}',
             2, 'FRACIONADA', 'PENDENTE', $4, now(), now())`,
          [id, tenantId, ID_FERIAS, MARCA],
        );
      }
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('aprovar: AlertDialog de confirmação, estado APROVADA e o saldo desconta', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const linha = linhaDe(page, /10\/03\/2098|2098-03-10/);
    await expect(linha).toHaveCount(1);
    // Pedido sem solicitante (inserido por SQL): o admin aprova, mas não cancela o que não é seu.
    await expect(linha.getByRole('button', { name: /cancelar/i })).toHaveCount(0);
    await linha.getByRole('button', { name: /aprovar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /aprovar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(async () => (await estado(ID_MARCO))?.status).toBe('APROVADA');
    await expect
      .poll(() =>
        withPg(async (c) => (await c.query(`SELECT "diasUsados" FROM "Ferias" WHERE id = $1`, [ID_FERIAS])).rows[0]?.diasUsados),
      )
      .toBe(2);
    await expect(linha.getByRole('button', { name: /aprovar/i })).toHaveCount(0);
  });

  test('rejeitar: rota própria com motivo (sem dialog), estado REJEITADA e motivo gravado', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const linha = linhaDe(page, /14\/04\/2098|2098-04-14/);
    await expect(linha).toHaveCount(1);
    await linha
      .getByRole('link', { name: /rejeitar/i })
      .or(linha.getByRole('button', { name: /rejeitar/i }))
      .click();

    await page.waitForURL(new RegExp(`/rh/ferias/.*${ID_ABRIL}`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await page.getByLabel(/motivo/i).fill(MOTIVO);
    await page.getByRole('button', { name: /rejeitar/i }).click();

    await expect.poll(async () => await estado(ID_ABRIL)).toEqual({ status: 'REJEITADA', motivo: MOTIVO });
  });

  test('cancelar pelo próprio: o pedido submetido pelo admin tem «Cancelar», confirma em AlertDialog e fica CANCELADA', async ({ page }) => {
    const obs = `${MARCA}-cancelar`;

    // Submeter o pedido pela UI — é isto que faz do admin «o próprio».
    await page.goto(`${BASE}/rh/ferias/nova`);
    await page.waitForLoadState('networkidle');
    const caixa = page.getByRole('combobox').first();
    await caixa.click();
    await page.locator('[data-radix-popper-content-wrapper]').last().getByPlaceholder(/Pesquisar/).fill('01/01/2098');
    await page.getByRole('option', { name: /01\/01\/2098/ }).first().click();
    await page.locator('input[type="date"]').nth(0).fill('2098-05-10');
    await page.locator('input[type="date"]').nth(1).fill('2098-05-11');
    await page.locator('input[type="number"]').first().fill('2');
    await page.getByPlaceholder('Notas adicionais…').fill(obs);
    await page.getByRole('button', { name: /submeter/i }).click();
    await page.waitForURL(/\/rh\/ferias(\?|$)/);
    await expect.poll(() => estadoPorObservacao(obs)).toBe('PENDENTE');

    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');
    const linha = linhaDe(page, /10\/05\/2098|2098-05-10/);
    await expect(linha).toHaveCount(1);
    await linha.getByRole('button', { name: /cancelar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    // O botão que fecha sem fazer nada não conta; confirma-se no outro.
    await dialogo
      .getByRole('button')
      .filter({ hasNotText: /^\s*(cancelar|voltar|não|fechar)\s*$/i })
      .last()
      .click();
    await expect(dialogo).toBeHidden();

    await expect.poll(() => estadoPorObservacao(obs)).toBe('CANCELADA');
    await expect(linha.getByRole('button', { name: /cancelar/i })).toHaveCount(0);
  });

  test('iniciar período aquisitivo: acção na lista leva a uma rota própria, sem dialog', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('link', { name: /iniciar período|novo período|período aquisitivo/i })
      .or(page.getByRole('button', { name: /iniciar período|novo período|período aquisitivo/i }))
      .first()
      .click();

    await page.waitForURL((url) => url.pathname.startsWith('/rh/ferias/') && url.pathname !== '/rh/ferias/nova');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.locator('input[type="date"]')).toHaveCount(2);
  });
});
