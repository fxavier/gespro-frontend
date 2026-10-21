/**
 * E2E: Nova factura — erros das linhas aparecem no campo.
 *
 * Defeito: uma linha com quantidade 0 ou preço negativo era recusada pelo
 * `zodResolver`, mas os campos «Qtd» e «Preço Unit.» não renderizavam o seu
 * erro — o botão «Emitir Fatura» não fazia nada visível e o utilizador não
 * percebia porquê (CLAUDE.md: «formulários que se recusam a submeter»).
 *
 * Não deixa nada no tenant `demo`: o formulário é recusado no cliente, e o
 * teste confirma na base que nenhuma linha de factura com a descrição da
 * corrida foi gravada.
 */
import { test, expect } from '@playwright/test';
import { comBaseDados } from './helpers/db';

test('linha com quantidade 0 e preço negativo mostra o erro em cada campo e não grava', async ({ page }) => {
  const descricao = `E2E-65 linha inválida ${Date.now()}`;

  await page.goto('/faturacao/nova');
  await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState('networkidle');

  // Cliente
  const campoCliente = page.getByRole('combobox', { name: /Cliente/ });
  await campoCliente.click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  await popover.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  const opcao = popover.getByRole('option').first();
  await expect(opcao).toHaveText(/^CLI-\d+ — /, { timeout: 15_000 });
  await opcao.click();

  // Datas e linha
  await page.locator('#data-vencimento').fill('2099-12-31');
  await page.getByLabel('Descrição da linha 1').fill(descricao);
  const quantidade = page.getByLabel('Quantidade linha 1');
  const preco = page.getByLabel('Preço unitário linha 1');
  await quantidade.fill('0');
  await preco.fill('-5');

  await page.getByRole('button', { name: 'Emitir Fatura' }).click();

  // As mensagens do schema aparecem junto aos campos da linha.
  await expect(page.getByText('Quantidade positiva')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Preço não negativo')).toBeVisible();
  await expect(quantidade).toHaveAttribute('aria-invalid', 'true');
  await expect(preco).toHaveAttribute('aria-invalid', 'true');

  // Nada foi gravado.
  await expect(page).toHaveURL(/\/faturacao\/nova/);
  const gravadas = await comBaseDados(async (c) => {
    const r = await c.query('SELECT count(*)::int AS n FROM "LinhaFatura" WHERE descricao = $1', [descricao]);
    return r.rows[0].n as number;
  });
  expect(gravadas).toBe(0);
});
