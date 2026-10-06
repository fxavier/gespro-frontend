/**
 * E2E — issue #85 (ADR-0039 §1): a nota de débito escolhe a natureza, e a natureza a conta.
 *
 * /vendas/notas-debito/nova tem o Select «Natureza *» (rótulos de ROTULO_NATUREZA_ND, omissão
 * «Acerto de preço»), a combobox «Conta a crédito» pré-preenchida com a conta por omissão da
 * natureza (Juros de mora → «781 — Juros obtidos» no tenant demo) e a combobox opcional
 * «Factura de referência». Emitir redirige para /vendas/notas-debito, onde a ND nova aparece.
 *
 * ESCREVE NA BASE: cada corrida deixa UMA nota de débito de Juros de mora (1 × 250,00 MT a 16 %)
 * para o cliente Maria Santos no tenant `demo`, com o lançamento correspondente
 * (D 411 / C 781 / C 44331) e a série NOTA_DEBITO avançada. Não há limpeza: documento fiscal
 * emitido não se apaga. Pressupõe a omissão do seed (Juros de mora → 781): se o
 * `37-config-natureza-nota-debito` falhar a meio sem repor, este também falha.
 */

import { test, expect, type Page } from '@playwright/test';
import { abrir, escaparRegex, marca, submeterECapturar } from './helpers/faturacao-ui';

const CLIENTE = 'Maria Santos'; // CLI-0003 do seed comercial

const popoverAberto = (page: Page) => page.locator('[data-radix-popper-content-wrapper]').last();

async function escolherClienteLocal(page: Page, nome: string) {
  const combobox = page.getByRole('combobox', { name: /^Cliente/ });
  await combobox.click();
  const popover = popoverAberto(page);
  const pesquisa = popover.getByRole('combobox').or(popover.getByPlaceholder(/Pesquisar/)).first();
  if (await pesquisa.isVisible().catch(() => false)) await pesquisa.fill(nome);
  const opcao = popover.getByRole('option', { name: new RegExp(escaparRegex(nome)) }).first();
  await expect(opcao, `o cliente ${nome} não aparece`).toBeVisible({ timeout: 15_000 });
  await opcao.click();
  await expect(combobox).toHaveText(new RegExp(escaparRegex(nome)));
}

async function escolherNoSelect(page: Page, nome: RegExp, opcao: string) {
  await page.getByRole('combobox', { name: nome }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
  await expect(page.getByRole('combobox', { name: nome })).toHaveText(new RegExp(escaparRegex(opcao)));
}

test.describe('/vendas/notas-debito/nova — natureza e conta a crédito (#85)', () => {
  test('emite uma ND de Juros de mora com a conta 781 pré-preenchida, e ela aparece na lista', async ({ page }) => {
    test.setTimeout(180_000);
    const m = marca('ND juros');

    await abrir(page, '/vendas/notas-debito/nova', 'Nova Nota de Débito');

    // Natureza: omissão «Acerto de preço»; as cinco opções com o rótulo PT.
    const natureza = page.getByRole('combobox', { name: /^Natureza/ });
    await expect(natureza).toHaveText(/Acerto de preço/);
    await natureza.click();
    for (const rotulo of ['Acerto de preço', 'Juros de mora', 'Despesas repercutidas', 'Penalização', 'Outro']) {
      await expect(page.getByRole('option', { name: rotulo, exact: true }), rotulo).toBeVisible();
    }
    await page.getByRole('option', { name: 'Juros de mora', exact: true }).click();
    await expect(natureza).toHaveText(/Juros de mora/);

    // A conta a crédito vem pré-preenchida com a omissão da natureza.
    const conta = page.getByRole('combobox', { name: /^Conta a crédito/ });
    await expect(conta).toHaveText(/^\s*781 — Juros obtidos/, { timeout: 15_000 });

    // A factura de referência existe e é opcional (não se escolhe aqui).
    await expect(page.getByRole('combobox', { name: /^Factura de referência/ })).toBeVisible();

    await escolherClienteLocal(page, CLIENTE);
    // Mudar de cliente não pode apagar a conta escolhida para a natureza.
    await expect(conta).toHaveText(/^\s*781 — Juros obtidos/);

    await escolherNoSelect(page, /^Motivo/, 'Outro');

    await page.getByLabel(/^Descrição/).first().fill(m);
    await page.getByLabel(/^Preço/).first().fill('250');

    const { numero, corpo } = await submeterECapturar(
      page,
      page.getByRole('button', { name: 'Emitir Nota de Débito' }),
      m,
    );
    expect(numero, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
    expect(corpo, 'a ND tem de ter sido gravada com a natureza escolhida').toContain('"natureza":"JUROS_MORA"');

    await page.waitForURL(/\/vendas\/notas-debito$/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    // A lista ordena por data de emissão: a ND de hoje está na primeira página. Com várias do
    // mesmo dia a ordem entre elas não é garantida — afirma-se a presença, não a posição.
    await expect(page.getByText(numero!, { exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
