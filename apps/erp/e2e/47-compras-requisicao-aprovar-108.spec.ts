/**
 * Oráculo E2E — issue #108: requisições de compra sem UI para aprovar/rejeitar nem configurar
 * circuitos de aprovação.
 *
 * Contrato de UI (decisão do orquestrador; sem modais):
 *   - no detalhe `/compras/requisicoes/<id>`, quando a requisição está EM_APROVACAO e o
 *     utilizador da sessão tem uma decisão PENDENTE no nível corrente, aparecem:
 *       · o botão «Aprovar…», que abre um AlertDialog de confirmação (role `alertdialog`) cujo
 *         botão de confirmação (nome com «aprova») aprova pela `decidirAprovacaoAction`;
 *       · a ligação «Rejeitar…» para a rota própria `/compras/requisicoes/<id>/rejeitar`, com um
 *         formulário (sem Dialog) cujo campo «Motivo» é obrigatório: submeter vazio não rejeita;
 *         com motivo, rejeita e volta ao detalhe, onde o motivo se lê no separador «Aprovações»;
 *   - quem não é aprovador pendente (outro utilizador no nível corrente) não vê nenhum dos dois;
 *   - ecrã de circuitos `/compras/configuracoes/circuitos-aprovacao`: lista os circuitos do
 *     tenant (activos e inactivos) com o nome e os aprovadores (email), e tem a ligação «Novo
 *     circuito» para `/compras/configuracoes/circuitos-aprovacao/novo` (rota, não Dialog).
 *
 * As regras de servidor (nível, motivo obrigatório, estados terminais, permissões, isolamento,
 * circuito activo único) são provadas em `test/integration/compras-requisicao-aprovar-108.test.ts`.
 *
 * Dados (prefixo único `compras-requisicao-aprovar-108`), no tenant `demo`, por SQL:
 *   - um circuito INACTIVO (não muda o comportamento do «Submeter» de mais ninguém), apagado no
 *     afterAll (níveis e aprovadores em cascata);
 *   - três requisições já EM_APROVACAO com a decisão de nível 1 PENDENTE (duas para o admin,
 *     uma para o gestor). O número sai da série REQUISICAO_COMPRA do demo, que fica avançada
 *     (nunca se inventa). As requisições ficam no demo, como as vendas de outros E2E.
 *
 * ESTADO ESPERADO antes da implementação: RED — não há botão Aprovar, nem rota /rejeitar, nem
 * ecrã de circuitos.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/47-compras-requisicao-aprovar-108.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:compras-requisicao-aprovar-108; um agente de implementação
 * que o altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'compras-requisicao-aprovar-108';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: o AprovarDocumentoSchema valida `documentoId` com `.cuid()`.
const ID_REQ_APROVAR = `creqaprov108${SUF}`;
const ID_REQ_REJEITAR = `creqrejei108${SUF}`;
const ID_REQ_OUTRO = `creqoutro108${SUF}`;
const ID_WF = `cwfcircuito108${SUF}`;
const ID_NIVEL = `cnivcircuito108${SUF}`;
const ID_APROVADOR = `capvcircuito108${SUF}`;
const NOME_CIRCUITO = `Circuito ${MARCA} ${SUF}`;

const detalhe = (id: string) => `${BASE}/compras/requisicoes/${id}`;

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

async function utilizador(c: Client, tenantId: string, email: string): Promise<{ id: string; email: string }> {
  const r = await c.query<{ id: string; email: string }>(
    `SELECT id, email FROM "User" WHERE "tenantId" = $1 AND email = $2 LIMIT 1`,
    [tenantId, email],
  );
  if (!r.rows[0]) throw new Error(`STOP: utilizador ${email} não existe no demo (pnpm db:seed)`);
  return r.rows[0];
}

/** Ano civil de hoje em Africa/Maputo (a série é por ano fiscal). */
function anoMaputo(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
}

