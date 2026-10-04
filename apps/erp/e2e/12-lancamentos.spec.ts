/**
 * E2E: lançamentos contabilísticos — detalhe e estorno.
 *
 * `/contabilidade/lancamentos/[id]` e `[id]/estornar` não existiam, embora o
 * menu da tabela e a linha clicável já lá apontassem.
 *
 * O segundo teste precisa de um lançamento ESTORNADO, e o seed não cria
 * nenhum: dependia de um estorno feito à mão numa base concreta, e na CI (base
 * semeada de fresco) o filtro «Estornado» abria vazio — o clique caía na linha
 * do estado vazio e nada navegava (#237). O teste cria por isso a sua
 * pré-condição pela UI: um lançamento manual de reclassificação entre duas
 * contas de existências (classe 2, fora da tesouraria), confirmado e estornado.
 * O par anula-se — nenhum saldo muda —, mas fica na base: conta dois
 * lançamentos a mais no período corrente, que as sentinelas da golden DFC
 * (spec 22) contam. Corre contra uma base descartável (a da CI) ou limpa-o
 * depois (histórico «E2E #237»). Não se semeia no `demo`: mudaria as
 * sentinelas da golden em todas as bases.
 *
 * Limpeza na base local (partidas, depois o estorno — que aponta para o
 * original —, depois o original; a numeração dos lançamentos é por contagem e
 * volta sozinha):
 *
 *   docker exec gespro-db psql -U "$(docker exec gespro-db printenv POSTGRES_USER)" \
 *     -d "$(docker exec gespro-db printenv POSTGRES_DB)" -c "
 *     BEGIN;
 *     DELETE FROM \"PartidaLancamento\" WHERE \"lancamentoId\" IN
 *       (SELECT id FROM \"Lancamento\" WHERE historico LIKE '%E2E #237%');
 *     DELETE FROM \"Lancamento\" WHERE historico LIKE '%E2E #237%' AND tipo = 'ESTORNO';
 *     DELETE FROM \"Lancamento\" WHERE historico LIKE '%E2E #237%';
 *     COMMIT;"
 */

import { test, expect, type Page } from '@playwright/test';

/** Escolhe uma opção num `Combobox` (filtro local) pelo início do rótulo. */
async function escolher(page: Page, caixa: ReturnType<Page['getByRole']>, pesquisa: string, opcao: RegExp) {
  await caixa.click();
  // Scoped ao wrapper do Radix Popover: evita strict mode quando o popover
  // anterior ainda está na animação de fecho e dois inputs coexistem no DOM.
  await page.locator('[data-radix-popper-content-wrapper]').last().getByPlaceholder('Pesquisar…').fill(pesquisa);
  await page.getByRole('option', { name: opcao }).first().click();
  await expect(caixa).toHaveText(opcao);
}

/** Cria, confirma e estorna um lançamento pela UI; devolve o histórico que o identifica. */
async function criarLancamentoEstornado(page: Page): Promise<string> {
  const historico = `Reclassificação de existências — E2E #237 ${Date.now()}`;

  await page.goto('/contabilidade/lancamentos/novo');
  await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');

  await escolher(page, page.getByRole('combobox', { name: /Diário/ }), 'Outros', /Outros/);
  await page.getByPlaceholder('Descrição do lançamento').fill(historico);
  const contas = page.getByRole('combobox', { name: 'Conta' });
  await escolher(page, contas.nth(0), '2633', /^2633 /);
  await escolher(page, contas.nth(1), '2632', /^2632 /);
  await page.getByPlaceholder('0.00').nth(0).fill('2500');
  await page.getByPlaceholder('0.00').nth(1).fill('2500');

  await page.getByRole('button', { name: 'Guardar Lançamento' }).click();
  await page.waitForURL(/\/contabilidade\/lancamentos$/, { timeout: 60_000 });

  // O rascunho abre-se pela listagem, como o utilizador o faria.
  await page.goto(`/contabilidade/lancamentos?q=${encodeURIComponent(historico)}`);
  const linha = page.locator('tbody tr', { hasText: historico });
  await expect(linha).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await linha.click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });

  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  const estornar = page.getByRole('link', { name: /Estornar/ });
  await expect(estornar).toBeVisible({ timeout: 30_000 });

  await estornar.click();
  await page.waitForURL(/\/estornar$/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Motivo').fill('Reclassificação indevida — E2E #237.');
  await page.getByRole('button', { name: 'Estornar lançamento' }).click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });
  await expect(page.locator('#main-content')).toContainText(/Estornado por/, { timeout: 30_000 });

  return historico;
}

test('a linha da listagem abre o detalhe, com as partidas equilibradas', async ({ page }) => {
  await page.goto('/contabilidade/lancamentos');
  await expect(page.getByRole('heading', { name: /Lançamentos Contabilísticos/ })).toBeVisible({
    timeout: 30_000,
  });

  await page.locator('tbody tr').first().click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });

  await expect(page.getByText('This page could not be found')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Lançamento / })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Partidas/ })).toBeVisible();

  // Débitos = créditos: é a definição de partidas dobradas, e a página soma-os
  // em cêntimos inteiros de propósito.
  const totais = page.getByRole('row', { name: /Totais/ });
  const celulas = await totais.locator('td').allInnerTexts();
  expect(celulas[1].trim()).toBe(celulas[2].trim());

  // O estado deixou de aparecer em bruto: «LANCADO» não é português.
  await expect(page.locator('#main-content')).not.toContainText('LANCADO');
});

test('um lançamento estornado mostra o contra-lançamento e recusa novo estorno', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const historico = await criarLancamentoEstornado(page);

  // A partir daqui é o que o teste sempre provou: a listagem filtrada por
  // «Estornado» leva ao detalhe do original.
  await page.goto(`/contabilidade/lancamentos?status=ESTORNADO&q=${encodeURIComponent(historico)}`);
  const primeira = page.locator('tbody tr', { hasText: historico }).filter({ hasNotText: 'ESTORNO:' });
  await expect(primeira).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await primeira.click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });

  await expect(page.locator('#main-content')).toContainText(/Estornado por/);
  // Sem botão de estornar: já foi.
  await expect(page.getByRole('link', { name: /Estornar/ })).toHaveCount(0);

  // E pela URL directa, a página explica em vez de mostrar o formulário.
  await page.goto(`${page.url()}/estornar`);
  await expect(page.locator('#main-content')).toContainText(/já foi estornado/i);
  await expect(page.getByLabel('Motivo')).toHaveCount(0);
});
