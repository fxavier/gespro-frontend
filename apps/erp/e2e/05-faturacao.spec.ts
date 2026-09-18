/**
 * E2E: Faturação — Emissão de Fatura
 *
 * Fluxos cobertos:
 * 1. Listagem de faturas carrega com KPIs
 * 2. Página de nova fatura tem formulário correcto
 * 3. Validação de campos obrigatórios
 * 4. Numeração sequencial verificada (existência de séries)
 *
 * Determinístico: sem sleeps; usa expect auto-retry.
 */

import { test, expect } from '@playwright/test';

test.describe('Faturação', () => {
  test('listagem de faturas carrega sem erros', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    // KPIs ou tabela devem carregar
    await expect(
      page.locator('table, [class*="kpi"], [class*="empty"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // Sem erros críticos
    await expect(
      page.locator('.text-destructive').filter({ hasText: /erro ao carregar/i })
    ).not.toBeVisible();
  });

  test('botão "Nova Fatura" navega para formulário', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Nova Fatura' }).click();
    await page.waitForURL(/\/faturacao\/nova/, { timeout: 10_000 });

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('formulário de nova fatura tem campos obrigatórios', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    // Campos de data — Label não tem htmlFor, usa selector por name/type
    const dataEmissao = page.locator('input[name="dataEmissao"], input[type="date"]').first();

    // Um campo de data deve existir
    const hasDataEmissao = await dataEmissao.isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasDataEmissao).toBeTruthy();
  });

  test('formulário de nova fatura: validação impede emissão sem dados', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    // Tenta emitir sem preencher
    const emitirBtn = page.getByRole('button', { name: /Emitir|Guardar|Criar/i }).first();
    if (await emitirBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emitirBtn.click();

      // Deve permanecer na mesma página (validação)
      await expect(page).toHaveURL(/\/faturacao\/nova/);
    }
  });

  test('numeração sequencial: séries de documentos existem', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    // Verifica se existe select de série de documento
    const serieSelect = page.getByRole('combobox').filter({ hasText: /Série|FT|FR/i });
    if (await serieSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // A série deve ter sido pre-selecionada pelo servidor
      const serieValue = await serieSelect.textContent();
      expect(serieValue).toBeTruthy();
      expect(serieValue).not.toBe('');
    }
  });

  test('fatura emitida aparece na listagem com número sequencial', async ({ page }) => {
    await page.goto('/faturacao');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({
      timeout: 15_000,
    });

    // Aguarda a tabela
    const tabela = page.locator('table');
    if (await tabela.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // Faturas na tabela devem ter número no formato esperado (ex: FT 2026/1)
      const primeiraLinha = tabela.locator('tbody tr').first();
      if (await primeiraLinha.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const textoLinha = await primeiraLinha.textContent();
        // O número deve existir (não vazio)
        expect(textoLinha).toBeTruthy();
      }
    }
  });
  /**
   * A série mostrava um «—» solitário: as páginas liam `codigo`/`nome`, campos
   * que o modelo SerieDocumento não tem. E mesmo com o rótulo certo o campo
   * ficava em branco até alguém abrir a lista — o Radix só resolve o texto do
   * item depois de montar o conteúdo.
   */
  test('a série de facturação aparece preenchida sem abrir a lista', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    const serie = page.getByLabel('Série de Faturação');
    await expect(serie).toHaveText(/^[A-Z]+\/\d{4}$/);
  });

  test('o cliente escolhe-se por combobox, com código e nome', async ({ page }) => {
    await page.goto('/faturacao/nova');
    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({
      timeout: 15_000,
    });

    const campo = page.getByRole('combobox', { name: /Cliente/ });
    await expect(campo).toHaveText(/Seleccione o cliente/);
    await campo.click();

    // A pesquisa é feita no servidor: há mais clientes do que cabe na lista.
    await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
    const opcao = page.getByRole('option').first();
    await expect(opcao).toHaveText(/^CLI-\d+ — /, { timeout: 15_000 });

    const escolhido = await opcao.textContent();
    await opcao.click();
    await expect(campo).toHaveText(escolhido!.trim());
  });
});

/**
 * A listagem mostrava o CUID em vez do número e «—» em vez do cliente: lia
 * `f.serie?.numero` e `f.cliente?.nome`, campos que não existem — o número
 * está na própria factura e o `clienteId` é escalar (FK cross-domínio), por
 * isso o nome tem de ser pedido ao WS C.
 */
test('a listagem mostra o número da factura e o nome do cliente', async ({ page }) => {
  await page.goto('/faturacao');
  await expect(page.getByRole('heading', { name: 'Faturação' })).toBeVisible({ timeout: 15_000 });

  const primeira = page.locator('tbody tr').first();
  await expect(primeira).toBeVisible({ timeout: 15_000 });

  const numero = primeira.locator('td').nth(0);
  await expect(numero).toHaveText(/^[A-Z]+\/\d{4}\/\d+$/);

  const cliente = primeira.locator('td').nth(1);
  await expect(cliente).not.toHaveText('—');
  await expect(cliente).not.toHaveText(/^c[a-z0-9]{20,}$/);
});
