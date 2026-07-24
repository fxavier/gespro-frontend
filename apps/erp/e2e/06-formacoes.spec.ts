/**
 * E2E: Formação (RH) → Criar → Aparece na lista → Detalhe → Transitar estado
 *
 * Fluxos cobertos:
 * 1. Criar nova formação a partir de /rh/formacoes/nova
 * 2. Redireccionamento para o detalhe e verificação dos dados
 * 3. Transitar o estado (PLANEADA → Iniciar → EM_ANDAMENTO)
 * 4. A formação aparece na listagem
 *
 * Usa storageState do admin (após setup). Determinístico: sem sleeps.
 */

import { test, expect } from '@playwright/test';

test.describe('Formação (RH)', () => {
  const titulo = `Formação E2E ${Date.now()}`;

  test('criar formação, ver detalhe e transitar estado', async ({ page }) => {
    // Listagem
    await page.goto('/rh/formacoes');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Formações' })).toBeVisible({ timeout: 15_000 });

    // Nova Formação
    await page.getByRole('link', { name: 'Nova Formação' }).click();
    await page.waitForURL(/\/rh\/formacoes\/nova/);
    await expect(page.getByRole('heading', { name: 'Nova Formação' })).toBeVisible({ timeout: 10_000 });

    // Preenche o formulário (react-hook-form + CreateFormacaoSchema)
    await page.getByLabel('Título').fill(titulo);
    await page.getByLabel('Descrição').first().fill('Formação criada por teste E2E — conteúdos de exemplo.');
    await page.getByLabel('Categoria').fill('Segurança');
    await page.getByLabel('Instrutor / Entidade').fill('Instituto de Formação');
    await page.getByLabel('Local').fill('Sala 1 — Maputo');

    // Carga horária / vagas / custo — inputs numéricos
    await page.getByLabel('Carga Horária (horas)').fill('16');
    await page.getByLabel('Vagas Disponíveis').fill('5');
    await page.getByLabel('Custo Total (MZN)').fill('12000');

    // Guardar → redirecciona para o detalhe
    await page.getByRole('button', { name: /Guardar Formação/i }).click();
    await page.waitForURL(/\/rh\/formacoes\/[^/]+$/, { timeout: 15_000 });

    // Detalhe mostra o título e o estado inicial PLANEADA
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Planeada').first()).toBeVisible({ timeout: 10_000 });

    // Transitar estado: Iniciar (PLANEADA → EM_ANDAMENTO)
    await page.getByRole('button', { name: /Iniciar/i }).click();
    await expect(page.getByText('Em Andamento').first()).toBeVisible({ timeout: 10_000 });

    // Aparece na listagem
    await page.goto('/rh/formacoes');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Formações' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 15_000 });
  });

  test('listagem de formações carrega sem erros', async ({ page }) => {
    await page.goto('/rh/formacoes');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Formações' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('table, [role="status"], .animate-pulse').first()).toBeVisible({ timeout: 15_000 });
  });
});