/** Próximo número da série REQUISICAO_COMPRA do demo — avança a série, como o serviço. */
async function proximoNumero(c: Client, tenantId: string): Promise<string> {
  const r = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = 'REQUISICAO_COMPRA' AND ativo = true AND ano = $2
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [tenantId, anoMaputo()],
  );
  const s = r.rows[0];
  if (!s) throw new Error('STOP: o demo não tem série REQUISICAO_COMPRA activa para o ano corrente');
  if (s.formatoNumero !== '{prefixo}/{ano}/{numero:06}') {
    throw new Error(`STOP: formato de série inesperado (${s.formatoNumero})`);
  }
  return `${s.prefixo}/${s.ano}/${String(s.numero).padStart(6, '0')}`;
}

async function inserirRequisicaoEmAprovacao(
  c: Client,
  tenantId: string,
  id: string,
  solicitante: { id: string; email: string },
  aprovador: { id: string; email: string },
): Promise<void> {
  const numero = await proximoNumero(c, tenantId);
  await c.query(
    `INSERT INTO "RequisicaoCompra" (id, "tenantId", numero, data, "solicitanteId", "solicitanteNome", departamento,
       prioridade, status, justificativa, "valorTotal", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4, $5, 'Compras', 'MEDIA', 'EM_APROVACAO', $6, 2500.00, now(), now())`,
    [id, tenantId, numero, solicitante.id, solicitante.email, `Requisição do oráculo ${MARCA} ${SUF}`],
  );
  await c.query(
    `INSERT INTO "ItemRequisicao" (id, "tenantId", "requisicaoCompraId", descricao, quantidade, "unidadeMedida",
       "precoEstimado", subtotal, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Toner para impressora', 1, 'UN', 2500.00, 2500.00, now(), now())`,
    [`citem${id}`, tenantId, id],
  );
  await c.query(
    `INSERT INTO "AprovacaoCompra" (id, "tenantId", "requisicaoCompraId", nivel, "aprovadorId", "aprovadorNome",
       status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 1, $4, $5, 'PENDENTE', now(), now())`,
    [`caprov${id}`, tenantId, id, aprovador.id, aprovador.email],
  );
}

async function estado(id: string): Promise<{ status: string; decisoes: string[] }> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string }>(`SELECT status::text FROM "RequisicaoCompra" WHERE id = $1`, [id]);
    const a = await c.query<{ status: string; observacoes: string | null }>(
      `SELECT status::text, observacoes FROM "AprovacaoCompra" WHERE "requisicaoCompraId" = $1 ORDER BY nivel`,
      [id],
    );
    return { status: r.rows[0]?.status, decisoes: a.rows.map((x) => `${x.status}|${x.observacoes ?? ''}`) };
  });
}

async function limparCircuito(c: Client, tenantId: string): Promise<void> {
  await c.query(`DELETE FROM "ConfiguracaoWorkflow" WHERE "tenantId" = $1 AND nome LIKE $2`, [
    tenantId,
    `Circuito ${MARCA}%`,
  ]);
}

let adminEmail = '';

