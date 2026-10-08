/**
 * Oráculo E2E — issue #109: cotações RFQ sem UI para enviar, registar respostas, adjudicar ou
 * cancelar (e o detalhe `/compras/cotacoes/[id]`, ligado pela lista mas inexistente — #114).
 *
 * Contrato de UI (decisão do orquestrador; sem modais, permissões existentes):
 *   - a linha da lista `/compras/cotacoes` leva ao detalhe `/compras/cotacoes/<id>`, que mostra
 *     o número da cotação e o NOME de cada fornecedor convidado (não o id);
 *   - RASCUNHO: botão «Enviar…» (se pedir confirmação, é um AlertDialog) → ENVIADA;
 *   - ENVIADA/RESPONDIDA: em cada fornecedor convidado, a ligação «Registar resposta» para a rota
 *     própria `/compras/cotacoes/<id>/resposta?fornecedorId=<fornecedorId>` — formulário (sem
 *     Dialog) com «Preço unitário» por item e «Prazo» de entrega; submeter sem preço não grava;
 *     com preço grava, volta ao detalhe e a cotação fica RESPONDIDA;
 *   - RESPONDIDA: ligação «Adjudicar» para `/compras/cotacoes/<id>/adjudicar` (não aparece em
 *     ENVIADA, sem respostas); o formulário oferece, como `radio` com o nome do fornecedor, SÓ os
 *     fornecedores que responderam; adjudicar volta ao detalhe com a cotação ADJUDICADA;
 *   - RASCUNHO/ENVIADA/RESPONDIDA: botão «Cancelar cotação» que abre um AlertDialog (role
 *     `alertdialog`); só ao confirmar a cotação fica CANCELADA;
 *   - ADJUDICADA e CANCELADA: nenhuma das acções aparece.
 *
 * As regras de servidor (Σ subtotais, só respondentes adjudicam, item de outra cotação, sem
 * convidados não envia, estados terminais, permissões, isolamento) são provadas em
 * `test/integration/compras-cotacao-rfq-109.test.ts`.
 *
 * Dados (prefixo único `compras-cotacao-rfq-109`), no tenant `demo`, por SQL: dois fornecedores
 * e três cotações (uma em RASCUNHO, duas ENVIADAS), cada uma com os dois fornecedores
 * convidados e um item. O número sai da série COTACAO_RFQ do demo, que fica avançada (nunca se
 * inventa). Ficam no demo, como as requisições do `47-…-108`.
 *
 * ESTADO ESPERADO antes da implementação: RED — `/compras/cotacoes/<id>` não existe (404).
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/48-compras-cotacao-rfq-109.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:compras-cotacao-rfq-109; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'compras-cotacao-rfq-109';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam `cotacaoId`/`fornecedorId` com `.cuid()`.
const ID_F1 = `cforna109${SUF}`;
const ID_F2 = `cfornb109${SUF}`;
const NOME_F1 = `Fornecedor RFQ A ${SUF}`;
const NOME_F2 = `Fornecedor RFQ B ${SUF}`;
const ID_COT_ENVIAR = `ccotenv109${SUF}`;
const ID_COT_RESPONDER = `ccotres109${SUF}`;
const ID_COT_CANCELAR = `ccotcan109${SUF}`;

const numeros: Record<string, string> = {};

const detalhe = (id: string) => `${BASE}/compras/cotacoes/${id}`;
const reDetalhe = (id: string) => new RegExp(`/compras/cotacoes/${id}$`);

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

/** Ano civil de hoje em Africa/Maputo (a série é por ano fiscal). */
function anoMaputo(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
}

/** Próximo número da série COTACAO_RFQ do demo — avança a série, como o serviço. */
async function proximoNumero(c: Client, tenantId: string): Promise<string> {
  const r = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = 'COTACAO_RFQ' AND ativo = true AND ano = $2
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [tenantId, anoMaputo()],
  );
  const s = r.rows[0];
  if (!s) throw new Error('STOP: o demo não tem série COTACAO_RFQ activa para o ano corrente');
  if (s.formatoNumero !== '{prefixo}/{ano}/{numero:06}') {
    throw new Error(`STOP: formato de série inesperado (${s.formatoNumero})`);
  }
  return `${s.prefixo}/${s.ano}/${String(s.numero).padStart(6, '0')}`;
}

async function inserirFornecedor(c: Client, tenantId: string, id: string, nome: string, nuit: string): Promise<void> {
  await c.query(
    `INSERT INTO "Fornecedor" (id, "tenantId", codigo, nome, tipo, nuit, email, "formasPagamento", tags,
       "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'PESSOA_JURIDICA', $5, $6, ARRAY[]::text[], ARRAY[]::text[], now(), now())`,
    [id, tenantId, `FOR-${MARCA}-${id}`, nome, nuit, `${id}@test.mz`],
  );
}

