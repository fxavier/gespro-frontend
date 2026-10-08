/**
 * Oráculo E2E — issue #110: pedidos de compra sem converter requisição, enviar, confirmar ou
 * cancelar (o detalhe `/compras/pedidos/[id]`, ligado pela lista, não existe).
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais, permissões existentes):
 *   - requisição APROVADA, no detalhe `/compras/requisicoes/<id>`: ligação «Converter em pedido»
 *     para a rota própria `/compras/requisicoes/<id>/converter` (escolher a cotação é recolher
 *     dados, logo é rota e não Dialog). Requisição noutro estado: a ligação não aparece;
 *   - a rota de conversão oferece, como `radio` com o NÚMERO da cotação, as cotações ADJUDICADAS
 *     desta requisição — nunca a de outra requisição; converter leva ao detalhe do pedido criado
 *     (`/compras/pedidos/<novo id>`) e a requisição fica CONVERTIDA;
 *   - a linha da lista `/compras/pedidos` leva ao detalhe `/compras/pedidos/<id>`, que mostra o
 *     número do pedido e o NOME do fornecedor;
 *   - RASCUNHO: botão «Enviar pedido» → ENVIADO; ENVIADO: botão «Confirmar pedido» → CONFIRMADO;
 *     CONFIRMADO: botão «Marcar em trânsito» → EM_TRANSITO. Se algum pedir confirmação, é um
 *     AlertDialog (role `alertdialog`) — nunca um Dialog;
 *   - RASCUNHO/ENVIADO/CONFIRMADO: ligação «Cancelar pedido» para a rota própria
 *     `/compras/pedidos/<id>/cancelar` (o motivo é obrigatório — campo de texto é formulário, logo
 *     é rota); submeter sem motivo não cancela; com motivo volta ao detalhe e o pedido fica
 *     CANCELADO com o motivo nas observações;
 *   - EM_TRANSITO e CANCELADO: nenhuma das acções acima aparece.
 *
 * As regras de servidor (série, conversão dupla/concorrente, cotação de outra requisição,
 * transições fora de ordem, recepção só em trânsito, permissões, isolamento) são provadas em
 * `test/integration/compras-pedido-110.test.ts`.
 *
 * Dados (prefixo único `compras-pedido-110`), no tenant `demo`, por SQL: um fornecedor, três
 * requisições (A e B APROVADAS, R em RASCUNHO), uma cotação ADJUDICADA ligada a A e outra a B, e
 * dois pedidos (um em RASCUNHO, um ENVIADO). Os números saem das séries REQUISICAO_COMPRA,
 * COTACAO_RFQ e PEDIDO_COMPRA do demo, que ficam avançadas (nunca se inventa). Ficam no demo,
 * como os dados do `47-…-108` e do `48-…-109`.
 *
 * ESTADO ESPERADO antes da implementação: RED — `/compras/pedidos/<id>` e
 * `/compras/requisicoes/<id>/converter` não existem (404) e não há «Converter em pedido».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/49-compras-pedido-110.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:compras-pedido-110; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'compras-pedido-110';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_FORN = `cforn110${SUF}`;
const NOME_FORN = `Fornecedor PC ${SUF}`;
const ID_REQ_A = `creqa110${SUF}`;
const ID_REQ_B = `creqb110${SUF}`;
const ID_REQ_RASCUNHO = `creqr110${SUF}`;
const ID_COT_A = `ccota110${SUF}`;
const ID_COT_B = `ccotb110${SUF}`;
const ID_PC_CICLO = `cpcci110${SUF}`;
const ID_PC_CANCELAR = `cpcca110${SUF}`;

type TipoSerie = 'REQUISICAO_COMPRA' | 'COTACAO_RFQ' | 'PEDIDO_COMPRA';
const numeros: Record<string, string> = {};

const detalhePedido = (id: string) => `${BASE}/compras/pedidos/${id}`;
const reDetalhePedido = (id: string) => new RegExp(`/compras/pedidos/${id}$`);

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

async function adminDemo(c: Client, tenantId: string): Promise<{ id: string; email: string }> {
  const r = await c.query<{ id: string; email: string }>(
    `SELECT id, email FROM "User" WHERE "tenantId" = $1 AND email = 'admin@demo.mz' LIMIT 1`,
    [tenantId],
  );
  if (!r.rows[0]) throw new Error('STOP: admin@demo.mz não encontrado no demo');
  return r.rows[0];
}

/** Ano civil de hoje em Africa/Maputo (a série é por ano fiscal). */
function anoMaputo(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
}

