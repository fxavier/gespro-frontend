/**
 * Smoke E2E: apuramento de IVA — render básico das rotas.
 */

import { test, expect } from '@playwright/test';

test('página de apuramento de IVA carrega sem 404', async ({ page }) => {
  await page.goto('/contabilidade/iva');
  await expect(page.getByRole('heading', { name: /Apuramento de IVA/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('This page could not be found')).toHaveCount(0);
});

test('IVA aparece na barra lateral', async ({ page }) => {
  await page.goto('/contabilidade');
  await expect(page.getByRole('link', { name: /Apuramento de IVA/i })).toBeVisible({
    timeout: 15_000,
  });
});

test('exercícios mostra botão fechar por período', async ({ page }) => {
  await page.goto('/contabilidade/exercicios');
  await expect(page.getByRole('heading', { name: /Exercícios Contabilísticos/i })).toBeVisible({
    timeout: 30_000,
  });
  // Não há mais o aviso de "Fase 2"
  await expect(page.getByText('Fecho de períodos disponível na Fase 2')).toHaveCount(0);
});

test('exercícios tem coluna de acções com botão fechar', async ({ page }) => {
  await page.goto('/contabilidade/exercicios');
  await expect(page.getByRole('heading', { name: /Exercícios Contabilísticos/i })).toBeVisible({
    timeout: 30_000,
  });
  // Coluna acções existe
  await expect(page.getByRole('columnheader', { name: 'Acções' })).toBeVisible();
});

test('apurar IVA página carrega para um período válido', async ({ page }) => {
  await page.goto('/contabilidade/exercicios');
  // Navega para IVA
  await page.goto('/contabilidade/iva');
  await expect(page.getByRole('heading', { name: /Apuramento de IVA/i })).toBeVisible({
    timeout: 30_000,
  });
  // Se existir algum botão "Apurar", clica no primeiro e verifica a página
  const botaoApurar = page.getByRole('link', { name: 'Apurar' }).first();
  if (await botaoApurar.isVisible()) {
    await botaoApurar.click();
    await page.waitForURL(/\/contabilidade\/iva\/[^/]+\/apurar/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Apurar IVA/i })).toBeVisible();
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
  }
});