test.describe(`/compras/requisicoes — aprovar/rejeitar e circuitos (#108, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      await limparCircuito(c, tenantId);
      const admin = await utilizador(c, tenantId, 'admin@demo.mz');
      const gestor = await utilizador(c, tenantId, 'gestor@demo.mz');
      adminEmail = admin.email;

      await c.query('BEGIN');
      try {
        await inserirRequisicaoEmAprovacao(c, tenantId, ID_REQ_APROVAR, gestor, admin);
        await inserirRequisicaoEmAprovacao(c, tenantId, ID_REQ_REJEITAR, gestor, admin);
        await inserirRequisicaoEmAprovacao(c, tenantId, ID_REQ_OUTRO, admin, gestor);

        await c.query(
          `INSERT INTO "ConfiguracaoWorkflow" (id, "tenantId", nome, tipo, ativo, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'REQUISICAO_COMPRA', false, now(), now())`,
          [ID_WF, tenantId, NOME_CIRCUITO],
        );
        await c.query(
          `INSERT INTO "NivelAprovacao" (id, "tenantId", "configuracaoWorkflowId", nivel, nome, "valorMinimo",
             "valorMaximo", "tipoAprovacao", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 1, 'Direcção', 0, 1000000, 'QUALQUER_UM', now(), now())`,
          [ID_NIVEL, tenantId, ID_WF],
        );
        await c.query(
          `INSERT INTO "AprovadorNivel" (id, "tenantId", "nivelAprovacaoId", "usuarioId", email)
           VALUES ($1, $2, $3, $4, $5)`,
          [ID_APROVADOR, tenantId, ID_NIVEL, admin.id, admin.email],
        );
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test.afterAll(async () => {
    await withPg(async (c) => limparCircuito(c, await tenantDemo(c)));
  });

  test('aprovador pendente: «Aprovar» pede confirmação em AlertDialog e aprova a requisição', async ({ page }) => {
    await page.goto(detalhe(ID_REQ_APROVAR));
    await page.waitForLoadState('networkidle');

    const aprovar = page.getByRole('button', { name: /^aprovar/i });
    await expect(aprovar).toBeVisible();
    await aprovar.click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    // Só confirmação: nada aprovado antes de confirmar.
    expect((await estado(ID_REQ_APROVAR)).status).toBe('EM_APROVACAO');
    await dialogo.getByRole('button', { name: /aprova/i }).click();

    await expect.poll(async () => (await estado(ID_REQ_APROVAR)).status, { timeout: 15_000 }).toBe('APROVADA');
    expect((await estado(ID_REQ_APROVAR)).decisoes).toEqual(['APROVADO|']);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^aprovar/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^rejeitar/i })).toHaveCount(0);
  });

  test('aprovador pendente: «Rejeitar» é uma rota com motivo obrigatório e volta ao detalhe', async ({ page }) => {
    await page.goto(detalhe(ID_REQ_REJEITAR));
    await page.waitForLoadState('networkidle');

    const rejeitar = page.getByRole('link', { name: /^rejeitar/i });
    await expect(rejeitar).toBeVisible();
    await expect(rejeitar).toHaveAttribute('href', `/compras/requisicoes/${ID_REQ_REJEITAR}/rejeitar`);
    await rejeitar.click();

    await page.waitForURL(new RegExp(`/compras/requisicoes/${ID_REQ_REJEITAR}/rejeitar$`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // Sem motivo: não rejeita e fica na rota.
    const submeter = page.getByRole('button', { name: /^rejeitar/i });
    await submeter.click();
    await expect(page).toHaveURL(new RegExp(`/compras/requisicoes/${ID_REQ_REJEITAR}/rejeitar$`));
    expect((await estado(ID_REQ_REJEITAR)).status).toBe('EM_APROVACAO');

    const motivo = `Fornecedor não homologado ${SUF}`;
    await page.getByLabel(/motivo/i).fill(motivo);
    await submeter.click();

    await page.waitForURL(new RegExp(`/compras/requisicoes/${ID_REQ_REJEITAR}$`), { timeout: 15_000 });
    await expect.poll(async () => (await estado(ID_REQ_REJEITAR)).status, { timeout: 15_000 }).toBe('REJEITADA');
    expect((await estado(ID_REQ_REJEITAR)).decisoes).toEqual([`REJEITADO|${motivo}`]);

    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /aprovações/i }).click();
    await expect(page.getByText(motivo)).toBeVisible();
  });

  test('quem não é o aprovador pendente não vê «Aprovar» nem «Rejeitar»', async ({ page }) => {
    await page.goto(detalhe(ID_REQ_OUTRO));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /requisição/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^aprovar/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^rejeitar/i })).toHaveCount(0);
    expect((await estado(ID_REQ_OUTRO)).status).toBe('EM_APROVACAO');
  });

  test('ecrã de circuitos lista o circuito (com aprovadores) e «Novo circuito» é uma rota', async ({ page }) => {
    await page.goto(`${BASE}/compras/configuracoes/circuitos-aprovacao`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /circuitos de aprovação/i }).first()).toBeVisible();
    await expect(page.getByText(NOME_CIRCUITO)).toBeVisible();
    await expect(page.getByText(adminEmail).first()).toBeVisible();

    const novo = page.getByRole('link', { name: /novo circuito/i });
    await expect(novo).toBeVisible();
    await expect(novo).toHaveAttribute('href', '/compras/configuracoes/circuitos-aprovacao/novo');
    await novo.click();
    await page.waitForURL(/\/compras\/configuracoes\/circuitos-aprovacao\/novo$/);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('form')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