/** Próximo número da série do demo — avança a série, como o serviço. */
async function proximoNumero(c: Client, tenantId: string, tipo: TipoSerie): Promise<string> {
  const r = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = $2 AND ativo = true AND ano = $3
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [tenantId, tipo, anoMaputo()],
  );
  const s = r.rows[0];
  if (!s) throw new Error(`STOP: o demo não tem série ${tipo} activa para o ano corrente`);
  if (s.formatoNumero !== '{prefixo}/{ano}/{numero:06}') {
    throw new Error(`STOP: formato de série inesperado (${s.formatoNumero})`);
  }
  return `${s.prefixo}/${s.ano}/${String(s.numero).padStart(6, '0')}`;
}

async function inserirFornecedor(c: Client, tenantId: string, nuit: string): Promise<void> {
  await c.query(
    `INSERT INTO "Fornecedor" (id, "tenantId", codigo, nome, tipo, nuit, email, "formasPagamento", tags,
       "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'PESSOA_JURIDICA', $5, $6, ARRAY[]::text[], ARRAY[]::text[], now(), now())`,
    [ID_FORN, tenantId, `FOR-${MARCA}-${ID_FORN}`, NOME_FORN, nuit, `${ID_FORN}@test.mz`],
  );
}

async function inserirRequisicao(
  c: Client,
  tenantId: string,
  id: string,
  status: 'APROVADA' | 'RASCUNHO',
  solicitante: { id: string; email: string },
): Promise<void> {
  const numero = await proximoNumero(c, tenantId, 'REQUISICAO_COMPRA');
  numeros[id] = numero;
  await c.query(
    `INSERT INTO "RequisicaoCompra" (id, "tenantId", numero, data, "solicitanteId", "solicitanteNome", departamento,
       prioridade, status, justificativa, "valorTotal", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4, $5, 'Compras', 'MEDIA', $6::"StatusRequisicaoCompra", $7, 2500.00, now(), now())`,
    [id, tenantId, numero, solicitante.id, solicitante.email, status, `Requisição do oráculo ${MARCA} ${SUF}`],
  );
  await c.query(
    `INSERT INTO "ItemRequisicao" (id, "tenantId", "requisicaoCompraId", descricao, quantidade, "unidadeMedida",
       "precoEstimado", subtotal, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Toner para impressora', 1, 'UN', 2500.00, 2500.00, now(), now())`,
    [`citem${id}`, tenantId, id],
  );
}

async function inserirCotacaoAdjudicada(c: Client, tenantId: string, id: string, requisicaoId: string): Promise<void> {
  const numero = await proximoNumero(c, tenantId, 'COTACAO_RFQ');
  numeros[id] = numero;
  await c.query(
    `INSERT INTO "Cotacao" (id, "tenantId", numero, data, "requisicaoCompraId", status, "dataValidade",
       "vencedorFornecedorId", observacoes, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4, 'ADJUDICADA', now() + interval '30 days', $5, $6, now(), now())`,
    [id, tenantId, numero, requisicaoId, ID_FORN, `Cotação do oráculo ${MARCA} ${SUF}`],
  );
  await c.query(
    `INSERT INTO "ItemCotacao" (id, "tenantId", "cotacaoId", descricao, quantidade, "unidadeMedida", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Toner para impressora', 1, 'UN', now(), now())`,
    [`citem${id}`, tenantId, id],
  );
  await c.query(
    `INSERT INTO "CotacaoFornecedor" (id, "tenantId", "cotacaoId", "fornecedorId", "dataEnvio", "dataResposta", status,
       "valorTotal", "prazoEntregaDias", "condicoesPagamento", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, now(), now(), 'RESPONDIDA', 2400.00, 10, '30 dias', now(), now())`,
    [`ccf${id}`, tenantId, id, ID_FORN],
  );
}

