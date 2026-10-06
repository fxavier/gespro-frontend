/**
 * E2E — registar pagamento de uma factura (fatura-pdf-pagamento, nó P2).
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato da UI:
 *   - o detalhe de uma factura EMITIDA/PARCIALMENTE_PAGA/VENCIDA mostra a ligação
 *     «Registar pagamento» a quem tem `faturacao:fatura:pagar` (o admin do seed tem);
 *   - /faturacao/<id>/pagamento: cabeçalho «Registar pagamento — <número>», campos
 *     «Valor *» (preenchido com o pendente), «Data do pagamento *», «Forma de
 *     pagamento *» e «Conta bancária» (só quando a forma não é numerário), botão
 *     «Registar pagamento»;
 *   - ao gravar volta ao detalhe, com o estado novo e o Total Pago;
 *   - uma factura que já não é pagável, em /pagamento, redirecciona para o detalhe.
 *
 * Paga por TRANSFERÊNCIA na conta «Millennium bim» (CORRENTE activa do seed, a mesma
 * do 21-nc-proforma-cotacao): numerário dependeria de o admin ter uma sessão de caixa
 * aberta, e o seed não a garante.
 *
 * DEIXA DOCUMENTOS no tenant `demo` a cada corrida: uma factura de 1160,00 (paga) e o
 * lançamento do pagamento (D 12x / C 411). Mesmo método e pressupostos do
 * `21-nc-proforma-cotacao`: corre de preferência contra a base isolada.
 */
import { test, expect, type Page } from '@playwright/test';
import { emitirFatura, esperarEstado, esperarValor, valorAoLado, paraNumero, diaMaputo, escaparRegex } from './helpers/faturacao-ui';

async function abrirDetalhe(page: Page, fatura: { id: string; numero: string }) {
  await page.goto(`/faturacao/${fatura.id}`);
  await expect(page.getByRole('heading', { name: `Factura ${fatura.numero}`, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
}

test.describe('/faturacao/[id]/pagamento — registar pagamento', () => {
  test('pagamento total por transferência: volta ao detalhe com «Paga» e Total Pago = total', async ({ page }) => {
    test.setTimeout(240_000);
    const fatura = await emitirFatura(page); // 1 × 1000 a 16% → 1160,00

    await abrirDetalhe(page, fatura);
    await esperarEstado(page, 'Emitida');

    const ligacao = page.getByRole('link', { name: 'Registar pagamento', exact: true });
    await expect(ligacao).toBeVisible({ timeout: 20_000 });
    await ligacao.click();
    await page.waitForURL(new RegExp(`/faturacao/${fatura.id}/pagamento$`), { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: `Registar pagamento — ${fatura.numero}`, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // Valor pré-preenchido com o pendente (factura sem pagamentos: o total).
    const valor = page.getByLabel(/^Valor\s*\*?$/);
    await expect
      .poll(async () => paraNumero(await valor.inputValue()), { message: 'Valor pré-preenchido com o pendente' })
      .toBe(1160);

    await page.getByLabel(/^Data do pagamento\s*\*?$/).fill(diaMaputo(0));

    // Numerário esconde a conta bancária; transferência mostra-a.
    const forma = page.getByRole('combobox', { name: /Forma de pagamento/ });
    await forma.click();
    await page.getByRole('option', { name: 'Numerário' }).click();
    await expect(forma).toHaveText(/Numerário/);
    await expect(page.getByRole('combobox', { name: /Conta bancária/ })).toHaveCount(0);

    await forma.click();
    await page.getByRole('option', { name: 'Transferência bancária' }).click();
    await expect(forma).toHaveText(/Transferência bancária/);

    const conta = page.getByRole('combobox', { name: /Conta bancária/ });
    await expect(conta).toBeVisible();
    await conta.click();
    await page.getByRole('option', { name: /Millennium bim/ }).first().click();
    await expect(conta).toHaveText(/Millennium bim/);

    await page.getByRole('button', { name: 'Registar pagamento', exact: true }).click();
    await page.waitForURL(new RegExp(`/faturacao/${escaparRegex(fatura.id)}$`), { timeout: 60_000 });

    await esperarEstado(page, 'Paga');
    await esperarValor(valorAoLado(page, 'Total Pago').first(), 1160, 'Total Pago depois do pagamento');
    await esperarValor(valorAoLado(page, 'Pendente').first(), 0, 'Pendente depois do pagamento');

    // Paga: já não oferece o pagamento, e a rota devolve ao detalhe.
    await expect(page.getByRole('link', { name: 'Registar pagamento', exact: true })).toHaveCount(0);
    await page.goto(`/faturacao/${fatura.id}/pagamento`);
    await page.waitForURL(new RegExp(`/faturacao/${escaparRegex(fatura.id)}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Factura ${fatura.numero}`, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  });
});
