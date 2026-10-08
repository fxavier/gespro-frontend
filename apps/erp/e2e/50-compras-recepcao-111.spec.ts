/**
 * Oráculo E2E — issue #111: recepção de mercadoria e conta a pagar manual sem ecrã.
 *
 * Contrato de UI (decisão do orquestrador + verificador; sem modais, sem permissões novas, sem
 * endpoints novos — as rotas chamam `registarRecebimentoAction` e `criarContaPagarAction`):
 *
 *   Recepção — rota própria `/compras/pedidos/<id>/receber` (recolher quantidades é formulário,
 *   logo é rota e não Dialog):
 *     - o detalhe `/compras/pedidos/<id>` mostra a ligação «Registar recepção» para essa rota
 *       quando o pedido está EM_TRANSITO ou RECEBIDO_PARCIAL; em CONFIRMADO e em RECEBIDO_TOTAL
 *       a ligação não aparece;
 *     - a rota mostra o número do pedido, UMA escolha de localização de destino (combobox com
 *       nome acessível /localiza/, opção pelo NOME da localização activa) e, por item ainda por
 *       receber, um campo numérico cujo nome acessível contém «recebid…» e a DESCRIÇÃO do item;
 *       itens a 0 não são enviados;
 *     - o botão «Registar recepção» grava e volta ao detalhe do pedido; uma quantidade acima do
 *       que falta não grava nada e não sai da rota;
 *     - parcial → RECEBIDO_PARCIAL, stock na localização escolhida, sem conta a pagar; o que
 *       completa → RECEBIDO_TOTAL e exactamente uma conta a pagar do pedido.
 *
 *   Conta a pagar manual — rota própria `/fornecedores/contas-pagar/nova`:
 *     - a lista `/fornecedores/contas-pagar` tem a ligação «Nova conta a pagar» para ela;
 *     - campos: Fornecedor (combobox /fornecedor/, opção pelo nome), Conta contabilística
 *       (combobox /conta contabil/, opção que contém o CÓDIGO da conta), Descrição, Valor e Data de
 *       vencimento (`input type="date"`); a data de emissão, se existir campo, vem com hoje;
 *     - sem descrição não grava e não sai da rota; com os campos preenchidos, «Criar conta a
 *       pagar» (ou «Registar conta a pagar») cria a conta ABERTA sem pedido, com o lançamento
 *       D conta escolhida / C 421, e leva ao detalhe `/fornecedores/contas-pagar/<novo id>`.
 *
 * As regras de servidor (soma por item, localização de outro tenant/inactiva, duplo clique,
 * série CONTA_PAGAR, permissões, isolamento) são provadas em
 * `test/integration/compras-recepcao-111.test.ts`.
 *
 * Dados (prefixo único `compras-recepcao-111`), no tenant `demo`, por SQL: um fornecedor, um
 * produto, uma localização activa, um pedido EM_TRANSITO (A: produto, 10 un.; B: sem produto,
 * 2 un.) e um pedido CONFIRMADO. Os números dos pedidos saem da série PEDIDO_COMPRA do demo, que
 * fica avançada (nunca se inventa). Ficam no demo, como os dados do `47-…`, `48-…` e `49-…`; a
 * conta a pagar manual e a da recepção também (com o seu lançamento).
 *
 * ESTADO ESPERADO antes da implementação: RED — `/compras/pedidos/<id>/receber` e
 * `/fornecedores/contas-pagar/nova` não existem e não há «Registar recepção» nem «Nova conta a
 * pagar».
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/50-compras-recepcao-111.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó A:compras-recepcao-111; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MARCA = 'compras-recepcao-111';
const SUF = Date.now().toString(36);
// Ids com forma de cuid: os schemas das actions validam ids com `.cuid()`.
const ID_FORN = `cforn111${SUF}`;
const NOME_FORN = `Fornecedor RC ${SUF}`;
const ID_PROD = `cprod111${SUF}`;
const ID_LOC = `cloc111${SUF}`;
const NOME_LOC = `Armazém RC ${SUF}`;
const ID_PC_TRANSITO = `cpctr111${SUF}`;
const ID_PC_CONFIRMADO = `cpcco111${SUF}`;
const DESC_A = `Resma A4 RC ${SUF}`;
const DESC_B = `Montagem RC ${SUF}`;
const DESC_CP = `Renda do armazém ${MARCA} ${SUF}`;

const numeros: Record<string, string> = {};
let conta: { id: string; codigo: string } = { id: '', codigo: '' };

const detalhePedido = (id: string) => `${BASE}/compras/pedidos/${id}`;
const rotaReceber = (id: string) => `/compras/pedidos/${id}/receber`;
const reDetalhePedido = (id: string) => new RegExp(`/compras/pedidos/${id}$`);

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

async function tenantDemo(c: Client): Promise<string> {
  const r = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
  if (!r.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  return r.rows[0].id;
}

/** Ano civil de hoje em Africa/Maputo (a série é por ano fiscal). */
function anoMaputo(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Maputo', year: 'numeric' }).format(new Date()));
}

