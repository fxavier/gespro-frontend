/**
 * E2E — #128: o terminal POS aceita vários pagamentos, pesquisa produtos no servidor e não
 * deixa submeter enquanto os pagamentos não batem com o total.
 *
 * Contrato de UI (o que este spec pressupõe — o resto é livre):
 *   - Pesquisa: o campo «Pesquisar produto» procura no SERVIDOR (nome, SKU, código de barras),
 *     sem o tecto dos 60 primeiros por nome. «Tomada Schuko de Embutir» (ELE-004, 160 MT @16 %
 *     → 185,60) fica depois do 60.º produto activo do tenant `demo` por nome — hoje é o 65.º —,
 *     logo só aparece com a pesquisa remota.
 *   - Painel de pagamento: uma LISTA de pagamentos. Cada linha tem um campo com o nome
 *     acessível «Valor do pagamento N» (N a partir de 1). A primeira linha nasce com o total
 *     (o caso comum, um meio só, continua a ser um clique — os specs 27 e 49 dependem disso).
 *   - Os botões de meio («Dinheiro», «Cartão», «M-Pesa», «e-Mola», «Transferência», «Crédito»)
 *     definem o meio da linha activa, que é a última acrescentada.
 *   - «Adicionar pagamento» acrescenta uma linha, já activa, com o valor em falta.
 *   - Enquanto Σ < total aparece «Em falta: MT x»; o excesso só é troco quando cabe no
 *     dinheiro — então aparece «Troco: MT x»; num meio electrónico o excesso não dá troco.
 *   - O botão «Pagar MT …» fica desactivado enquanto os pagamentos não fecham o total
 *     (Σ ≠ total depois de descontado o troco do dinheiro).
 *
 * Prefixo único: pos-multi-pagamento-128.
 * ESCREVE NA BASE: cada corrida deixa 1 venda POS (FR/…, 2 pagamentos), o movimento de stock
 * de 1 Tomada e um MovimentoCaixa de 85,60 no tenant `demo`.
 */

import { test, expect, type Page } from '@playwright/test';

const PRODUTO = { nome: 'Tomada Schuko de Embutir', sku: 'ELE-004' }; // 160 MT, IVA 16 % → 185,60

const pesquisaProduto = (page: Page) => page.getByRole('textbox', { name: /Pesquisar produto/i });
const valorPagamento = (page: Page, n: number) =>
  page.getByRole('textbox', { name: new RegExp(`Valor do pagamento ${n}\\b`) });
