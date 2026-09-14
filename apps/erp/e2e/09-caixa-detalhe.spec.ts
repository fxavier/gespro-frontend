/**
 * Sessão de caixa — detalhe.
 *
 * A listagem oferecia «Ver detalhe» e linhas clicáveis para `/caixa/[id]`,
 * uma rota que não existia (404). O clique na linha falhava por outra razão:
 * as datas eram formatadas sem fuso fixo, o servidor e o browser produziam
 * horas diferentes e o React descartava a árvore por falha de hidratação,
 * levando com ela o handler de navegação. Este teste cobre os dois caminhos.
 */

import { test, expect } from '@playwright/test';

test('clicar na linha abre o detalhe da sessão', async ({ page }) => {
  await page.goto('/caixa');
  await expect(page.getByRole('heading', { name: /Gestão de Caixa/ })).toBeVisible();

  await page.locator('tbody tr').first().click();
  await page.waitForURL(/\/caixa\/[a-z0-9]+$/, { timeout: 60_000 });

  await expect(page.getByText('This page could not be found')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Sessão / })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Movimentos/ })).toBeVisible();
  await expect(page.locator('dt').filter({ hasText: /^Saldo esperado/ })).toBeVisible();
});

test('«Ver detalhe» no menu de acções vai para a mesma página', async ({ page }) => {
  await page.goto('/caixa');
  await page.locator('tbody tr').first().getByRole('button', { name: /Acções/ }).click();
  await page.getByRole('menuitem', { name: 'Ver detalhe' }).click();
  await page.waitForURL(/\/caixa\/[a-z0-9]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /^Sessão / })).toBeVisible();
});

test('a hora da sessão é a mesma no servidor e no cliente', async ({ page }) => {
  // Se voltar a haver divergência de fuso, o React emite o erro de hidratação
  // e os cliques na tabela deixam de funcionar — sem nada visível no ecrã.
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto('/caixa');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  expect(erros.filter((e) => /Hydration failed/i.test(e))).toEqual([]);
});
