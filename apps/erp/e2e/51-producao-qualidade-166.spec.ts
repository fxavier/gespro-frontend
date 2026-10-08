/**
 * Oráculo E2E — issue #166: `qualidadeAprovada` sem escritor; nenhuma ordem de produção conclui.
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais de recolha, sem permissões
 * novas, sem endpoints novos — as acções chamam `aprovarQualidadeOrdemAction` e
 * `reprovarQualidadeOrdemAction`):
 *
 *   Detalhe `/producao/ordens/<id>` (a lista já aponta para lá; hoje é 404) — Server Component que
 *   mostra o número da ordem e, quando a ordem está EM_PRODUCAO:
 *     - o botão «Aprovar qualidade», que abre um AlertDialog de confirmação (confirmar, não recolher
 *       dados: sem campos) com o botão «Aprovar»; confirmar grava `qualidadeAprovada = true` e a
 *       página continua no detalhe;
 *     - a ligação «Reprovar qualidade» para a rota própria `/producao/ordens/<id>/reprovar-qualidade`
 *       (recolher o motivo é formulário, logo é rota e não Dialog);
 *     - as observações da última avaliação de qualidade (o motivo da reprovação) ficam visíveis;
 *   numa ordem PLANEADA (ou noutro estado que não EM_PRODUCAO) nem o botão nem a ligação aparecem.
 *
 *   Rota `/producao/ordens/<id>/reprovar-qualidade`: um campo com nome acessível /motivo/ e o botão
 *   «Reprovar qualidade»; sem motivo não grava e não sai da rota; com motivo grava
 *   `qualidadeAprovada = false` e `qualidadeObservacoes` = motivo, a ordem continua EM_PRODUCAO e
 *   volta ao detalhe.
 *
 * As regras de servidor (estados permitidos, motivo obrigatório, permissões, isolamento, modo de
 * leitura, conclusão nos dois sentidos) são provadas em
 * `test/integration/producao-qualidade-166.test.ts`.
 *
 * Dados (prefixo único `producao-qualidade-166`), no tenant `demo`, por SQL: uma ordem EM_PRODUCAO
 * e uma PLANEADA de um produto existente do demo. Os números saem da série ORDEM_PRODUCAO do demo,
 * que fica avançada (nunca se inventa). Ficam no demo, como os dados do `47-…` a `50-…`.
 *
 * ESTADO ESPERADO antes da implementação: RED — `/producao/ordens/<id>` e a rota de reprovação não
 * existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/51-producao-qualidade-166.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:producao-qualidade-166; um agente de implementação que o altere
 * é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'producao-qualidade-166';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_OP_PROD = `copprod166${SUF}`;
const ID_OP_PLAN = `copplan166${SUF}`;
const MOTIVO = `Fissura no encosto ${MARCA} ${SUF}`;

const numeros: Record<string, string> = {};

const detalhe = (id: string) => `${BASE}/producao/ordens/${id}`;
const rotaReprovar = (id: string) => `/producao/ordens/${id}/reprovar-qualidade`;
const reDetalhe = (id: string) => new RegExp(`/producao/ordens/${id}$`);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

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

/** Ano civil de hoje em Africa/Maputo (a série é por ano fiscal). */
function anoMaputo(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
}

/** Próximo número da série ORDEM_PRODUCAO do demo — avança a série, como o serviço. */
async function proximoNumero(c: Client, tenantId: string): Promise<string> {
  const r = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = 'ORDEM_PRODUCAO' AND ativo = true AND ano = $2
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [tenantId, anoMaputo()],
  );
  const s = r.rows[0];
  if (!s) throw new Error('STOP: o demo não tem série ORDEM_PRODUCAO activa para o ano corrente');
  if (s.formatoNumero !== '{prefixo}/{ano}/{numero:06}') {
    throw new Error(`STOP: formato de série inesperado (${s.formatoNumero})`);
  }
  return `${s.prefixo}/${s.ano}/${String(s.numero).padStart(6, '0')}`;
}

type EstadoOrdem = { status: string; aprovada: boolean; observacoes: string | null };

async function estado(id: string): Promise<EstadoOrdem> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; aprovada: boolean; observacoes: string | null }>(
      `SELECT status::text, "qualidadeAprovada" AS aprovada, "qualidadeObservacoes" AS observacoes
         FROM "OrdemProducao" WHERE id = $1`,
      [id],
    );
    return r.rows[0];
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

