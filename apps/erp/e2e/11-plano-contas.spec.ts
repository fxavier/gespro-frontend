/**
 * E2E: plano de contas — detalhe, edição e razão.
 *
 * A rota `[id]` não existia: «Ver detalhe» e a linha clicável davam 404. Por
 * baixo havia um defeito maior — as contas PGC nascem com **uuid** (o
 * bootstrap tem de atribuir ids à mão para ligar pai→filho no `createMany`) e
 * todos os validadores diziam `.cuid()`. Editar, desactivar ou consultar o
 * razão de qualquer conta real era rejeitado na validação.
 */

import { test, expect } from '@playwright/test';

/** 711 Mercadorias, tenant demo — tem lançamentos da facturação seeded. */
const COM_MOVIMENTO = '99860c43-83f7-4b41-ae1d-9e895920452a';

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
  await page.goto(`/contabilidade/plano-contas/${COM_MOVIMENTO}`);
  await expect(page.getByRole('heading', { name: /711/ })).toBeVisible({ timeout: 30_000 });

  const principal = page.locator('#main-content');
  await expect(principal.getByText(/Movimento do exercício/)).toBeVisible();
  await expect(principal.getByText('Movimentos', { exact: true })).toBeVisible();

  // A conta mãe é navegável — e chama-se mãe, não pai.
  await expect(principal.getByText('Conta mãe')).toBeVisible();
  await expect(page.getByRole('link', { name: /71 — Vendas/ })).toBeVisible();

  await page.goto(`/contabilidade/plano-contas/${COM_MOVIMENTO}/editar`);
  await expect(page.getByLabel('Código')).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByLabel('Nome')).toBeEnabled();

  // E o servidor recusa desactivá-la — a interface diz porquê.
  await page.goto(`/contabilidade/plano-contas/${COM_MOVIMENTO}`);
  await page.getByRole('button', { name: /Desactivar/ }).click();
  await expect(page.getByRole('alertdialog')).toContainText(/não pode ser desactivada/i);
});

test('o razão escolhe-se na página, sem editar a URL à mão', async ({ page }) => {
  await page.goto(`/contabilidade/plano-contas/${COM_MOVIMENTO}`);
  await page.getByRole('link', { name: /Ver razão/ }).click();
  await page.waitForURL(/razao-geral\?contaId=/, { timeout: 60_000 });

  // A conta consultada aparece escolhida na caixa — são 434 contas de
  // movimento, e a listagem paginada a 200 deixava-a de fora.
  await expect(page.getByRole('combobox', { name: 'Conta' })).toHaveText(/711 — Mercadorias/);
  await expect(page.getByRole('table')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('tbody tr').first()).toContainText(/MT/);
});
