/**
 * E2E: Requisição de Compra — criação, listagem, filtros e detalhe
 *
 * Fluxos cobertos:
 * 1. Criar nova requisição de compra: o formulário grava e volta à listagem
 *    (`router.push('/compras/requisicoes')`), onde a requisição aparece numerada
 *    pela série (`REQ/aaaa/nnnnnn`) e em RASCUNHO.
 * 2. Listagem, filtro de estado no URL e detalhe com tabs.
 *
 * Deixa no tenant `demo`, a cada corrida: uma requisição em RASCUNHO com o
 * departamento `E2E-02 <carimbo>` e a série REQ avançada um número. Limpeza (os
 * itens caem em cascata):
 *   DELETE FROM "RequisicaoCompra" WHERE departamento LIKE 'E2E-02 %';
 * (a série não se recua — o número fica gasto, como em produção).
 *
 * Usa storageState do admin (wave: após setup).
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';

test.describe('Requisição de Compra', () => {
  test('criar requisição grava um rascunho numerado e volta à listagem', async ({ page }) => {
    // Departamento único por corrida: identifica a linha criada sem depender da ordenação.
    const departamento = `E2E-02 ${Date.now()}`;

    await page.goto('/compras/requisicoes');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Nova Requisição' }).click();
    await expect(page).toHaveURL(/\/compras\/requisicoes\/novo$/);
    await expect(page.getByRole('heading', { name: 'Nova Requisição de Compra' })).toBeVisible({
      timeout: 10_000,
    });
    // Preencher antes da hidratação muda o DOM e não o estado do React.
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Departamento').fill(departamento);
    await page
      .getByLabel(/Justificativa/i)
      .fill('Necessidade de equipamento para o novo colaborador do departamento de TI.');

    // Prioridade (Select Radix) — obrigatório escolher Alta: a linha tem de o mostrar.
    await page.getByRole('combobox').filter({ hasText: /Média|Prioridade/i }).click();
    await page.getByRole('option', { name: 'Alta' }).click();

    await page.getByLabel(/Descrição/i).first().fill('Laptop Dell Latitude 5540');
    await page.getByLabel(/Quantidade/i).first().fill('1');
    await page.getByLabel(/Preço/i).first().fill('85000');

    await page.getByRole('button', { name: /Guardar|Criar|Criar Requisição/i }).click();

    // O produto confirma e navega para a listagem — URL exacto, que `/novo` não satisfaz.
    // `.first()`: o efeito do formulário volta a correr depois da navegação e o toast sai
    // duplicado (defeito do produto, reportado à parte) — aqui só se prova que a confirmação existe.
    await expect(page.getByText('Requisição criada com sucesso!').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/compras\/requisicoes$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible();

    // A requisição criada está na listagem: uma só linha, numerada pela série, em RASCUNHO.
    const linha = page.getByRole('row').filter({ hasText: departamento });
    await expect(linha).toHaveCount(1, { timeout: 15_000 });
    await expect(linha.getByRole('cell').first()).toHaveText(/^REQ\/\d{4}\/\d{6}$/);
    await expect(linha.getByRole('cell', { name: 'Rascunho', exact: true })).toBeVisible();
    await expect(linha.getByRole('cell', { name: 'Alta', exact: true })).toBeVisible();
  });

  test('listagem de requisições carrega sem erros', async ({ page }) => {
    await page.goto('/compras/requisicoes');
    await page.waitForLoadState('domcontentloaded');

    // Título da página
    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    // Aguarda que os KPIs ou a tabela apareçam (sai do skeleton)
    await expect(page.locator('table, [data-empty-state], .animate-pulse').first()).toBeVisible({
      timeout: 15_000,
    });

    // Sem mensagens de erro críticas
    await expect(page.locator('.text-destructive').filter({ hasText: /erro ao carregar/i })).not.toBeVisible();
  });

  test('filtros de estado sincronizam com URL', async ({ page }) => {
    await page.goto('/compras/requisicoes');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    // FilterBar usa native <select> com aria-label="Estado"
    const estadoSelect = page.locator('select[aria-label="Estado"]');
    if (await estadoSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await estadoSelect.selectOption('PENDENTE');

      // URL deve ser atualizado com o filtro
      await expect(page).toHaveURL(/status=PENDENTE/, { timeout: 5_000 });
    }
  });

  test('detalhe de requisição carrega com tabs', async ({ page }) => {
    // Vai para a listagem primeiro
    await page.goto('/compras/requisicoes');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Requisições de Compra' })).toBeVisible({
      timeout: 15_000,
    });

    // Tenta clicar na primeira linha da tabela (se existir)
    const primeiraLinha = page.locator('table tbody tr').first();
    if (await primeiraLinha.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Clica no link da requisição (número)
      const link = primeiraLinha.getByRole('link').first();
      if (await link.isVisible()) {
        await link.click();
        await page.waitForURL(/\/compras\/requisicoes\/[^/]+$/, { timeout: 10_000 });

        // Verifica que o detalhe tem tabs
        await expect(page.getByRole('tab', { name: 'Itens' })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('tab', { name: 'Aprovações' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Histórico' })).toBeVisible();
      }
    }
  });
});