async function inserirPedido(c: Client, tenantId: string, id: string, status: 'RASCUNHO' | 'ENVIADO'): Promise<void> {
  const numero = await proximoNumero(c, tenantId, 'PEDIDO_COMPRA');
  numeros[id] = numero;
  await c.query(
    `INSERT INTO "PedidoCompra" (id, "tenantId", numero, data, "fornecedorId", status, "valorSubtotal", "valorIva",
       "valorTotal", "condicoesPagamento", "prazoEntregaDias", "dataEntregaPrevista", "enderecoEntrega", observacoes,
       "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4, $5::"StatusPedidoCompra", 3000.00, 480.00, 3480.00, '30 dias', 10,
       now() + interval '10 days', 'Av. 25 de Setembro, Maputo', $6, now(), now())`,
    [id, tenantId, numero, ID_FORN, status, `Pedido do oráculo ${MARCA} ${SUF}`],
  );
  await c.query(
    `INSERT INTO "ItemPedidoCompra" (id, "tenantId", "pedidoCompraId", descricao, quantidade, "unidadeMedida",
       "precoUnitario", "taxaIva", subtotal, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Resma de papel A4', 10, 'UN', 300.00, 0.16, 3480.00, now(), now())`,
    [`citem${id}`, tenantId, id],
  );
}

async function estadoPedido(id: string): Promise<{ status: string; observacoes: string | null }> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string; observacoes: string | null }>(
      `SELECT status::text, observacoes FROM "PedidoCompra" WHERE id = $1`,
      [id],
    );
    return r.rows[0];
  });
}

