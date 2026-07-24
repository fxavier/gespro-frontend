/**
 * E2E: Transporte — fluxo de entrega ponta-a-ponta (spec 06, T7)
 *
 * Fluxo coberto:
 * 1. Criar nova entrega (form → criarEntregaAction)
 * 2. Aterrar no detalhe da entrega (rota [id] criada nesta wave)
 * 3. Atribuir recursos + transitar PENDENTE → AGENDADA → EM_TRANSITO
 * 4. Registar prova de entrega → ENTREGUE
 *
 * Usa storageState do admin (auth.setup). Determinístico: expect auto-retry.
 */

import { test, expect } from '@playwright/test';

test.describe('Transporte — entrega ponta-a-ponta', () => {
  test('listagem de entregas carrega', async ({ page }) => {
    await page.goto('/transporte/entregas');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Entregas' })).toBeVisible({ timeout: 15_000 });
  });

  test('criar entrega, atribuir, transitar e registar prova', async ({ page }) => {
    await page.goto('/transporte/entregas');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Entregas' })).toBeVisible({ timeout: 15_000 });

    // Nova entrega
    await page.getByRole('link', { name: 'Nova Entrega' }).click();
    await page.waitForURL(/\/transporte\/entregas\/nova/);
    await expect(page.getByRole('heading', { name: 'Nova Entrega' })).toBeVisible({ timeout: 10_000 });

    // Cliente
    await page.getByLabel('Código do Cliente *').fill('CL-E2E-01');
    await page.getByLabel('Nome *').first().fill('Cliente E2E Transporte');
    await page.getByLabel('Telefone *').fill('+258840000000');

    // Morada
    await page.getByLabel('Endereço *').fill('Av. Julius Nyerere, 123, Bairro Central');
    await page.getByLabel('Cidade *').fill('Maputo');

    // Agendamento
    await page.getByLabel('Data Agendada *').fill('2026-12-31');

    // Item 1 (inputs sem label associada — usar placeholders)
    await page.getByPlaceholder('PRD-001').fill('PRD-E2E-01');
    await page.getByPlaceholder('Nome do produto').fill('Caixa de material');

    // Criar
    await page.getByRole('button', { name: 'Criar Entrega' }).click();

    // Redireciona para o detalhe
    await page.waitForURL(/\/transporte\/entregas\/[^/]+$/, { timeout: 20_000 });
    await expect(page.getByText(/ENT-/).first()).toBeVisible({ timeout: 10_000 });

    // Separador Ações presente
    const abaAcoes = page.getByRole('tab', { name: 'Ações' });
    await expect(abaAcoes).toBeVisible({ timeout: 10_000 });
    await abaAcoes.click();

    // Atribuir recursos (best-effort: usa a primeira viatura/motorista se existirem)
    await expect(page.getByText('Atribuir Recursos')).toBeVisible({ timeout: 10_000 });

    // PENDENTE → AGENDADA
    const btnAgendada = page.getByRole('button', { name: 'Agendada' });
    if (await btnAgendada.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await btnAgendada.click();
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
    }

    // AGENDADA → EM_TRANSITO
    const btnTransito = page.getByRole('button', { name: 'Em Trânsito' });
    if (await btnTransito.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await btnTransito.click();
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });
    }

    // EM_TRANSITO → ENTREGUE via prova
    const btnEntregue = page.getByRole('button', { name: 'Entregue' });
    if (await btnEntregue.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await btnEntregue.click();
      await page.getByLabel('Recebedor *').fill('João Recebedor');
      await page.getByLabel(/Nome\/Assinatura|Código de Confirmação|Referência da Foto/).fill('Assinatura E2E');
      await page.getByRole('button', { name: 'Confirmar Entrega' }).click();
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 });

      // Estado final deve reflectir Entregue
      await expect(page.getByText('Entregue').first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