async function inserirCotacao(
  c: Client,
  tenantId: string,
  id: string,
  status: 'RASCUNHO' | 'ENVIADA',
): Promise<void> {
  const numero = await proximoNumero(c, tenantId);
  numeros[id] = numero;
  await c.query(
    `INSERT INTO "Cotacao" (id, "tenantId", numero, data, status, "dataValidade", observacoes, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4::"StatusCotacao", now() + interval '30 days', $5, now(), now())`,
    [id, tenantId, numero, status, `Cotação do oráculo ${MARCA} ${SUF}`],
  );
  await c.query(
    `INSERT INTO "ItemCotacao" (id, "tenantId", "cotacaoId", descricao, quantidade, "unidadeMedida", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Toner para impressora', 3, 'UN', now(), now())`,
    [`citem${id}`, tenantId, id],
  );
  for (const [fid, rot] of [[ID_F1, 'a'], [ID_F2, 'b']] as const) {
    await c.query(
      `INSERT INTO "CotacaoFornecedor" (id, "tenantId", "cotacaoId", "fornecedorId", "dataEnvio", status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, now(), 'PENDENTE', now(), now())`,
      [`ccf${rot}${id}`, tenantId, id, fid],
    );
  }
}

interface Estado {
  status: string;
  vencedor: string | null;
  convites: Record<string, string>;
  precos: string[];
}

async function estado(id: string): Promise<Estado> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; vencedor: string | null }>(
      `SELECT status::text, "vencedorFornecedorId" AS vencedor FROM "Cotacao" WHERE id = $1`,
      [id],
    );
    const cf = await c.query<{ fornecedorId: string; status: string }>(
      `SELECT "fornecedorId", status::text FROM "CotacaoFornecedor" WHERE "cotacaoId" = $1`,
      [id],
    );
    const p = await c.query<{ preco: string }>(
      `SELECT r."precoUnitario"::text AS preco FROM "RespostaItemCotacao" r
         JOIN "CotacaoFornecedor" f ON f.id = r."cotacaoFornecedorId" WHERE f."cotacaoId" = $1`,
      [id],
    );
    return {
      status: r.rows[0]?.status,
      vencedor: r.rows[0]?.vencedor ?? null,
      convites: Object.fromEntries(cf.rows.map((x) => [x.fornecedorId, x.status])),
      precos: p.rows.map((x) => x.preco),
    };
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** Nenhuma acção de ciclo de vida visível (estado terminal). */
async function semAccoes(page: Page, id: string): Promise<void> {
  await expect(page.getByRole('button', { name: /^enviar/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /cancelar cotação/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /registar resposta/i })).toHaveCount(0);
  await expect(page.locator(`a[href^="/compras/cotacoes/${id}/resposta"]`)).toHaveCount(0);
  await expect(page.locator(`a[href="/compras/cotacoes/${id}/adjudicar"]`)).toHaveCount(0);
}

