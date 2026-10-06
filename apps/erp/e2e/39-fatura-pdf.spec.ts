/**
 * E2E — «Descarregar PDF» da factura (fatura-pdf-pagamento, nó P1).
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato:
 *   1. Na lista /faturacao, o menu «⋯» de uma linha (botão «Ações para esta fatura»)
 *      tem «Descarregar PDF», e esse item descarrega de facto um ficheiro: um evento
 *      `download` do Playwright, vindo de /api/faturacao/<id>/pdf, cujo nome sugerido
 *      termina em .pdf e cujo conteúdo começa por «%PDF».
 *   2. No detalhe dessa factura, «Descarregar PDF» existe e aponta para
 *      /api/faturacao/<id>/pdf (#133 — guarda contra regressão).
 *
 * Hoje o item do menu é um `DropdownMenuItem` sem `href` nem `onSelect`
 * (`faturas-table.tsx`): o clique fecha o menu e não pede nada — o
 * `waitForEvent('download')` estoura.
 *
 * Só lê: não cria nem transita documentos. Precisa de pelo menos uma factura no
 * tenant `demo` (o seed tem 104).
 */
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.describe('/faturacao — Descarregar PDF', () => {
  test('menu ⋯ da lista descarrega o PDF da factura e o detalhe aponta para a mesma rota', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/faturacao');
    await expect(page.getByRole('heading', { name: 'Faturação', level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const primeiraLinha = page.locator('tbody tr').first();
    await expect(primeiraLinha, 'a lista de facturas está vazia — o seed demo tem de ter facturas').toBeVisible({
      timeout: 20_000,
    });

    // O id da factura sai do «Ver detalhe» do próprio menu (ligação para /faturacao/<id>).
    await primeiraLinha.getByRole('button', { name: 'Ações para esta fatura' }).click();
    const verDetalhe = page.getByRole('menuitem', { name: 'Ver detalhe' });
    await expect(verDetalhe).toBeVisible({ timeout: 10_000 });
    const hrefDetalhe = await verDetalhe.getAttribute('href');
    expect(hrefDetalhe, '«Ver detalhe» deve ligar a /faturacao/<id>').toMatch(/^\/faturacao\/[^/]+$/);
    const id = hrefDetalhe!.split('/').pop()!;

    const descarregar = page.getByRole('menuitem', { name: 'Descarregar PDF' });
    await expect(descarregar).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      descarregar.click(),
    ]);

    expect(new URL(download.url()).pathname).toBe(`/api/faturacao/${id}/pdf`);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(await download.failure()).toBeNull();
    const caminho = await download.path();
    expect(caminho, 'o download não chegou a disco').toBeTruthy();
    const conteudo = await readFile(caminho!);
    expect(conteudo.subarray(0, 4).toString('latin1')).toBe('%PDF');

    // Detalhe da mesma factura: o botão existe sempre e aponta para a rota fiscal.
    await page.goto(`/faturacao/${id}`);
    await expect(page.getByRole('heading', { name: /^Factura /, level: 1 })).toBeVisible({ timeout: 30_000 });
    const pdfDetalhe = page.getByRole('link', { name: 'Descarregar PDF' });
    await expect(pdfDetalhe).toBeVisible();
    await expect(pdfDetalhe).toHaveAttribute('href', `/api/faturacao/${id}/pdf`);
  });
});