const botaoPagar = (page: Page) => page.getByRole('button', { name: /^Pagar MT/ });
const meio = (page: Page, nome: string) => page.getByRole('button', { name: nome, exact: true });

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

  await expect(pesquisaProduto(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}

/** Pesquisa (no servidor) e põe uma Tomada no carrinho; abre o painel de pagamento. */
async function carrinhoComTomada(page: Page, termo: string): Promise<void> {
  await pesquisaProduto(page).fill(termo);
  const cartao = page.getByRole('button', { name: new RegExp(PRODUTO.nome) }).first();
  await expect(
    cartao,
    `a pesquisa por «${termo}» não encontrou ${PRODUTO.nome} — a pesquisa ainda só vê os 60 produtos carregados?`,
  ).toBeVisible({ timeout: 15_000 });
  await cartao.click();
  await expect(page.getByText('Carrinho vazio')).toHaveCount(0);
  await page.getByRole('button', { name: /Finalizar \(F10\)/ }).click();
  await expect(valorPagamento(page, 1)).toBeVisible({ timeout: 10_000 });
}

test.describe('POS — pagamentos múltiplos e pesquisa remota (#128, pos-multi-pagamento-128)', () => {
  test('a pesquisa encontra um produto para lá dos 60 primeiros, por nome e por SKU', async ({ page }) => {
    test.setTimeout(120_000);
    await abrirTerminal(page);

    for (const termo of [PRODUTO.nome, PRODUTO.sku]) {
      await pesquisaProduto(page).fill(termo);
      await expect(
        page.getByRole('button', { name: new RegExp(PRODUTO.nome) }).first(),
        `pesquisa remota por «${termo}»`,
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test('troco só em dinheiro e Pagar recusado enquanto Σ ≠ total (sem gravar nada)', async ({ page }) => {
    test.setTimeout(120_000);
    await abrirTerminal(page);
    await carrinhoComTomada(page, PRODUTO.sku);

    // Uma linha só, nascida com o total: pode pagar.
    await expect(valorPagamento(page, 1)).toHaveValue(/^185[,.]60?$/);
    await expect(botaoPagar(page)).toBeEnabled();

    // Valor abaixo do total: em falta, não pode pagar.
    await meio(page, 'Cartão').click();
    await valorPagamento(page, 1).fill('100');
    await expect(page.getByText(/Em falta:\s*MT\s*85,60/)).toBeVisible();
    await expect(botaoPagar(page)).toBeDisabled();

    // Cartão acima do total: o cartão não dá troco — continua recusado e sem «Troco».
    await valorPagamento(page, 1).fill('200');
    await expect(page.getByText(/Troco:\s*MT/)).toHaveCount(0);
    await expect(botaoPagar(page)).toBeDisabled();

    // O mesmo excesso em dinheiro é troco: pode pagar.
    await meio(page, 'Dinheiro').click();
    await expect(page.getByText(/Troco:\s*MT\s*14,40/)).toBeVisible();
    await expect(botaoPagar(page)).toBeEnabled();

    // Valor inválido: recusado.
    await valorPagamento(page, 1).fill('abc');
    await expect(botaoPagar(page)).toBeDisabled();

    // Sai sem vender.
    await page.getByRole('button', { name: /Voltar ao carrinho/ }).click();
  });

  test('cartão 100 + dinheiro recebido 100: a venda grava os dois pagamentos e o troco no dinheiro', async ({ page }) => {
    test.setTimeout(180_000);
    await abrirTerminal(page);
    await carrinhoComTomada(page, PRODUTO.nome);

    await meio(page, 'Cartão').click();
    await valorPagamento(page, 1).fill('100');
    await expect(page.getByText(/Em falta:\s*MT\s*85,60/)).toBeVisible();
    await expect(botaoPagar(page)).toBeDisabled();

    await page.getByRole('button', { name: 'Adicionar pagamento' }).click();
    await expect(valorPagamento(page, 2)).toBeVisible();
    // A linha nova nasce com o que falta.
    await expect(valorPagamento(page, 2)).toHaveValue(/^85[,.]60?$/);
    await meio(page, 'Dinheiro').click();
    await valorPagamento(page, 2).fill('100');

    await expect(page.getByText(/Em falta:\s*MT/)).toHaveCount(0);
    await expect(page.getByText(/Troco:\s*MT\s*14,40/)).toBeVisible();
    // A linha 1 continua a ser cartão de 100.
    await expect(valorPagamento(page, 1)).toHaveValue(/^100([,.]0{1,2})?$/);
    await expect(botaoPagar(page)).toBeEnabled();
    await botaoPagar(page).click();

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
    await talao.close();

    await page.goto(`/vendas/${id}`);
    await expect(page.getByRole('heading', { name: `Venda ${numero}` })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('tab', { name: /Pagamentos/ }).click();

    const linhas = page.getByRole('row');
    const cartao = linhas.filter({ hasText: 'Cartão' });
    const dinheiro = linhas.filter({ hasText: 'Dinheiro' });
    await expect(cartao).toHaveCount(1, { timeout: 15_000 });
    await expect(dinheiro).toHaveCount(1);
    await expect(cartao).toContainText(/100,00/);
    await expect(dinheiro).toContainText(/85,60/);
    await expect(dinheiro).toContainText(/14,40/);
  });
});
