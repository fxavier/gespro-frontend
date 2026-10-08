/**
 * E2E — POS-S9 (issue #313, ADR-0041): o POS conclui uma venda e vê o documento.
 *
 * Três vendas reais no tenant `demo`, conduzidas pelo terminal:
 *   1. Dinheiro → Factura-Recibo (FR/…): o detalhe da venda liga ao documento e o PDF
 *      do documento responde 200 application/pdf.
 *   2. Crédito a um cliente identificado → Factura (FAT/…), ligada da mesma maneira.
 *   3. Dinheiro e depois «Anular venda» → a venda fica Cancelada e existe uma nota de
 *      crédito (NC/…) com o motivo dado, listada em /vendas/notas-credito.
 *
 * O POS precisa de caixa aberto do admin: se não houver, abre-se pela UI
 * (/caixa/abertura?voltar=/pos), como um operador faria.
 *
 * ESCREVE NA BASE: cada corrida deixa 3 vendas, 3 documentos (2 FR + 1 FAT), 1 NC,
 * os movimentos de stock/caixa e os lançamentos correspondentes no tenant `demo`.
 * O id da venda sai do talão (a acção «Imprimir talão» do toast abre /pos/talao/<id>).
 */

import { test, expect, type Page } from '@playwright/test';

const PRODUTO = 'Agrafador Metálico'; // PAP-004, IVA 16 %, com stock no seed
const CLIENTE_CREDITO = { pesquisa: 'CLI-0002', nome: /Empresa ABC/ };

// ─── terminal ─────────────────────────────────────────────────────────────────

const pesquisaProduto = (page: Page) => page.getByRole('textbox', { name: /Pesquisar produto/i });

