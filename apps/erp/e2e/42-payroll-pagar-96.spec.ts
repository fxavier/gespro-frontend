/**
 * E2E — payroll-pagar-96: «Marcar como paga» da folha vira rota com meio, conta e data (#96).
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato da UI (molde: /faturacao/[id]/pagamento):
 *   - em /rh/payroll, uma folha PROCESSADO oferece «Marcar como paga» como LIGAÇÃO para
 *     /rh/payroll/folhas/<id>/pagar (sem modal, sem pagar no clique);
 *   - a rota é uma página completa: cabeçalho de nível 1 sobre o pagamento da folha, campos
 *     «Data do pagamento *», «Forma de pagamento *» e «Conta bancária» (só quando a forma
 *     não é numerário), botão «Registar pagamento»; nenhum diálogo;
 *   - ao gravar volta a /rh/payroll e a folha deixa de oferecer «Marcar como paga»;
 *   - uma folha que já não está PROCESSADO, em /pagar, redirecciona para /rh/payroll.
 *
 * Paga por TRANSFERÊNCIA na conta «Millennium bim» (CORRENTE activa do seed, a mesma do
 * 40-fatura-pagamento): numerário dependeria de o admin ter sessão de caixa aberta.
 *
 * Dados: se não houver folha PROCESSADO no tenant `demo`, processa a primeira PENDENTE
 * («Processar na contabilidade», UI existente). Sem nenhuma das duas, o teste salta.
 * DEIXA no `demo` uma folha PAGO (irreversível) e os lançamentos da massa salarial e do
 * pagamento (D 4622 / C 12x) — corre de preferência contra a base isolada.
 */
import { test, expect } from '@playwright/test';
import { diaMaputo, escaparRegex } from './helpers/faturacao-ui';

const LISTA = '/rh/payroll';
const ROTA_PAGAR = /^\/rh\/payroll\/folhas\/([^/?#]+)\/pagar$/;

test.describe('/rh/payroll/folhas/[id]/pagar — pagar a folha (payroll-pagar-96)', () => {
  test('pagamento por transferência numa rota própria: volta à lista e a folha deixa de ser pagável', async ({ page }) => {
    test.setTimeout(240_000);

    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');

    const ligacoesPagar = page.getByRole('link', { name: 'Marcar como paga', exact: true });
    if ((await ligacoesPagar.count()) === 0) {
      const processar = page.getByRole('button', { name: 'Processar na contabilidade' });
      test.skip((await processar.count()) === 0, 'payroll-pagar-96: o tenant demo não tem folha PENDENTE nem PROCESSADO');
      await processar.first().click();
      await expect(ligacoesPagar.first()).toBeVisible({ timeout: 60_000 });
    }

    // «Marcar como paga» é uma ligação para a rota — nunca um botão que paga no clique.
    const href = await ligacoesPagar.first().getAttribute('href');
    expect(href, 'href da ligação «Marcar como paga»').toMatch(ROTA_PAGAR);
    const folhaId = ROTA_PAGAR.exec(href!)![1];

    await ligacoesPagar.first().click();
    await page.waitForURL(new RegExp(`/rh/payroll/folhas/${escaparRegex(folhaId)}/pagar$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: /pag/i })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog'), 'sem modais: a recolha é numa rota').toHaveCount(0);

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
    await page.waitForURL(/\/rh\/payroll(\?.*)?$/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle');

    // Paga: a folha já não oferece o pagamento…
    await expect(page.locator(`a[href="/rh/payroll/folhas/${folhaId}/pagar"]`)).toHaveCount(0, { timeout: 30_000 });

    // …e a rota devolve à lista.
    await page.goto(`/rh/payroll/folhas/${folhaId}/pagar`);
    await page.waitForURL(/\/rh\/payroll(\?.*)?$/, { timeout: 30_000 });
  });
});
