/**
 * E2E encomenda-transicoes-129 — confirmar, converter e cancelar uma encomenda de venda (#129).
 *
 * O `encomendaService` tinha as transições e a UI não as ligava: o detalhe de
 * `/vendas/pedidos/[id]` só mostrava «Editar» e o estado em bruto («Estado: RASCUNHO»).
 *
 * Contrato da UI (sem modais — ADR/regra da casa):
 *   - RASCUNHO: ligação «Confirmar» → rota própria `/vendas/pedidos/[id]/confirmar`, com a
 *     escolha da localização de stock («Localização *», obrigatória para reservar) e o botão
 *     «Confirmar Encomenda». Volta ao detalhe com o estado «Confirmada».
 *   - CONFIRMADA: botão «Converter em Venda» → AlertDialog (confirmar, não recolher dados) com o
 *     botão «Converter». Fica no detalhe com o estado «Concluída»; já sem acções de transição.
 *   - RASCUNHO / CONFIRMADA: botão «Cancelar Encomenda» → AlertDialog com «Confirmar cancelamento».
 *     O cancelamento apaga logicamente (o detalhe deixa de existir): a UI vai para a listagem,
 *     onde a encomenda já não aparece.
 *   - O estado nunca aparece em bruto (`Estado: RASCUNHO`); só pelo StatusBadge.
 *
 * Dados: cada corrida cria duas encomendas no tenant `demo` (1 × ELE-006, armazém LOC-001
 * «Armazém Principal»); a primeira é convertida em venda (consome 1 unidade de ELE-006 e deixa
 * uma venda + lançamento D 411), a segunda é cancelada (liberta a reserva).
 */

import { test, expect, type Page } from '@playwright/test';

const ESTADO_EM_BRUTO = /Estado:\s*(RASCUNHO|CONFIRMADA|CONCLUIDA|CANCELADA)/;

/** Cria uma encomenda pelo formulário real e devolve o número e o caminho do detalhe. */
async function criarEncomenda(page: Page): Promise<{ numero: string; caminho: string }> {
  await page.goto('/vendas/pedidos/novo');
  await expect(page.getByRole('heading', { name: 'Nova Encomenda de Venda' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');

  await page.getByRole('combobox', { name: 'Cliente *' }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  const opcaoCliente = page.getByRole('option', { name: /Maria/ });
  await expect(opcaoCliente).toBeVisible({ timeout: 15_000 });
  await opcaoCliente.click();

  await page.getByRole('combobox', { name: 'Produto *' }).click();
  await page.getByPlaceholder(/Pesquisar por nome, SKU/).fill('ELE-006');
  const opcaoProduto = page.getByRole('option', { name: /ELE-006/ });
  await expect(opcaoProduto).toBeVisible({ timeout: 15_000 });
  await opcaoProduto.click();

  await page.getByLabel('Quantidade do item 1').fill('1');
  await page.getByRole('button', { name: 'Criar Encomenda' }).click();
  await page.waitForURL(/\/vendas\/pedidos$/, { timeout: 60_000 });

  // A listagem ordena por createdAt desc: a primeira linha é a acabada de criar.
  const ligacao = page.locator('tbody tr').first().getByRole('link', { name: /^ENC\/\d{4}\/\d+/ });
  const numero = (await ligacao.innerText()).trim();
  expect(numero).toMatch(/^ENC\/\d{4}\/\d+$/);
  await ligacao.click();
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toBeVisible({ timeout: 30_000 });
  const caminho = new URL(page.url()).pathname;
  expect(caminho).toMatch(/^\/vendas\/pedidos\/[^/]+$/);
  return { numero, caminho };
}

/** Confirma a encomenda pela rota própria, escolhendo o Armazém Principal. */
async function confirmarEncomenda(page: Page, numero: string, caminho: string) {
  await page.getByRole('link', { name: 'Confirmar', exact: true }).click();
  await page.waitForURL(`**${caminho}/confirmar`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `Confirmar Encomenda ${numero}` })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');

  await page.getByRole('combobox', { name: 'Localização *' }).click();
  const opcaoLocal = page.getByRole('option', { name: /Armazém Principal/ });
  await expect(opcaoLocal).toBeVisible({ timeout: 15_000 });
  await opcaoLocal.click();
  await expect(page.getByRole('combobox', { name: 'Localização *' })).toHaveText(/Armazém Principal/);

  await page.getByRole('button', { name: 'Confirmar Encomenda' }).click();
  await page.waitForURL((url) => url.pathname === caminho, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Confirmada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
}

test('encomenda-transicoes-129: rascunho → confirmar (com localização) → converter em venda', async ({ page }) => {
  test.setTimeout(180_000);
  const { numero, caminho } = await criarEncomenda(page);

  // RASCUNHO: Editar, Confirmar e Cancelar; nada de converter. Estado só pelo badge.
  await expect(page.getByText('Rascunho', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Confirmar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar Encomenda' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Converter em Venda' })).toHaveCount(0);

  // Confirmar exige a localização: sem ela, o submit não sai da rota.
  await page.getByRole('link', { name: 'Confirmar', exact: true }).click();
  await page.waitForURL(`**${caminho}/confirmar`, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `Confirmar Encomenda ${numero}` })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Confirmar Encomenda' }).click();
  // O erro do campo tem de ficar à vista (um zodResolver que recusa em silêncio não chega).
  await expect(page.locator('[aria-invalid="true"], [role="alert"]').first()).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe(`${caminho}/confirmar`);
  await page.goto(caminho);
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Rascunho', { exact: true }).first()).toBeVisible();

  await confirmarEncomenda(page, numero, caminho);

  // CONFIRMADA: já não se edita nem se confirma; converte-se ou cancela-se.
  await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Confirmar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar Encomenda' })).toBeVisible();

  // Converter: confirmação num AlertDialog.
  await page.getByRole('button', { name: 'Converter em Venda' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Converter', exact: true }).click();

  await expect(page.getByText('Concluída', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  expect(new URL(page.url()).pathname).toBe(caminho);
  await page.reload();
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Concluída', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Converter em Venda' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar Encomenda' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Confirmar', exact: true })).toHaveCount(0);
});

test('encomenda-transicoes-129: confirmada → cancelar com AlertDialog sai da listagem', async ({ page }) => {
  test.setTimeout(180_000);
  const { numero, caminho } = await criarEncomenda(page);
  await confirmarEncomenda(page, numero, caminho);

  // Voltar atrás no AlertDialog não cancela.
  await page.getByRole('button', { name: 'Cancelar Encomenda' }).click();
  let dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: /Voltar|Não/ }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Confirmada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // Cancelar de facto.
  await page.getByRole('button', { name: 'Cancelar Encomenda' }).click();
  dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Confirmar cancelamento' }).click();

  await page.waitForURL((url) => url.pathname === '/vendas/pedidos', { timeout: 60_000 });
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: numero, exact: true })).toHaveCount(0);

  // O detalhe da cancelada já não existe (cancelar apaga logicamente): o `notFound()` do detalhe
  // tem de renderizar a página 404. Afirma-se sobre o que é renderizado, não sobre o código HTTP:
  // com `vendas/loading.tsx` (Suspense ao nível da rota) o Next 16 começa o streaming antes de o
  // `notFound()` correr e o código já saiu como 200 — o 404 chega no corpo, não no cabeçalho.
  const resposta = await page.goto(caminho);
  expect([200, 404]).toContain(resposta?.status());
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('This page could not be found')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Encomenda ${numero}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar Encomenda' })).toHaveCount(0);
});
