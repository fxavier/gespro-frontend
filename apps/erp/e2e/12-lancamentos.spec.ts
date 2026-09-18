/**
 * E2E: lançamentos contabilísticos — detalhe e estorno.
 *
 * `/contabilidade/lancamentos/[id]` e `[id]/estornar` não existiam, embora o
 * menu da tabela e a linha clicável já lá apontassem.
 *
 * O teste não estorna nada: um estorno cria um contra-lançamento definitivo
 * (append-only, ADR e regra do CLAUDE.md) e cada corrida sujaria o razão da
 * base de demonstração. O caminho de escrita foi verificado à mão; aqui
 * cobrem-se as leituras e as recusas, que é onde a regressão se esconde.
 */

import { test, expect } from '@playwright/test';

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
  await page.goto('/contabilidade/lancamentos?status=ESTORNADO');
  const primeira = page.locator('tbody tr').first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
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
