/**
 * Oráculo E2E — issue #94: aprovar e rejeitar ausências a partir de /rh/ausencias.
 *
 * Contrato de UI (molde das férias; regras «sem modais» do CLAUDE.md):
 *   - uma ausência PENDENTE tem, na sua linha da tabela, «Aprovar» e «Rejeitar»;
 *   - Aprovar pede confirmação num AlertDialog (role=alertdialog) e grava APROVADA;
 *   - Rejeitar leva a uma ROTA própria (URL com o id da ausência, nenhum dialog) com o
 *     campo «Motivo»; submeter grava REJEITADA e o motivoRejeicao;
 *   - se já existir a folha salarial do mês da ausência, a UI avisa que a folha tem de ser
 *     recalculada (texto com «recalcul…», no dialog de confirmação ou depois de aprovar).
 *
 * Dados (prefixo único `ausencias-aprovar-94`): no tenant `demo`, duas ausências FALTA em
 * 2098 inseridas por SQL (março — com folha de 03/2098 criada aqui — e abril, sem folha).
 * Datas sempre como literais SQL de timestamp (o `pg` lê `timestamp` no fuso local).
 * Limpeza idempotente no beforeAll e no afterAll: ausências do demo com observação
 * `ausencias-aprovar-94` e a folha 03/2098 (sem payrolls).
 *
 * ESTADO ESPERADO antes da implementação: RED — os botões não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/42-ausencias-aprovar-94.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó D:ausencias-aprovar-94; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LISTA = `${BASE}/rh/ausencias`;
const MARCA = 'ausencias-aprovar-94';
// uuid: o schema das actions valida o id com idEntidade() (cuid ou uuid).
const ID_MARCO = randomUUID();
const ID_ABRIL = randomUUID();
const MOTIVO = `Sem justificativo (${MARCA})`;

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
  await c.query(`DELETE FROM "Ausencia" WHERE "tenantId" = $1 AND "observacoes" = $2`, [tenantId, MARCA]);
  await c.query(
    `DELETE FROM "FolhaPagamento" f
     WHERE f."tenantId" = $1 AND f."anoReferencia" = 2098 AND f."mesReferencia" = 3
       AND f."observacoes" = $2
       AND NOT EXISTS (SELECT 1 FROM "Payroll" p WHERE p."folhaId" = f.id)`,
    [tenantId, MARCA],
  );
}

async function estado(id: string): Promise<{ status: string; motivo: string | null } | null> {
  return withPg(async (c) => {
    const r = await c.query(`SELECT * FROM "Ausencia" WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row) return null;
    return { status: row.status, motivo: row.motivoRejeicao ?? null };
  });
}

test.describe(`/rh/ausencias — aprovar e rejeitar (#94, ${MARCA})`, () => {
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
      const colaboradorId = col.rows[0].id;

      for (const [id, inicio, fim] of [
        [ID_MARCO, '2098-03-10 10:00:00', '2098-03-10 10:00:00'],
        [ID_ABRIL, '2098-04-14 10:00:00', '2098-04-14 10:00:00'],
      ] as const) {
        await c.query(
          `INSERT INTO "Ausencia" (id, "tenantId", "colaboradorId", tipo, "dataInicio", "dataFim",
             "diasAusencia", justificada, status, observacoes, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'FALTA', timestamp '${inicio}', timestamp '${fim}',
             1, false, 'PENDENTE', $4, now(), now())`,
          [id, tenantId, colaboradorId, MARCA],
        );
      }

      // A folha de 03/2098 já existe (sem payrolls): aprovar a falta de março exige recalcular.
      await c.query(
        `INSERT INTO "FolhaPagamento" (id, "tenantId", "mesReferencia", "anoReferencia", status,
           observacoes, "createdAt", "updatedAt")
         VALUES ($1, $2, 3, 2098, 'PENDENTE', $3, now(), now())
         ON CONFLICT DO NOTHING`,
        [`${MARCA}-folha-${Date.now()}`, tenantId, MARCA],
      );
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limpar(c, await tenantDemo(c)));
  });

  test('aprovar: AlertDialog de confirmação, aviso de folha a recalcular, estado APROVADA', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const linha = page.getByRole('row').filter({ hasText: /10\/03\/2098|2098-03-10/ });
    await expect(linha).toHaveCount(1);
    await linha.getByRole('button', { name: /aprovar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    const avisoNoDialogo = await dialogo.getByText(/recalcul/i).count();

    await dialogo.getByRole('button', { name: /aprovar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    if (avisoNoDialogo === 0) {
      // O aviso pode vir depois (toast/banner), mas tem de vir.
      await expect(page.getByText(/recalcul/i).first()).toBeVisible();
    }

    await expect.poll(async () => (await estado(ID_MARCO))?.status).toBe('APROVADA');
    await expect(linha.getByRole('button', { name: /aprovar/i })).toHaveCount(0);
  });

  test('rejeitar: rota própria com motivo (sem dialog), estado REJEITADA e motivo gravado', async ({ page }) => {
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const linha = page.getByRole('row').filter({ hasText: /14\/04\/2098|2098-04-14/ });
    await expect(linha).toHaveCount(1);
    await linha
      .getByRole('link', { name: /rejeitar/i })
      .or(linha.getByRole('button', { name: /rejeitar/i }))
      .click();

    await page.waitForURL(new RegExp(`/rh/ausencias/.*${ID_ABRIL}`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await page.getByLabel(/motivo/i).fill(MOTIVO);
    await page.getByRole('button', { name: /rejeitar/i }).click();

    await expect.poll(async () => await estado(ID_ABRIL)).toEqual({ status: 'REJEITADA', motivo: MOTIVO });
  });
});
