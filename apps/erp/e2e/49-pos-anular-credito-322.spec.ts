/**
 * E2E — issue #322 (ADR-0041 §8): uma venda POS a crédito anula-se pelo POS.
 *
 * Venda real no tenant `demo`, conduzida pelo terminal: uma unidade a crédito ao cliente
 * identificado → Factura (FAT/…), venda Facturada. Depois, no detalhe da venda, «Anular venda»
 * está disponível; a rota /vendas/<id>/anular já não mostra a recusa «foi a crédito» e
 * aceita o motivo. Resultado visível:
 *   - a venda fica Cancelada, sem «Anular venda»;
 *   - o histórico diz «Anulada pela nota de crédito NC/…» com o motivo;
 *   - a NC aparece em /vendas/notas-credito, Liquidada, com o motivo;
 *   - a factura da venda fica Paga (compensada pela NC) em /faturacao/<id>.
 *
 * O POS precisa de caixa aberto do admin: se não houver, abre-se pela UI.
 *
 * ESCREVE NA BASE: cada corrida deixa 1 venda cancelada, 1 FAT compensada, 1 NC, os
 * movimentos de stock e os lançamentos correspondentes no tenant `demo`.
 */

import { test, expect, type Page } from '@playwright/test';

const PREFIXO = 'pos-anular-credito-322';
const PRODUTO = 'Agrafador Metálico'; // PAP-004, IVA 16 %, com stock no seed
const CLIENTE_CREDITO = { pesquisa: 'CLI-0002', nome: /Empresa ABC/ };

const pesquisaProduto = (page: Page) => page.getByRole('textbox', { name: /Pesquisar produto/i });

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

/** Uma unidade de PRODUTO a crédito ao CLIENTE_CREDITO. Devolve id (do talão) e número (do toast). */
async function venderACredito(page: Page): Promise<{ id: string; numero: string }> {
  await abrirTerminal(page);

  await pesquisaProduto(page).fill(PRODUTO);
  await page.getByRole('button', { name: new RegExp(PRODUTO) }).first().click();
  await expect(page.getByText('Carrinho vazio')).toHaveCount(0);

  await page.getByRole('button', { name: /Finalizar \(F10\)/ }).click();
  await page.getByRole('button', { name: 'Crédito', exact: true }).click();
  const finalizar = page.getByRole('button', { name: /^Facturar a crédito MT/ });

  const combobox = page.getByRole('combobox', { name: /Cliente/ });
  await combobox.click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  await popover.getByPlaceholder('Pesquisar por código, nome ou NUIT…').fill(CLIENTE_CREDITO.pesquisa);
  const opcao = page.getByRole('option').filter({ hasText: CLIENTE_CREDITO.nome });
  await expect(opcao).toHaveCount(1, { timeout: 15_000 });
  await opcao.click();
  await expect(combobox).toHaveText(CLIENTE_CREDITO.nome);

  await expect(finalizar).toBeEnabled();
  await finalizar.click();

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

  return { id, numero: numero! };
}

test.describe(`POS — anular venda a crédito (${PREFIXO}, #322)`, () => {
  test('venda a crédito: «Anular venda» → Cancelada, NC liquidada com o motivo, factura Paga', async ({ page }) => {
    test.setTimeout(240_000);
    const venda = await venderACredito(page);
    const motivo = `E2E ${PREFIXO} ${Date.now()}`;

    await page.goto(`/vendas/${venda.id}`);
    await expect(page.getByRole('heading', { name: `Venda ${venda.numero}` })).toBeVisible({ timeout: 30_000 });

    // A factura da venda (FAT/…), para conferir no fim.
    const ligacaoFatura = page.getByRole('link', { name: /FAT\/\d{4}\/\d+/ });
    await expect(ligacaoFatura).toHaveCount(1, { timeout: 15_000 });
    const hrefFatura = (await ligacaoFatura.getAttribute('href'))!;
    expect(hrefFatura).toMatch(/^\/faturacao\/[^/?#]+$/);

    // A venda a crédito passa a ter «Anular venda».
    const anularLink = page.getByRole('link', { name: 'Anular venda' });
    await expect(anularLink, 'venda a crédito sem «Anular venda» no detalhe').toHaveCount(1);
    await anularLink.click();
    await page.waitForURL(new RegExp(`/vendas/${venda.id}/anular$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Anular venda ${venda.numero}` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/foi a crédito/)).toHaveCount(0);
    await page.waitForLoadState('networkidle');

    await page.getByRole('textbox', { name: 'Motivo' }).fill(motivo);
    await page.getByRole('button', { name: 'Anular venda' }).click();

    await expect(
      page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: /anulada/ }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForURL(new RegExp(`/vendas/${venda.id}$`), { timeout: 30_000 });

    await expect(page.getByText('Cancelada').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Anular venda' })).toHaveCount(0);

    await page.getByRole('tab', { name: /Histórico/ }).click();
    const entrada = page.getByText(/Anulada pela nota de crédito NC\/\d{4}\/\d+/);
    await expect(entrada).toBeVisible({ timeout: 15_000 });
    await expect(entrada).toContainText(motivo);
    const nc = (await entrada.textContent())!.match(/NC\/\d{4}\/\d+/)![0];

    await page.goto('/vendas/notas-credito');
    const linha = page.getByRole('row').filter({ hasText: nc });
    await expect(linha, `a nota de crédito ${nc} não aparece em /vendas/notas-credito`).toHaveCount(1, { timeout: 30_000 });
    await expect(linha).toContainText(motivo);
    await expect(linha).toContainText('Liquidada');

    // A factura fica saldada pela compensação.
    await page.goto(hrefFatura);
    await expect(page.getByText('Paga', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });
});