/** /pos com terminal pronto — abre o caixa pela UI se o admin não tiver nenhum aberto. */
async function abrirTerminal(page: Page): Promise<void> {
  await page.goto('/pos');
  await page.waitForLoadState('domcontentloaded');

  if (/\/caixa\/abertura/.test(page.url())) {
    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    const checkboxes = page.locator('[role="checkbox"]');
    const n = await checkboxes.count();
    for (let i = 0; i < n; i++) await checkboxes.nth(i).click();
    await page.getByRole('button', { name: 'Prosseguir' }).click();
    await expect(page.getByText('Dados da Abertura')).toBeVisible();
    await page.getByLabel(/Fundo Inicial/i).fill('5000');
    await page.getByRole('button', { name: 'Confirmar Abertura' }).click();
    await page.waitForURL(/\/pos$/, { timeout: 30_000 });
  }

  // Com caixa aberto e sem sessão POS, «A iniciar o POS…» abre-a sozinho e recarrega.
  await expect(pesquisaProduto(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

interface VendaFeita {
  id: string;
  numero: string;
}

/**
 * Uma unidade de PRODUTO, paga em dinheiro (recebido 500) ou a crédito ao CLIENTE_CREDITO.
 * Devolve o id (do talão) e o número (do toast).
 */
async function venderNoTerminal(page: Page, modo: 'DINHEIRO' | 'CREDITO'): Promise<VendaFeita> {
  await abrirTerminal(page);

  await pesquisaProduto(page).fill(PRODUTO);
  await page.getByRole('button', { name: new RegExp(PRODUTO) }).first().click();
  await expect(page.getByText('Carrinho vazio')).toHaveCount(0);

  await page.getByRole('button', { name: /Finalizar \(F10\)/ }).click();

  if (modo === 'DINHEIRO') {
    await page.getByRole('button', { name: 'Dinheiro', exact: true }).click();
    // #128: o painel é uma lista de pagamentos; a primeira linha é «Valor do pagamento 1».
    await page.getByRole('textbox', { name: /Valor do pagamento 1\b/ }).fill('500');
    await expect(page.getByText(/Troco: MT/)).toBeVisible();
    await page.getByRole('button', { name: /^Pagar MT/ }).click();
  } else {
    await page.getByRole('button', { name: 'Crédito', exact: true }).click();
    const finalizar = page.getByRole('button', { name: /^Facturar a crédito MT/ });
    // Sem cliente a venda a crédito não sai.
    await expect(finalizar).toBeDisabled();

    const combobox = page.getByRole('combobox', { name: /Cliente/ });
    await combobox.click();
    await page.getByPlaceholder('Pesquisar por código, nome ou NUIT…').fill(CLIENTE_CREDITO.pesquisa);
    const opcao = page.getByRole('option').filter({ hasText: CLIENTE_CREDITO.nome });
    await expect(opcao).toHaveCount(1, { timeout: 15_000 });
    await opcao.click();
    await expect(combobox).toHaveText(CLIENTE_CREDITO.nome);

    await expect(finalizar).toBeEnabled();
    await finalizar.click();
  }

  const toast = page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: /registada/ });
  await expect(toast, 'a venda não foi registada (sem toast de sucesso)').toBeVisible({ timeout: 30_000 });
  const numero = (await toast.textContent())?.match(/Venda\s+(\S+)\s+registada/)?.[1];
  expect(numero, 'o toast não traz o número da venda').toBeTruthy();

  const [talao] = await Promise.all([
    page.waitForEvent('popup'),
    toast.getByRole('button', { name: 'Imprimir talão' }).click(),
  ]);
  await talao.waitForURL(/\/pos\/talao\/[^/]+$/);
  const id = new URL(talao.url()).pathname.split('/').pop()!;
  await expect(talao.getByText(numero!).first()).toBeVisible({ timeout: 30_000 });
  await talao.close();

  return { id, numero: numero! };
}

// ─── detalhe da venda ─────────────────────────────────────────────────────────

async function abrirVenda(page: Page, venda: VendaFeita): Promise<void> {
  await page.goto(`/vendas/${venda.id}`);
  await expect(page.getByRole('heading', { name: `Venda ${venda.numero}` })).toBeVisible({ timeout: 30_000 });
}

/**
 * O detalhe da venda mostra o documento fiscal emitido com ela — número visível,
 * ligado a /faturacao/<id> — e o PDF desse documento é servido. Devolve o número.
 */
async function documentoDaVenda(page: Page, prefixo: 'FR' | 'FAT'): Promise<string> {
  const ligacao = page.getByRole('link', { name: new RegExp(`${prefixo}/\\d{4}/\\d+`) });
  await expect(
    ligacao,
    `o detalhe da venda não mostra o documento ${prefixo}/… ligado à facturação`,
  ).toHaveCount(1, { timeout: 15_000 });

  const numero = (await ligacao.textContent())!.match(new RegExp(`${prefixo}/\\d{4}/\\d+`))![0];
  const href = await ligacao.getAttribute('href');
  expect(href, 'a ligação do documento tem de ir para /faturacao/<id>').toMatch(/^\/faturacao\/[^/?#]+$/);
  const faturaId = href!.split('/').pop()!;

  const pdf = await page.request.get(`/api/faturacao/${faturaId}/pdf`);
  expect(pdf.status(), `PDF do documento ${numero}`).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');

  return numero;
}

// ─── cenários ─────────────────────────────────────────────────────────────────

test.describe('POS — a venda emite o documento fiscal (ADR-0041, #313)', () => {
  test('venda a dinheiro: Factura-Recibo ligada ao detalhe e PDF servido', async ({ page }) => {
    test.setTimeout(180_000);
    const venda = await venderNoTerminal(page, 'DINHEIRO');

    await abrirVenda(page, venda);
    await expect(page.getByText('Concluída').first()).toBeVisible();
    await documentoDaVenda(page, 'FR');
  });

  test('venda a crédito: exige cliente e emite Factura (FAT/…)', async ({ page }) => {
    test.setTimeout(180_000);
    const venda = await venderNoTerminal(page, 'CREDITO');

    await abrirVenda(page, venda);
    await documentoDaVenda(page, 'FAT');
    // A crédito não há Factura-Recibo; anula-se pelo POS (#322: NC compensada na factura).
    await expect(page.getByRole('link', { name: /FR\/\d{4}\/\d+/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Anular venda' })).toHaveCount(1);
  });

  test('anular a venda: fica Cancelada e é emitida uma nota de crédito com o motivo', async ({ page }) => {
    test.setTimeout(240_000);
    const venda = await venderNoTerminal(page, 'DINHEIRO');
    const motivo = `E2E POS-S9 anulação ${Date.now()}`;

    await abrirVenda(page, venda);
    await page.getByRole('link', { name: 'Anular venda' }).click();
    await page.waitForURL(new RegExp(`/vendas/${venda.id}/anular$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Anular venda ${venda.numero}` })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Motivo' }).fill(motivo);
    await page.getByRole('button', { name: 'Anular venda' }).click();

    await expect(
      page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: /anulada/ }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForURL(new RegExp(`/vendas/${venda.id}$`), { timeout: 30_000 });

    await expect(page.getByText('Cancelada').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Anular venda' })).toHaveCount(0);

    // O histórico diz que NC compensou a venda, com o motivo dado.
    await page.getByRole('tab', { name: /Histórico/ }).click();
    const entrada = page.getByText(/Anulada pela nota de crédito NC\/\d{4}\/\d+/);
    await expect(entrada).toBeVisible({ timeout: 15_000 });
    await expect(entrada).toContainText(motivo);
    const nc = (await entrada.textContent())!.match(/NC\/\d{4}\/\d+/)![0];

    // A NC existe, com o motivo, e já liquidada (devolvida pelos meios originais).
    await page.goto('/vendas/notas-credito');
    const linha = page.getByRole('row').filter({ hasText: nc });
    await expect(linha, `a nota de crédito ${nc} não aparece em /vendas/notas-credito`).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(linha).toContainText(motivo);
    await expect(linha).toContainText('Liquidada');
  });
});