/** Dia civil de Maputo daqui a `dias`, como `aaaa-mm-dd` (para `input type="date"`). */
function diaMaputo(dias: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(new Date(Date.now() + dias * 86_400_000));
}

/** Próximo número da série do demo — avança a série, como o serviço. */
async function proximoNumero(c: Client, tenantId: string): Promise<string> {
  const r = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = 'PEDIDO_COMPRA' AND ativo = true AND ano = $2
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [tenantId, anoMaputo()],
  );
  const s = r.rows[0];
  if (!s) throw new Error('STOP: o demo não tem série PEDIDO_COMPRA activa para o ano corrente');
  if (s.formatoNumero !== '{prefixo}/{ano}/{numero:06}') {
    throw new Error(`STOP: formato de série inesperado (${s.formatoNumero})`);
  }
  return `${s.prefixo}/${s.ano}/${String(s.numero).padStart(6, '0')}`;
}

async function inserirPedido(
  c: Client,
  tenantId: string,
  id: string,
  status: 'EM_TRANSITO' | 'CONFIRMADO',
  itens: Array<{ descricao: string; quantidade: number; preco: number; produtoId: string | null }>,
): Promise<void> {
  const numero = await proximoNumero(c, tenantId);
  numeros[id] = numero;
  const subtotal = itens.reduce((a, i) => a + i.quantidade * i.preco, 0);
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  await c.query(
    `INSERT INTO "PedidoCompra" (id, "tenantId", numero, data, "fornecedorId", status, "valorSubtotal", "valorIva",
       "valorTotal", "condicoesPagamento", "prazoEntregaDias", "dataEntregaPrevista", "enderecoEntrega", observacoes,
       "createdAt", "updatedAt")
     VALUES ($1, $2, $3, now(), $4, $5::"StatusPedidoCompra", $6, $7, $8, '30 dias', 10,
       now() + interval '10 days', 'Av. 25 de Setembro, Maputo', $9, now(), now())`,
    [id, tenantId, numero, ID_FORN, status, subtotal.toFixed(2), iva.toFixed(2), (subtotal + iva).toFixed(2),
      `Pedido do oráculo ${MARCA} ${SUF}`],
  );
  let n = 0;
  for (const i of itens) {
    n += 1;
    const linha = i.quantidade * i.preco;
    await c.query(
      `INSERT INTO "ItemPedidoCompra" (id, "tenantId", "pedidoCompraId", "produtoId", descricao, quantidade,
         "unidadeMedida", "precoUnitario", "taxaIva", subtotal, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'UN', $7, 0.16, $8, now(), now())`,
      [`citem${n}${id}`, tenantId, id, i.produtoId, i.descricao, i.quantidade, i.preco.toFixed(2),
        (linha * 1.16).toFixed(2)],
    );
  }
}

type EstadoPedido = { status: string; recebido: Record<string, number>; recebimentos: number; contasPagar: number; saldo: number };

