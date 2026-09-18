/**
 * E2E: nova encomenda de venda.
 *
 * O formulário pedia três cuids escritos à mão — cliente, vendedor e produto —
 * e o nome do produto era um campo livre ao lado do id, livre de o contradizer.
 *
 * Cria uma encomenda por corrida. É um rascunho, não um documento fiscal, e o
 * caminho de criação foi o que esteve partido duas vezes (data vazia rejeitada
 * em silêncio; série ENCOMENDA que nenhum tenant tinha): sem o exercitar, a
 * regressão volta sem ninguém dar por ela.
 */

import { test, expect } from '@playwright/test';

test('cliente, vendedor e produto escolhem-se por pesquisa', async ({ page }) => {
  await page.goto('/vendas/pedidos/novo');
  await expect(page.getByRole('heading', { name: 'Nova Encomenda de Venda' })).toBeVisible({
    timeout: 30_000,
  });

  // Cliente — a pesquisa vai ao servidor (são milhares).
  await page.getByRole('combobox', { name: 'Cliente *' }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  // Esperar pelo NOME procurado, não por «uma opção qualquer»: até a pesquisa
  // responder a lista ainda é a primeira página, e um clique aí escolhe outro
  // cliente. A asserção é o que sincroniza com o resultado do servidor.
  const opcaoCliente = page.getByRole('option', { name: /Maria/ });
  await expect(opcaoCliente).toBeVisible({ timeout: 15_000 });
  await opcaoCliente.click();
  await expect(page.getByRole('combobox', { name: 'Cliente *' })).toHaveText(/Maria/);

  // Vendedor — não há nenhum registado: caixa desactivada e o motivo à vista,
  // em vez de uma lista vazia que parece avariada.
  await expect(page.getByRole('combobox', { name: 'Vendedor' })).toBeDisabled();
  await expect(page.getByText(/Ainda não há vendedores activos/)).toBeVisible();

  // Produto — escolher preenche o preço a partir do catálogo.
  await page.getByRole('combobox', { name: 'Produto *' }).click();
  await page.getByPlaceholder(/Pesquisar por nome, SKU/).fill('Toner');
  const opcaoProduto = page.getByRole('option', { name: /TONER-001/ });
  await expect(opcaoProduto).toBeVisible({ timeout: 15_000 });
  await opcaoProduto.click();

  await expect(page.getByLabel('Preço unitário do item 1')).toHaveValue('3500');
  await expect(page.getByText(/Preço de catálogo/)).toBeVisible();
});

test('a encomenda é criada e aparece na listagem', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/vendas/pedidos/novo');
  await expect(page.getByRole('heading', { name: 'Nova Encomenda de Venda' })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole('combobox', { name: 'Cliente *' }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  await page.getByRole('option', { name: /Maria/ }).click();

  await page.getByRole('combobox', { name: 'Produto *' }).click();
  await page.getByPlaceholder(/Pesquisar por nome, SKU/).fill('Toner');
  await page.getByRole('option', { name: /TONER-001/ }).click();

  await page.getByLabel('Quantidade do item 1').fill('2');

  // Data prevista deixada em branco DE PROPÓSITO: é opcional, e era
  // precisamente o campo vazio que fazia o formulário recusar-se a submeter.
  await page.getByRole('button', { name: 'Criar Encomenda' }).click();

  await page.waitForURL(/\/vendas\/pedidos$/, { timeout: 60_000 });
  await expect(page.locator('tbody tr').first()).toContainText(/^ENC\/\d{4}\/\d+/);
});