test.describe(`Controlo de qualidade da ordem de produção (#166, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
      if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
      const tenantId = t.rows[0].id;
      const u = await c.query<{ id: string }>(
        `SELECT id FROM "User" WHERE "tenantId" = $1 AND email = 'admin@demo.mz' LIMIT 1`,
        [tenantId],
      );
      if (!u.rows[0]) throw new Error('STOP: admin@demo.mz não encontrado no demo');
      const p = await c.query<{ id: string; sku: string; nome: string }>(
        `SELECT id, sku, nome FROM "Produto" WHERE "tenantId" = $1 AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!p.rows[0]) throw new Error('STOP: o demo não tem produtos');
      const prod = p.rows[0];

      await c.query('BEGIN');
      try {
        for (const [id, status] of [
          [ID_OP_PROD, 'EM_PRODUCAO'],
          [ID_OP_PLAN, 'PLANEADA'],
        ] as const) {
          const numero = await proximoNumero(c, tenantId);
          numeros[id] = numero;
          await c.query(
            `INSERT INTO "OrdemProducao" (id, "tenantId", numero, "produtoId", "codigoProduto", "nomeProduto",
               quantidade, "unidadeMedida", status, prioridade, "dataPrevisaoInicio", "dataPrevisaoFim",
               "dataInicioReal", "criadoPorId", observacoes, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, 5, 'UN', $7::"StatusOrdemProducao", 'MEDIA', now(),
               now() + interval '10 days', $8, $9, $10, now(), now())`,
            [id, tenantId, numero, prod.id, prod.sku, prod.nome, status,
              status === 'EM_PRODUCAO' ? new Date() : null, u.rows[0].id, `Ordem do oráculo ${MARCA} ${SUF}`],
          );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('numa ordem PLANEADA não há «Aprovar qualidade» nem «Reprovar qualidade»', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_PLAN));
    await expect(page.getByText(numeros[ID_OP_PLAN]).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /aprovar qualidade/i })).toHaveCount(0);
    await expect(page.locator(`a[href="${rotaReprovar(ID_OP_PLAN)}"]`)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /reprovar qualidade/i })).toHaveCount(0);
  });

  test('reprovar sem motivo não grava; com motivo grava, mantém EM_PRODUCAO e volta ao detalhe', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_PROD));
    await expect(page.getByText(numeros[ID_OP_PROD]).first()).toBeVisible();
    const ligacao = page.locator(`a[href="${rotaReprovar(ID_OP_PROD)}"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/reprovar qualidade/i);

    await ligacao.click();
    await page.waitForURL(new RegExp(`${esc(rotaReprovar(ID_OP_PROD))}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Sem motivo: não grava e não sai da rota.
    await page.getByRole('button', { name: /reprovar qualidade/i }).click();
    await page.waitForTimeout(1_000);
    await expect(page).toHaveURL(new RegExp(`${esc(rotaReprovar(ID_OP_PROD))}$`));
    expect(await estado(ID_OP_PROD)).toEqual({ status: 'EM_PRODUCAO', aprovada: false, observacoes: null });

    // Com motivo: grava e volta ao detalhe.
    await page.getByRole('textbox', { name: /motivo/i }).fill(MOTIVO);
    await page.getByRole('button', { name: /reprovar qualidade/i }).click();
    await page.waitForURL(reDetalhe(ID_OP_PROD), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    expect(await estado(ID_OP_PROD)).toEqual({ status: 'EM_PRODUCAO', aprovada: false, observacoes: MOTIVO });
    await expect(page.getByText(MOTIVO).first()).toBeVisible();
  });

  test('«Aprovar qualidade» pede confirmação num AlertDialog sem campos e grava a aprovação', async ({ page }) => {
    await abrir(page, detalhe(ID_OP_PROD));
    await page.getByRole('button', { name: /aprovar qualidade/i }).click();

    const confirmar = page.getByRole('alertdialog');
    await expect(confirmar).toBeVisible();
    await expect(confirmar.getByRole('textbox')).toHaveCount(0);
    await confirmar.getByRole('button', { name: /^aprovar$/i }).click();
    await expect(confirmar).toHaveCount(0, { timeout: 15_000 });

    await expect.poll(async () => (await estado(ID_OP_PROD)).aprovada, { timeout: 15_000 }).toBe(true);
    expect((await estado(ID_OP_PROD)).status).toBe('EM_PRODUCAO');
    await expect(page).toHaveURL(reDetalhe(ID_OP_PROD));
  });
});