test.describe(`/compras/cotacoes — enviar, responder, adjudicar, cancelar (#109, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      const base = Number(String(Date.now()).slice(-8));
      await c.query('BEGIN');
      try {
        await inserirFornecedor(c, tenantId, ID_F1, NOME_F1, `5${String(base).padStart(8, '0')}`);
        await inserirFornecedor(c, tenantId, ID_F2, NOME_F2, `6${String(base).padStart(8, '0')}`);
        await inserirCotacao(c, tenantId, ID_COT_ENVIAR, 'RASCUNHO');
        await inserirCotacao(c, tenantId, ID_COT_RESPONDER, 'ENVIADA');
        await inserirCotacao(c, tenantId, ID_COT_CANCELAR, 'ENVIADA');
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('a lista leva ao detalhe; em RASCUNHO, «Enviar» passa a cotação a ENVIADA', async ({ page }) => {
    await abrir(page, `${BASE}/compras/cotacoes`);
    await page.getByText(numeros[ID_COT_ENVIAR], { exact: true }).first().click();
    await page.waitForURL(reDetalhe(ID_COT_ENVIAR), { timeout: 15_000 });

    await abrir(page, detalhe(ID_COT_ENVIAR));
    await expect(page.getByText(numeros[ID_COT_ENVIAR]).first()).toBeVisible();
    await expect(page.getByText(NOME_F1).first()).toBeVisible();
    await expect(page.getByText(NOME_F2).first()).toBeVisible();

    // Em RASCUNHO ainda não há respostas a registar nem adjudicação.
    await expect(page.locator(`a[href^="/compras/cotacoes/${ID_COT_ENVIAR}/resposta"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="/compras/cotacoes/${ID_COT_ENVIAR}/adjudicar"]`)).toHaveCount(0);

    const enviar = page.getByRole('button', { name: /^enviar/i });
    await expect(enviar).toBeVisible();
    await enviar.click();
    const dialogo = page.getByRole('alertdialog');
    if (await dialogo.isVisible().catch(() => false)) {
      await dialogo.getByRole('button', { name: /enviar|confirmar/i }).click();
    }
    await expect.poll(async () => (await estado(ID_COT_ENVIAR)).status, { timeout: 15_000 }).toBe('ENVIADA');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^enviar/i })).toHaveCount(0);
    await expect(page.locator(`a[href="/compras/cotacoes/${ID_COT_ENVIAR}/resposta?fornecedorId=${ID_F1}"]`)).toBeVisible();
  });

  test('«Registar resposta» é uma rota por fornecedor, exige preço e deixa a cotação RESPONDIDA', async ({ page }) => {
    await abrir(page, detalhe(ID_COT_RESPONDER));
    // ENVIADA sem respostas: ainda não se adjudica.
    await expect(page.locator(`a[href="/compras/cotacoes/${ID_COT_RESPONDER}/adjudicar"]`)).toHaveCount(0);

    const href = `/compras/cotacoes/${ID_COT_RESPONDER}/resposta?fornecedorId=${ID_F1}`;
    const ligacao = page.locator(`a[href="${href}"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/registar resposta/i);
    await ligacao.click();

    await page.waitForURL(new RegExp(`/compras/cotacoes/${ID_COT_RESPONDER}/resposta\\?fornecedorId=${ID_F1}$`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(NOME_F1).first()).toBeVisible();

    for (const prazo of await page.getByLabel(/prazo/i).all()) {
      await prazo.fill('7');
    }

    // Sem preço: não grava e fica na rota.
    const submeter = page.getByRole('button', { name: /^registar resposta/i });
    await submeter.click();
    await expect(page).toHaveURL(new RegExp(`/compras/cotacoes/${ID_COT_RESPONDER}/resposta`));
    expect((await estado(ID_COT_RESPONDER)).status).toBe('ENVIADA');

    await page.getByLabel(/preço unitário/i).first().fill('250');
    await submeter.click();

    await page.waitForURL(reDetalhe(ID_COT_RESPONDER), { timeout: 15_000 });
    await expect.poll(async () => (await estado(ID_COT_RESPONDER)).status, { timeout: 15_000 }).toBe('RESPONDIDA');
    const e = await estado(ID_COT_RESPONDER);
    expect(e.convites).toEqual({ [ID_F1]: 'RESPONDIDA', [ID_F2]: 'PENDENTE' });
    expect(e.precos.map(Number)).toEqual([250]);
  });

  test('«Adjudicar» é uma rota que só oferece quem respondeu e deixa a cotação ADJUDICADA', async ({ page }) => {
    await abrir(page, detalhe(ID_COT_RESPONDER));
    const ligacao = page.locator(`a[href="/compras/cotacoes/${ID_COT_RESPONDER}/adjudicar"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/adjudicar/i);
    await ligacao.click();

    await page.waitForURL(new RegExp(`/compras/cotacoes/${ID_COT_RESPONDER}/adjudicar$`));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await expect(page.getByRole('radio', { name: new RegExp(NOME_F2) })).toHaveCount(0);
    const vencedor = page.getByRole('radio', { name: new RegExp(NOME_F1) });
    await expect(vencedor).toBeVisible();
    expect((await estado(ID_COT_RESPONDER)).status).toBe('RESPONDIDA');
    await vencedor.check();
    await page.getByRole('button', { name: /^adjudicar/i }).click();

    await page.waitForURL(reDetalhe(ID_COT_RESPONDER), { timeout: 15_000 });
    await expect.poll(async () => (await estado(ID_COT_RESPONDER)).status, { timeout: 15_000 }).toBe('ADJUDICADA');
    expect((await estado(ID_COT_RESPONDER)).vencedor).toBe(ID_F1);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await semAccoes(page, ID_COT_RESPONDER);
  });

  test('«Cancelar cotação» pede confirmação em AlertDialog e só então cancela', async ({ page }) => {
    await abrir(page, detalhe(ID_COT_CANCELAR));
    const cancelar = page.getByRole('button', { name: /cancelar cotação/i });
    await expect(cancelar).toBeVisible();
    await cancelar.click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    // Só confirmação: nada cancelado antes de confirmar.
    expect((await estado(ID_COT_CANCELAR)).status).toBe('ENVIADA');
    await dialogo.getByRole('button', { name: /cancelar cotação|confirmar/i }).click();

    await expect.poll(async () => (await estado(ID_COT_CANCELAR)).status, { timeout: 15_000 }).toBe('CANCELADA');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await semAccoes(page, ID_COT_CANCELAR);
  });
});