async function estadoPedido(id: string): Promise<EstadoPedido> {
  return withPg(async (c) => {
    const p = await c.query<{ status: string }>(`SELECT status::text FROM "PedidoCompra" WHERE id = $1`, [id]);
    const i = await c.query<{ descricao: string; r: string }>(
      `SELECT descricao, "quantidadeRecebida"::text AS r FROM "ItemPedidoCompra" WHERE "pedidoCompraId" = $1`,
      [id],
    );
    const rec = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM "RecebimentoCompra" WHERE "pedidoCompraId" = $1`, [id]);
    const cp = await c.query<{ n: string }>(`SELECT count(*)::text AS n FROM "ContaPagar" WHERE "pedidoCompraId" = $1`, [id]);
    const s = await c.query<{ s: string }>(
      `SELECT COALESCE(sum(saldo), 0)::text AS s FROM "SaldoStock" WHERE "produtoId" = $1 AND "localizacaoId" = $2`,
      [ID_PROD, ID_LOC],
    );
    return {
      status: p.rows[0]?.status,
      recebido: Object.fromEntries(i.rows.map((x) => [x.descricao, Number(x.r)])),
      recebimentos: Number(rec.rows[0].n),
      contasPagar: Number(cp.rows[0].n),
      saldo: Number(s.rows[0].s),
    };
  });
}

async function contasManuais(): Promise<Array<{ id: string; status: string; valor: number; pedido: string | null; fornecedor: string }>> {
  return withPg(async (c) => {
    const r = await c.query<{ id: string; status: string; valor: string; pedido: string | null; fornecedor: string }>(
      `SELECT id, status::text, "valorOriginal"::text AS valor, "pedidoCompraId" AS pedido, "fornecedorId" AS fornecedor
         FROM "ContaPagar" WHERE descricao = $1`,
      [DESC_CP],
    );
    return r.rows.map((x) => ({ ...x, valor: Number(x.valor) }));
  });
}

async function partidasDoLancamento(contaPagarId: string): Promise<string[]> {
  return withPg(async (c) => {
    const r = await c.query<{ p: string }>(
      `SELECT p.tipo::text || '|' || k.codigo || '|' || p.valor::text AS p
         FROM "Lancamento" l
         JOIN "PartidaLancamento" p ON p."lancamentoId" = l.id
         JOIN "ContaPGC" k ON k.id = p."contaId"
        WHERE l."documentoOrigemId" = $1`,
      [contaPagarId],
    );
    return r.rows.map((x) => x.p).sort();
  });
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function semModais(page: Page): Promise<void> {
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

/** Escolhe uma opção num combobox (Select ou Combobox/ComboboxRemoto, com campo de pesquisa ou sem ele). */
async function escolher(page: Page, campo: RegExp, pesquisa: string, opcao: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: campo }).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  const procurar = popover.getByPlaceholder(/pesquisar|procurar/i);
  if (await procurar.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true, () => false)) {
    await procurar.fill(pesquisa);
  }
  await popover.getByRole('option', { name: opcao }).first().click();
}

/** Campo numérico da quantidade recebida de um item (nome acessível com «recebid…» e a descrição). */
function quantidade(page: Page, descricao: string) {
  return page.getByRole('spinbutton', { name: new RegExp(`^(?=.*recebid)(?=.*${esc(descricao)}).*$`, 'i') });
}

test.describe(`Recepção de mercadoria e conta a pagar manual (#111, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const tenantId = await tenantDemo(c);
      const cat = await c.query<{ id: string }>(
        `SELECT id FROM "CategoriaProduto" WHERE "tenantId" = $1 ORDER BY "createdAt" LIMIT 1`,
        [tenantId],
      );
      if (!cat.rows[0]) throw new Error('STOP: o demo não tem categorias de produto');
      const k = await c.query<{ id: string; codigo: string }>(
        `SELECT id, codigo FROM "ContaPGC"
          WHERE "tenantId" = $1 AND codigo LIKE '6%' AND "aceitaLancamento" = true AND ativo = true
          ORDER BY codigo LIMIT 1`,
        [tenantId],
      );
      if (!k.rows[0]) throw new Error('STOP: o demo não tem conta de gasto que aceite lançamento');
      conta = k.rows[0];
      const base = Number(String(Date.now()).slice(-8));

      await c.query('BEGIN');
      try {
        await c.query(
          `INSERT INTO "Fornecedor" (id, "tenantId", codigo, nome, tipo, nuit, email, "formasPagamento", tags,
             "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'PESSOA_JURIDICA', $5, $6, ARRAY[]::text[], ARRAY[]::text[], now(), now())`,
          [ID_FORN, tenantId, `FOR-${MARCA}-${ID_FORN}`, NOME_FORN, `8${String(base).padStart(8, '0')}`, `${ID_FORN}@test.mz`],
        );
        await c.query(
          `INSERT INTO "Produto" (id, "tenantId", sku, nome, "categoriaId", "unidadeMedida", "precoVenda", "precoCompra",
             "margemLucro", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, 'UN', 450.00, 300.00, 0.5, now())`,
          [ID_PROD, tenantId, `SKU-${MARCA}-${SUF}`, DESC_A, cat.rows[0].id],
        );
        await c.query(
          `INSERT INTO "Localizacao" (id, "tenantId", codigo, nome, tipo, "updatedAt")
           VALUES ($1, $2, $3, $4, 'ARMAZEM', now())`,
          [ID_LOC, tenantId, `LOC-${MARCA}-${SUF}`, NOME_LOC],
        );
        await inserirPedido(c, tenantId, ID_PC_TRANSITO, 'EM_TRANSITO', [
          { descricao: DESC_A, quantidade: 10, preco: 300, produtoId: ID_PROD },
          { descricao: DESC_B, quantidade: 2, preco: 2500, produtoId: null },
        ]);
        await inserirPedido(c, tenantId, ID_PC_CONFIRMADO, 'CONFIRMADO', [
          { descricao: `Toner RC ${SUF}`, quantidade: 1, preco: 2500, produtoId: null },
        ]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  });

  test('«Registar recepção» só aparece num pedido em trânsito ou parcialmente recebido', async ({ page }) => {
    await abrir(page, detalhePedido(ID_PC_CONFIRMADO));
    await expect(page.getByText(numeros[ID_PC_CONFIRMADO]).first()).toBeVisible();
    await expect(page.locator(`a[href="${rotaReceber(ID_PC_CONFIRMADO)}"]`)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /registar recep/i })).toHaveCount(0);

    await abrir(page, detalhePedido(ID_PC_TRANSITO));
    const ligacao = page.locator(`a[href="${rotaReceber(ID_PC_TRANSITO)}"]`);
    await expect(ligacao).toBeVisible();
    await expect(ligacao).toHaveText(/registar recep/i);
  });

  test('recepção parcial e depois a que completa: stock na localização escolhida e uma conta a pagar no fim', async ({
    page,
  }) => {
    await abrir(page, detalhePedido(ID_PC_TRANSITO));
    await page.locator(`a[href="${rotaReceber(ID_PC_TRANSITO)}"]`).click();
    await page.waitForURL(new RegExp(`${esc(rotaReceber(ID_PC_TRANSITO))}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await semModais(page);
    await expect(page.getByText(numeros[ID_PC_TRANSITO]).first()).toBeVisible();

    await escolher(page, /localiza/i, NOME_LOC, new RegExp(esc(NOME_LOC)));
    const submeter = page.getByRole('button', { name: /registar recep/i });

    // Acima do que falta: não grava e não sai da rota.
    await quantidade(page, DESC_A).fill('11');
    await quantidade(page, DESC_B).fill('0');
    await submeter.click();
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(new RegExp(`${esc(rotaReceber(ID_PC_TRANSITO))}$`));
    expect(await estadoPedido(ID_PC_TRANSITO)).toMatchObject({ status: 'EM_TRANSITO', recebimentos: 0, saldo: 0 });

    // Parcial: 4 de A, B a 0 (não é enviado).
    await quantidade(page, DESC_A).fill('4');
    await submeter.click();
    await page.waitForURL(reDetalhePedido(ID_PC_TRANSITO), { timeout: 15_000 });
    await expect.poll(async () => (await estadoPedido(ID_PC_TRANSITO)).status, { timeout: 15_000 }).toBe('RECEBIDO_PARCIAL');
    expect(await estadoPedido(ID_PC_TRANSITO)).toEqual({
      status: 'RECEBIDO_PARCIAL',
      recebido: { [DESC_A]: 4, [DESC_B]: 0 },
      recebimentos: 1,
      contasPagar: 0,
      saldo: 4,
    });

    // Ainda parcialmente recebido: a ligação continua.
    await page.reload();
    await page.waitForLoadState('networkidle');
    const ligacao = page.locator(`a[href="${rotaReceber(ID_PC_TRANSITO)}"]`);
    await expect(ligacao).toBeVisible();
    await ligacao.click();
    await page.waitForURL(new RegExp(`${esc(rotaReceber(ID_PC_TRANSITO))}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');

    await escolher(page, /localiza/i, NOME_LOC, new RegExp(esc(NOME_LOC)));
    await quantidade(page, DESC_A).fill('6');
    await quantidade(page, DESC_B).fill('2');
    await page.getByRole('button', { name: /registar recep/i }).click();
    await page.waitForURL(reDetalhePedido(ID_PC_TRANSITO), { timeout: 15_000 });
    await expect.poll(async () => (await estadoPedido(ID_PC_TRANSITO)).status, { timeout: 15_000 }).toBe('RECEBIDO_TOTAL');
    expect(await estadoPedido(ID_PC_TRANSITO)).toEqual({
      status: 'RECEBIDO_TOTAL',
      recebido: { [DESC_A]: 10, [DESC_B]: 2 },
      recebimentos: 2,
      contasPagar: 1,
      saldo: 10,
    });

    // Recebido na totalidade: sem ligação.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`a[href="${rotaReceber(ID_PC_TRANSITO)}"]`)).toHaveCount(0);
  });

  test('«Nova conta a pagar» é uma rota: sem descrição não grava; preenchida cria a conta e leva ao detalhe', async ({
    page,
  }) => {
    await abrir(page, `${BASE}/fornecedores/contas-pagar`);
    const ligacao = page.locator('a[href="/fornecedores/contas-pagar/nova"]');
    await expect(ligacao.first()).toBeVisible();
    await expect(ligacao.first()).toHaveText(/nova conta/i);
    await ligacao.first().click();

    await page.waitForURL(/\/fornecedores\/contas-pagar\/nova$/, { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await semModais(page);

    await escolher(page, /fornecedor/i, NOME_FORN, new RegExp(esc(NOME_FORN)));
    await escolher(page, /conta contabil/i, conta.codigo, new RegExp(`\\b${esc(conta.codigo)}\\b`));
    await page.getByLabel(/valor/i).first().fill('1234.50');
    await page.getByLabel(/vencimento/i).fill(diaMaputo(30));

    // Sem descrição: não grava e não sai da rota.
    const submeter = page.getByRole('button', { name: /(criar|registar) conta a pagar/i });
    await submeter.click();
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(/\/fornecedores\/contas-pagar\/nova$/);
    expect(await contasManuais()).toHaveLength(0);

    await page.getByLabel(/descri/i).fill(DESC_CP);
    await submeter.click();

    await expect.poll(async () => (await contasManuais()).length, { timeout: 15_000 }).toBe(1);
    const [cp] = await contasManuais();
    expect(cp).toMatchObject({ status: 'ABERTA', valor: 1234.5, pedido: null, fornecedor: ID_FORN });
    await page.waitForURL(new RegExp(`/fornecedores/contas-pagar/${cp.id}$`), { timeout: 15_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(DESC_CP).first()).toBeVisible();

    expect(await partidasDoLancamento(cp.id)).toEqual([`CREDITO|421|1234.50`, `DEBITO|${conta.codigo}|1234.50`].sort());
  });
});
