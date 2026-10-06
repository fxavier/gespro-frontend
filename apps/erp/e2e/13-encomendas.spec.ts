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

  // Vendedor — o seed regista quatro (demo-vendas): escolhe-se por pesquisa no
  // servidor, como o cliente. O ramo «sem vendedores» (caixa desactivada e o
  // motivo à vista) já não é alcançável com a base do seed e não se prova aqui:
  // exigia um tenant sem vendedores, e apagar os do demo partiria as encomendas
  // e comissões que o seed lhes atribui.
  const vendedor = page.getByRole('combobox', { name: 'Vendedor' });
  await expect(vendedor).toBeEnabled();
  await expect(page.getByText(/Ainda não há vendedores activos/)).toHaveCount(0);
  await vendedor.click();
  await page.getByPlaceholder(/Pesquisar por nome ou e-mail/).fill('Gestor');
  const opcaoVendedor = page.getByRole('option', { name: /Gestor Demo/ });
  await expect(opcaoVendedor).toBeVisible({ timeout: 15_000 });
  await opcaoVendedor.click();
  await expect(vendedor).toHaveText(/Gestor Demo/);

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

test('uma encomenda em rascunho edita-se e o detalhe mostra os valores novos', async ({ page }) => {
  test.setTimeout(120_000);

  // 1. Criar pelo formulário real (como o teste anterior): 2 × TONER-001.
  await page.goto('/vendas/pedidos/novo');
  await expect(page.getByRole('heading', { name: 'Nova Encomenda de Venda' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');

  await page.getByRole('combobox', { name: 'Cliente *' }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  await page.getByRole('option', { name: /Maria/ }).click();
  const rotuloCliente = (await page.getByRole('combobox', { name: 'Cliente *' }).innerText()).trim();
  expect(rotuloCliente).toMatch(/Maria/);

  await page.getByRole('combobox', { name: 'Produto *' }).click();
  await page.getByPlaceholder(/Pesquisar por nome, SKU/).fill('Toner');
  await page.getByRole('option', { name: /TONER-001/ }).click();
  await expect(page.getByLabel('Preço unitário do item 1')).toHaveValue('3500');

  await page.getByLabel('Quantidade do item 1').fill('2');
  await page.getByRole('button', { name: 'Criar Encomenda' }).click();
  await page.waitForURL(/\/vendas\/pedidos$/, { timeout: 60_000 });

  // 2. A listagem ordena por createdAt desc: a primeira linha é a acabada de criar.
  //    Guarda-se o número e entra-se pelo link desse número (único por tenant).
  const ligacao = page.locator('tbody tr').first().getByRole('link', { name: /^ENC\/\d{4}\/\d+/ });
  const numero = (await ligacao.innerText()).trim();
  expect(numero).toMatch(/^ENC\/\d{4}\/\d+$/);
  await ligacao.click();
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toBeVisible({ timeout: 30_000 });
  const urlDetalhe = page.url();
  expect(urlDetalhe).toMatch(/\/vendas\/pedidos\/[^/]+$/);
  const caminhoDetalhe = new URL(urlDetalhe).pathname;

  // 3. Editar: o mesmo formulário do /novo, pré-preenchido.
  await page.getByRole('link', { name: 'Editar' }).click();
  await page.waitForURL(`**${caminhoDetalhe}/editar`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `Editar Encomenda ${numero}` })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('combobox', { name: 'Cliente *' })).toHaveText(rotuloCliente);
  await expect(page.getByRole('combobox', { name: 'Produto *' })).toHaveText(/TONER-001/);
  await expect(page.getByLabel('Quantidade do item 1')).toHaveValue('2');
  await expect(page.getByLabel('Preço unitário do item 1')).toHaveValue('3500');

  await page.getByLabel('Quantidade do item 1').fill('3');
  await page.getByRole('button', { name: 'Guardar Alterações' }).click();

  // 4. Volta ao detalhe, que mostra a quantidade e o total recalculados:
  //    3 × 3500 = 10 500; IVA 16% = 1 680; total 12 180.
  await page.waitForURL((url) => url.pathname === caminhoDetalhe, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toBeVisible({ timeout: 30_000 });

  const linhas = page.locator('tbody tr');
  await expect(linhas).toHaveCount(1);
  const celulas = linhas.first().locator('td');
  await expect(celulas.nth(0)).toContainText('TONER-001');
  await expect(celulas.nth(1)).toHaveText('3');
  await expect(celulas.nth(3)).toHaveText(/1[\s  .]?680,00/);
  await expect(celulas.nth(4)).toHaveText(/12[\s  .]?180,00/);
  await expect(page.locator('tfoot')).toContainText(/12[\s  .]?180,00/);
});
