/**
 * E2E — issue #78: o pagamento a fornecedor sai do meio por onde foi pago.
 *
 * 1. Numerário: o admin tem (ou abre) uma sessão de caixa, paga uma conta a pagar
 *    em aberto do seed em «Numerário», vê o pagamento no detalhe da conta e o
 *    movimento «Pagamento» no detalhe da sessão de caixa.
 * 2. Transferência bancária: escolhe a conta bancária num campo «Conta bancária»
 *    e vê o pagamento no detalhe da conta.
 *
 * Dados só pela UI (nunca INSERT). Valores pequenos e referência única por corrida,
 * para a conta continuar em aberto e o teste poder repetir-se.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** Garante uma sessão ABERTA do admin e devolve o URL do seu detalhe (/caixa/<id>). */
async function sessaoDeCaixaAberta(page: Page): Promise<string> {
  await page.goto('/caixa/fechamento');
  await expect(page.getByRole('heading', { name: 'Fecho de Caixa' })).toBeVisible({ timeout: 30_000 });

  const semSessao = page.getByText('Sem Sessão Activa');
  const comSessao = page.getByText('Sessão a Fechar');
  await expect(semSessao.or(comSessao)).toBeVisible({ timeout: 15_000 });

  if (await semSessao.isVisible()) {
    await page.goto('/caixa/abertura');
    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    const checkboxes = page.locator('[role="checkbox"]');
    const n = await checkboxes.count();
    for (let i = 0; i < n; i++) await checkboxes.nth(i).click();
    await page.getByRole('button', { name: 'Prosseguir' }).click();
    await page.getByLabel(/Fundo Inicial/i).fill('5000');
    await page.getByRole('button', { name: 'Confirmar Abertura' }).click();
    await page.waitForURL((u) => !u.pathname.endsWith('/abertura'), { timeout: 30_000 });

    await page.goto('/caixa/fechamento');
    await expect(comSessao).toBeVisible({ timeout: 30_000 });
  }

  // Número da sessão do próprio utilizador, tal como o fecho o mostra
  const numero = (
    await page.locator('p', { hasText: /^Número$/ }).locator('xpath=following-sibling::p[1]').first().innerText()
  ).trim();
  expect(numero).not.toBe('');

  await page.goto('/caixa');
  await expect(page.getByRole('heading', { name: /Gestão de Caixa/ })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.locator('tbody tr', { hasText: numero }).first().click();
  await page.waitForURL(/\/caixa\/[a-z0-9-]+$/, { timeout: 60_000 });
  return new URL(page.url()).pathname;
}

/** Abre o formulário de pagamento de uma conta a pagar em aberto do seed; devolve o URL do detalhe. */
async function abrirPagamentoDeContaEmAberto(page: Page): Promise<string> {
  for (const status of ['ABERTA', 'PARCIALMENTE_PAGA', 'VENCIDA']) {
    await page.goto(`/fornecedores/contas-pagar?status=${status}`);
    await page.waitForLoadState('networkidle');
    const linha = page.locator('tbody tr').filter({ has: page.locator('td') }).first();
    if (!(await linha.isVisible({ timeout: 10_000 }).catch(() => false))) continue;
    if (/Nenhum|Sem resultados|Ainda não/i.test(await linha.innerText())) continue;
    await linha.click();
    await page.waitForURL(/\/fornecedores\/contas-pagar\/[a-z0-9-]+$/, { timeout: 60_000 });
    const detalhe = new URL(page.url()).pathname;
    await page.goto(`${detalhe}/pagar`);
    await expect(page.getByRole('button', { name: 'Registar pagamento' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    return detalhe;
  }
  throw new Error('O seed não tem nenhuma conta a pagar em aberto');
}

async function escolherForma(page: Page, rotulo: string) {
  await page.getByRole('combobox', { name: 'Forma de pagamento' }).click();
  await page.getByRole('option', { name: rotulo, exact: true }).click();
}

async function preencherESubmeter(page: Page, detalhe: string, valor: string, referencia: string) {
  await page.locator('#valor').fill(valor);
  await page.locator('#referencia').fill(referencia);
  await page.getByRole('button', { name: 'Registar pagamento' }).click();
  await page.waitForURL((u) => u.pathname === detalhe, { timeout: 30_000 });
}

test('Numerário: pagamento sai da caixa e aparece como «Pagamento» na sessão', async ({ page }) => {
  test.setTimeout(180_000);
  const sessaoUrl = await sessaoDeCaixaAberta(page);

  const detalhe = await abrirPagamentoDeContaEmAberto(page);
  const referencia = `E2E-78-NUM-${Date.now()}`;
  await escolherForma(page, 'Numerário');
  await preencherESubmeter(page, detalhe, '1.37', referencia);

  // Detalhe da conta: o pagamento está lá, em numerário, com lançamento
  const linhaPagamento = page.locator('tbody tr', { hasText: referencia });
  await expect(linhaPagamento).toBeVisible({ timeout: 30_000 });
  await expect(linhaPagamento).toContainText('Numerário');
  await expect(linhaPagamento.getByRole('link', { name: /Ver lançamento/ })).toBeVisible();

  // Detalhe da sessão de caixa: movimento «Pagamento» pelo valor pago
  await page.goto(sessaoUrl);
  await expect(page.getByRole('heading', { name: /Movimentos/ })).toBeVisible({ timeout: 30_000 });
  const movimento = page
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'Pagamento', exact: true }) });
  await expect(movimento.first()).toBeVisible({ timeout: 15_000 });
  await expect(movimento.filter({ hasText: /1,37/ }).first()).toBeVisible();
});

test('Transferência bancária: escolhe a conta bancária e o pagamento fica registado', async ({ page }) => {
  test.setTimeout(120_000);
  const detalhe = await abrirPagamentoDeContaEmAberto(page);
  const referencia = `E2E-78-TRF-${Date.now()}`;

  await escolherForma(page, 'Transferência bancária');
  const campoConta = page.getByRole('combobox', { name: /Conta bancária/ });
  await expect(campoConta).toBeVisible({ timeout: 10_000 });
  await campoConta.click();
  await page.getByRole('option').first().click();

  await preencherESubmeter(page, detalhe, '2.41', referencia);

  const linhaPagamento = page.locator('tbody tr', { hasText: referencia });
  await expect(linhaPagamento).toBeVisible({ timeout: 30_000 });
  await expect(linhaPagamento).toContainText('Transferência bancária');
  await expect(linhaPagamento.getByRole('link', { name: /Ver lançamento/ })).toBeVisible();
});