async function estadoRequisicao(id: string): Promise<{ status: string; pedidos: string[] }> {
  return withPg(async (c) => {
    const r = await c.query<{ status: string }>(`SELECT status::text FROM "RequisicaoCompra" WHERE id = $1`, [id]);
    const p = await c.query<{ id: string }>(`SELECT id FROM "PedidoCompra" WHERE "requisicaoCompraId" = $1`, [id]);
    return { status: r.rows[0]?.status, pedidos: p.rows.map((x) => x.id) };
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/** Carrega num botão de acção; se pedir confirmação, só pode ser um AlertDialog. */
async function accionar(page: Page, nome: RegExp): Promise<void> {
  const botao = page.getByRole('button', { name: nome });
  await expect(botao).toBeVisible();
  await botao.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const dialogo = page.getByRole('alertdialog');
  if (await dialogo.isVisible().catch(() => false)) {
    await dialogo.getByRole('button', { name: /enviar|confirmar|trânsito|continuar/i }).click();
  }
}

async function semAccoes(page: Page, id: string): Promise<void> {
  await expect(page.getByRole('button', { name: /enviar pedido/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /confirmar pedido/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /em trânsito/i })).toHaveCount(0);
  await expect(page.locator(`a[href="/compras/pedidos/${id}/cancelar"]`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /cancelar pedido/i })).toHaveCount(0);
}

test.describe(`/compras/pedidos — converter, enviar, confirmar, em trânsito, cancelar (#110, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      const admin = await adminDemo(c, tenantId);
      const base = Number(String(Date.now()).slice(-8));
      await c.query('BEGIN');
      try {
        await inserirFornecedor(c, tenantId, `7${String(base).padStart(8, '0')}`);
        await inserirRequisicao(c, tenantId, ID_REQ_A, 'APROVADA', admin);
        await inserirRequisicao(c, tenantId, ID_REQ_B, 'APROVADA', admin);
        await inserirRequisicao(c, tenantId, ID_REQ_RASCUNHO, 'RASCUNHO', admin);
        await inserirCotacaoAdjudicada(c, tenantId, ID_COT_A, ID_REQ_A);
        await inserirCotacaoAdjudicada(c, tenantId, ID_COT_B, ID_REQ_B);
        await inserirPedido(c, tenantId, ID_PC_CICLO, 'RASCUNHO');
        await inserirPedido(c, tenantId, ID_PC_CANCELAR, 'ENVIADO');
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('requisição APROVADA: «Converter em pedido» é uma rota que só oferece as suas cotações adjudicadas', async ({
    page,
  }) => {
    // Requisição em RASCUNHO: sem conversão.
    await abrir(page, `${BASE}/compras/requisicoes/${ID_REQ_RASCUNHO}`);
    await expect(page.getByText(numeros[ID_REQ_RASCUNHO]).first()).toBeVisible();
    await expect(page.locator(`a[href="/compras/requisicoes/${ID_REQ_RASCUNHO}/converter"]`)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /converter em pedido/i })).toHaveCount(0);

    await abrir(page, `${BASE}/compras/requisicoes/${ID_REQ_A}`);
    const ligacao = page.locator(`a[href="/compras/requisicoes/${ID_REQ_A}/converter"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/converter em pedido/i);
    await ligacao.click();

    await page.waitForURL(new RegExp(`/compras/requisicoes/${ID_REQ_A}/converter$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // A cotação de outra requisição nunca é oferecida.
    await expect(page.getByRole('radio', { name: new RegExp(numeros[ID_COT_B].replace(/\//g, '\\/')) })).toHaveCount(0);
    const escolha = page.getByRole('radio', { name: new RegExp(numeros[ID_COT_A].replace(/\//g, '\\/')) });
    await expect(escolha).toBeVisible();
    expect((await estadoRequisicao(ID_REQ_A)).status).toBe('APROVADA');
    await escolha.check();
    await page.getByRole('button', { name: /^converter/i }).click();

    await expect
      .poll(async () => (await estadoRequisicao(ID_REQ_A)).pedidos.length, { timeout: 15_000 })
      .toBe(1);
    const { status, pedidos } = await estadoRequisicao(ID_REQ_A);
    expect(status).toBe('CONVERTIDA');
    await page.waitForURL(reDetalhePedido(pedidos[0]), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(NOME_FORN).first()).toBeVisible();
    expect((await estadoPedido(pedidos[0])).status).toBe('RASCUNHO');
    expect((await estadoRequisicao(ID_REQ_B)).status).toBe('APROVADA');

    // Já CONVERTIDA: a ligação desaparece.
    await abrir(page, `${BASE}/compras/requisicoes/${ID_REQ_A}`);
    await expect(page.locator(`a[href="/compras/requisicoes/${ID_REQ_A}/converter"]`)).toHaveCount(0);
  });

  test('a lista leva ao detalhe; enviar → confirmar → marcar em trânsito pelo detalhe', async ({ page }) => {
    await abrir(page, `${BASE}/compras/pedidos`);
    await page.getByText(numeros[ID_PC_CICLO], { exact: true }).first().click();
    await page.waitForURL(reDetalhePedido(ID_PC_CICLO), { timeout: 15_000 });

    await abrir(page, detalhePedido(ID_PC_CICLO));
    await expect(page.getByText(numeros[ID_PC_CICLO]).first()).toBeVisible();
    await expect(page.getByText(NOME_FORN).first()).toBeVisible();
    // Em RASCUNHO ainda não se confirma nem se marca em trânsito.
    await expect(page.getByRole('button', { name: /confirmar pedido/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /em trânsito/i })).toHaveCount(0);

    const passos: Array<[RegExp, string]> = [
      [/enviar pedido/i, 'ENVIADO'],
      [/confirmar pedido/i, 'CONFIRMADO'],
      [/em trânsito/i, 'EM_TRANSITO'],
    ];
    for (const [botao, alvo] of passos) {
      await accionar(page, botao);
      await expect.poll(async () => (await estadoPedido(ID_PC_CICLO)).status, { timeout: 15_000 }).toBe(alvo);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: botao })).toHaveCount(0);
    }

    await semAccoes(page, ID_PC_CICLO);
  });

  test('«Cancelar pedido» é uma rota com motivo obrigatório; só com motivo cancela', async ({ page }) => {
    await abrir(page, detalhePedido(ID_PC_CANCELAR));
    const ligacao = page.locator(`a[href="/compras/pedidos/${ID_PC_CANCELAR}/cancelar"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/cancelar pedido/i);
    await ligacao.click();

    await page.waitForURL(new RegExp(`/compras/pedidos/${ID_PC_CANCELAR}/cancelar$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(numeros[ID_PC_CANCELAR]).first()).toBeVisible();

    // Sem motivo: não cancela e fica na rota.
    const submeter = page.getByRole('button', { name: /cancelar pedido/i });
    await submeter.click();
    await expect(page).toHaveURL(new RegExp(`/compras/pedidos/${ID_PC_CANCELAR}/cancelar$`));
    expect((await estadoPedido(ID_PC_CANCELAR)).status).toBe('ENVIADO');

    const motivo = `Fornecedor sem stock ${SUF}`;
    await page.getByLabel(/motivo/i).fill(motivo);
    await submeter.click();

    await page.waitForURL(reDetalhePedido(ID_PC_CANCELAR), { timeout: 15_000 });
    await expect.poll(async () => (await estadoPedido(ID_PC_CANCELAR)).status, { timeout: 15_000 }).toBe('CANCELADO');
    expect((await estadoPedido(ID_PC_CANCELAR)).observacoes ?? '').toContain(motivo);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await semAccoes(page, ID_PC_CANCELAR);
  });
});
