/**
 * Oráculo E2E — issue #465: desactivar e reactivar uma conta bancária pela UI.
 *
 * Contrato de UI (regras «sem modais» do CLAUDE.md):
 *   - em /contabilidade/contas-bancarias/[id]/editar, uma conta activa tem o botão «Desactivar»
 *     e uma inactiva o botão «Reactivar»;
 *   - cada um pede confirmação num AlertDialog (role=alertdialog); confirmar grava `ativo`;
 *   - ao desactivar uma conta configurada num meio de pagamento do POS, o AlertDialog avisa
 *     (texto com «POS»), mas NÃO bloqueia: a desactivação grava e a configuração do meio fica;
 *     uma conta sem meio POS não leva esse aviso.
 *
 * Dados (prefixo único `conta-bancaria-desactivar-465`): no tenant `demo`, duas contas
 * bancárias inseridas por SQL na conta PGC 122 — uma carteira móvel configurada como conta do
 * meio EMOLA do POS e uma conta corrente sem meio. A configuração EMOLA que existisse antes é
 * guardada e reposta no afterAll; as contas de teste são apagadas no beforeAll e no afterAll.
 *
 * ESTADO ESPERADO antes da implementação: RED — os botões não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/55-conta-bancaria-desactivar-465.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:conta-bancaria-desactivar-465; um agente de implementação
 * que o altere é BLOCKER.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'conta-bancaria-desactivar-465';
// Forma cuid (`c` + alfanuméricos): o id real de ContaBancaria é cuid, e um schema com
// `.cuid()` ou `idEntidade()` aceita-o.
const novoId = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
const ID_CARTEIRA = novoId(); // CARTEIRA_MOVEL, configurada no meio EMOLA do POS
const ID_CORRENTE = novoId(); // CORRENTE, sem meio POS

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

// Configuração EMOLA anterior ao teste (para repor).
let emolaAnterior: { id: string; contaBancariaId: string } | null = null;

async function limpar(c: Client, tenantId: string): Promise<void> {
  await c.query(
    `DELETE FROM "ContaMeioPagamentoPOS" m
     WHERE m."tenantId" = $1
       AND m."contaBancariaId" IN (
         SELECT id FROM "ContaBancaria" WHERE "tenantId" = $1 AND "numeroConta" LIKE $2
       )`,
    [tenantId, `${MARCA}%`],
  );
  await c.query(`DELETE FROM "ContaBancaria" WHERE "tenantId" = $1 AND "numeroConta" LIKE $2`, [
    tenantId,
    `${MARCA}%`,
  ]);
}

async function ativo(id: string): Promise<boolean | null> {
  return withPg(async (c) => {
    const r = await c.query<{ ativo: boolean }>(`SELECT ativo FROM "ContaBancaria" WHERE id = $1`, [id]);
    return r.rows[0]?.ativo ?? null;
  });
}

async function abrirEditar(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/contabilidade/contas-bancarias/${id}/editar`);
  await page.waitForLoadState('networkidle');
}

test.describe(`/contabilidade/contas-bancarias — desactivar e reactivar (#465, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limpar(c, tenantId);

      const pgc = await c.query<{ id: string }>(
        `SELECT id FROM "ContaPGC" WHERE "tenantId" = $1 AND codigo = '122' LIMIT 1`,
        [tenantId],
      );
      if (!pgc.rows[0]) throw new Error('STOP: o tenant demo não tem a conta PGC 122 (pnpm db:seed)');
      const contaContabilId = pgc.rows[0].id;

      for (const [id, banco, tipo] of [
        [ID_CARTEIRA, 'E2E e-Mola 465', 'CARTEIRA_MOVEL'],
        [ID_CORRENTE, 'E2E Banco 465', 'CORRENTE'],
      ] as const) {
        await c.query(
          `INSERT INTO "ContaBancaria" (id, "tenantId", banco, agencia, "numeroConta", "tipoConta",
             "contaContabilId", ativo, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, '0001', $4, $5, $6, true, now(), now())`,
          [id, tenantId, banco, `${MARCA}-${id.slice(-6)}`, tipo, contaContabilId],
        );
      }

      const ant = await c.query<{ id: string; contaBancariaId: string }>(
        `SELECT id, "contaBancariaId" FROM "ContaMeioPagamentoPOS" WHERE "tenantId" = $1 AND metodo = 'EMOLA'`,
        [tenantId],
      );
      emolaAnterior = ant.rows[0] ?? null;
      if (emolaAnterior) {
        await c.query(`UPDATE "ContaMeioPagamentoPOS" SET "contaBancariaId" = $1, "updatedAt" = now() WHERE id = $2`, [
          ID_CARTEIRA,
          emolaAnterior.id,
        ]);
      } else {
        await c.query(
          `INSERT INTO "ContaMeioPagamentoPOS" (id, "tenantId", metodo, "contaBancariaId", "createdAt", "updatedAt")
           VALUES ($1, $2, 'EMOLA', $3, now(), now())`,
          [`${MARCA}-${randomUUID()}`, tenantId, ID_CARTEIRA],
        );
      }
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      if (emolaAnterior) {
        await c.query(`UPDATE "ContaMeioPagamentoPOS" SET "contaBancariaId" = $1, "updatedAt" = now() WHERE id = $2`, [
          emolaAnterior.contaBancariaId,
          emolaAnterior.id,
        ]);
      }
      await limpar(c, tenantId);
    });
  });

  test('conta sem meio POS: Desactivar → AlertDialog sem aviso de POS → inactiva; Reactivar → AlertDialog → activa', async ({
    page,
  }) => {
    await abrirEditar(page, ID_CORRENTE);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^desactivar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/POS/)).toHaveCount(0);
    await dialogo.getByRole('button', { name: /desactivar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(() => ativo(ID_CORRENTE)).toBe(false);
    await expect(page.getByRole('button', { name: /^reactivar/i })).toBeVisible();

    await page.getByRole('button', { name: /^reactivar/i }).click();
    const dialogo2 = page.getByRole('alertdialog');
    await expect(dialogo2).toBeVisible();
    await dialogo2.getByRole('button', { name: /reactivar|confirmar/i }).click();
    await expect(dialogo2).toBeHidden();

    await expect.poll(() => ativo(ID_CORRENTE)).toBe(true);
    await expect(page.getByRole('button', { name: /^desactivar/i })).toBeVisible();
  });

  test('cancelar o AlertDialog não desactiva', async ({ page }) => {
    await abrirEditar(page, ID_CORRENTE);
    await page.getByRole('button', { name: /^desactivar/i }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: /cancelar/i }).click();
    await expect(dialogo).toBeHidden();
    // Dá tempo a uma escrita indevida antes de afirmar.
    await page.waitForTimeout(500);
    expect(await ativo(ID_CORRENTE)).toBe(true);
  });

  test('conta configurada num meio do POS: o AlertDialog avisa, mas desactiva e a configuração do meio fica', async ({
    page,
  }) => {
    await abrirEditar(page, ID_CARTEIRA);
    await page.getByRole('button', { name: /^desactivar/i }).click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/POS/).first()).toBeVisible();
    await dialogo.getByRole('button', { name: /desactivar|confirmar/i }).click();
    await expect(dialogo).toBeHidden();

    await expect.poll(() => ativo(ID_CARTEIRA)).toBe(false);
    const meio = await withPg(async (c) =>
      c.query(`SELECT 1 FROM "ContaMeioPagamentoPOS" WHERE metodo = 'EMOLA' AND "contaBancariaId" = $1`, [ID_CARTEIRA]),
    );
    expect(meio.rowCount, 'a configuração do meio EMOLA mantém-se').toBe(1);

    // O ecrã dos meios POS assinala a conta inactiva (comportamento já existente).
    await page.goto(`${BASE}/contabilidade/configuracoes/meios-pagamento-pos`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/inactiva/i).first()).toBeVisible();

    // Reactivar repõe.
    await abrirEditar(page, ID_CARTEIRA);
    await page.getByRole('button', { name: /^reactivar/i }).click();
    const dialogo2 = page.getByRole('alertdialog');
    await expect(dialogo2).toBeVisible();
    await dialogo2.getByRole('button', { name: /reactivar|confirmar/i }).click();
    await expect(dialogo2).toBeHidden();
    await expect.poll(() => ativo(ID_CARTEIRA)).toBe(true);
  });
});
