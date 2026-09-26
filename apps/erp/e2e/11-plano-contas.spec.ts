/**
 * E2E: plano de contas — detalhe, edição e razão.
 *
 * A rota `[id]` não existia: «Ver detalhe» e a linha clicável davam 404. Por
 * baixo havia um defeito maior — as contas PGC nascem com **uuid** (o
 * bootstrap tem de atribuir ids à mão para ligar pai→filho no `createMany`) e
 * todos os validadores diziam `.cuid()`. Editar, desactivar ou consultar o
 * razão de qualquer conta real era rejeitado na validação.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * 711 Mercadorias, tenant demo — tem lançamentos da facturação seeded.
 *
 * O id é um uuid gerado pelo `tenant-bootstrap` a cada base nova: fixá-lo no
 * teste só servia a base onde foi copiado. Resolve-se pelo código, na própria
 * listagem (pesquisa + clique na linha), e devolve-se o caminho do detalhe.
 */
async function caminhoDaConta(page: Page, codigo: string): Promise<string> {
  await page.goto(`/contabilidade/plano-contas?search=${codigo}`);
  const linha = page.locator('tbody tr').filter({
    has: page.getByRole('cell', { name: codigo, exact: true }),
  });
  await expect(linha).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await linha.click();
  await page.waitForURL(/\/contabilidade\/plano-contas\/[a-z0-9-]+$/, { timeout: 60_000 });
  return new URL(page.url()).pathname;
}

test('a linha da listagem abre o detalhe da conta', async ({ page }) => {
  await page.goto('/contabilidade/plano-contas');
  await expect(page.getByRole('heading', { name: /Plano de Contas/ })).toBeVisible({
    timeout: 30_000,
  });

  await page.locator('tbody tr').first().click();
  // Id em uuid: sem o hífen no padrão isto não casaria.
  await page.waitForURL(/\/contabilidade\/plano-contas\/[a-z0-9-]+$/, { timeout: 60_000 });

  await expect(page.getByText('This page could not be found')).toHaveCount(0);
  await expect(page.locator('#main-content').getByText('Natureza')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hierarquia' })).toBeVisible();
});

test('conta com lançamentos: mostra saldo e tranca os campos estruturais', async ({ page }) => {
  const conta = await caminhoDaConta(page, '711');
  await expect(page.getByRole('heading', { name: /711/ })).toBeVisible({ timeout: 30_000 });

  const principal = page.locator('#main-content');
  await expect(principal.getByText(/Movimento do exercício/)).toBeVisible();
  await expect(principal.getByText('Movimentos', { exact: true })).toBeVisible();

  // A conta mãe é navegável — e chama-se mãe, não pai.
  await expect(principal.getByText('Conta mãe')).toBeVisible();
  await expect(page.getByRole('link', { name: /71 — Vendas/ })).toBeVisible();

  await page.goto(`${conta}/editar`);
  await expect(page.getByLabel('Código')).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByLabel('Nome')).toBeEnabled();

  // E o servidor recusa desactivá-la — a interface diz porquê.
  await page.goto(conta);
  await page.getByRole('button', { name: /Desactivar/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText(/não pode ser desactivada/i);
});

test('o razão escolhe-se na página, sem editar a URL à mão', async ({ page }) => {
  await caminhoDaConta(page, '711');
  await page.getByRole('link', { name: /Ver razão/ }).click();
  await page.waitForURL(/razao-geral\?contaId=/, { timeout: 60_000 });

  // A conta consultada aparece escolhida na caixa — são 434 contas de
  // movimento, e a listagem paginada a 200 deixava-a de fora.
  await expect(page.getByRole('combobox', { name: 'Conta' })).toHaveText(/711 — Mercadorias/);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('tbody tr').first()).toContainText(/MT/);
});
