/**
 * Diários contabilísticos — detalhe e edição.
 *
 * A tabela oferecia «Ver detalhe» e «Editar» para rotas que não existiam: os
 * dois cliques davam 404. Este teste percorre exactamente esse caminho e
 * fecha o ciclo com uma gravação real, para a regressão não voltar calada.
 */

import { test, expect } from '@playwright/test';

test('detalhe de diário abre e a edição grava', async ({ page }) => {
  await page.goto('/contabilidade/diarios');
  await expect(page.getByRole('heading', { name: /Diários Contabilísticos/ })).toBeVisible();

  await page.locator('tbody tr').first().click();
  await page.waitForURL(/\/contabilidade\/diarios\/[a-z0-9]+$/, { timeout: 60_000 });

  const detalheUrl = page.url();
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
  await expect(page.locator('#main-content').getByText('Lançamentos', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: /Editar/ }).click();
  await page.waitForURL(/\/editar$/, { timeout: 60_000 });
  await expect(page.getByLabel('Activo')).toBeVisible();

  // Grava um nome novo e confirma que volta ao detalhe já com ele.
  const nome = page.getByLabel('Nome');
  const original = await nome.inputValue();
  const novo = `${original} ✎`;
  await nome.fill(novo);
  await page.getByRole('button', { name: /Guardar/ }).click();
  await page.waitForURL(detalheUrl, { timeout: 60_000 });
  await expect(page.locator('#main-content')).toContainText(novo);

  // Repõe o estado — a suite corre contra a base de dados de demonstração.
  await page.goto(`${detalheUrl}/editar`);
  await page.getByLabel('Nome').fill(original);
  await page.getByRole('button', { name: /Guardar/ }).click();
  await page.waitForURL(detalheUrl, { timeout: 60_000 });
});

test('o formulário de criação continua sem o interruptor de estado', async ({ page }) => {
  await page.goto('/contabilidade/diarios/novo');
  await expect(page.getByLabel('Código')).toBeVisible();
  await expect(page.getByLabel('Activo')).toHaveCount(0);
});
