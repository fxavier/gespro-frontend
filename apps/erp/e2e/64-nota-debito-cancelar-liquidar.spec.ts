/**
 * E2E — issue #565: o detalhe da nota de débito e as duas acções dela (cancelar e liquidar).
 *
 * Da lista /vendas/notas-debito, o clique na linha abre o detalhe. Uma ND EMITIDA mostra
 * «Cancelar» e «Liquidar»; cada uma é uma rota de formulário.
 *   - Liquidar por transferência (Millennium bim → 121): a ND passa a LIQUIDADA e o detalhe
 *     deixa de oferecer as acções.
 *   - Cancelar com motivo: a ND passa a CANCELADA, com o motivo e a ligação para o estorno do
 *     lançamento da emissão.
 *
 * ESCREVE NA BASE: cada corrida deixa DUAS notas de débito (Acerto de preço, 1 × 100,00 MT a
 * 16 %) para o cliente Maria Santos no tenant `demo`, com a série NOTA_DEBITO avançada:
 *   - uma LIQUIDADA: lançamento da emissão (D 411 / C 711 / C 44331) e recebimento
 *     (D 121 / C 411, 116,00);
 *   - uma CANCELADA, datada do dia 15 do mês anterior: lançamento da emissão e o seu estorno.
 *     O mês anterior, e não o corrente, porque cancelar é recusado (ND_PERIODO_IVA_APURADO) num
 *     período com o IVA já apurado, e o mês corrente do `demo` pode tê-lo (resíduo de outras
 *     corridas). Se o mês anterior também estiver apurado, este caso falha nessa recusa.
 * Não há limpeza: documento fiscal emitido não se apaga. A sentinela do `projecao.golden` acusa.
 */

import { test, expect, type Page } from '@playwright/test';
import { abrir, escaparRegex, marca, submeterECapturar } from './helpers/faturacao-ui';

const CLIENTE = 'Maria Santos'; // CLI-0003 do seed comercial
const CONTA_BANCARIA = /Millennium bim/;

/** Dia 15 do mês anterior (Maputo), `aaaa-mm-dd`. */
function dia15DoMesAnterior(): string {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(new Date()).split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 2, 15));
  return d.toISOString().slice(0, 10);
}

const popoverAberto = (page: Page) => page.locator('[data-radix-popper-content-wrapper]').last();

async function escolherNoSelect(page: Page, nome: RegExp, opcao: string | RegExp) {
  await page.getByRole('combobox', { name: nome }).click();
  await page.getByRole('option', { name: opcao }).first().click();
}

/** Emite uma ND pela UI e abre o detalhe a partir da lista. Devolve o número. */
async function emitirEAbrirDetalhe(page: Page, rotulo: string, dataEmissao?: string): Promise<string> {
  const m = marca(rotulo);
  await abrir(page, '/vendas/notas-debito/nova', 'Nova Nota de Débito');

  const cliente = page.getByRole('combobox', { name: /^Cliente/ });
  await cliente.click();
  const popover = popoverAberto(page);
  const pesquisa = popover.getByRole('combobox').or(popover.getByPlaceholder(/Pesquisar/)).first();
  if (await pesquisa.isVisible().catch(() => false)) await pesquisa.fill(CLIENTE);
  await popover.getByRole('option', { name: new RegExp(escaparRegex(CLIENTE)) }).first().click();
  await expect(cliente).toHaveText(new RegExp(escaparRegex(CLIENTE)));

  if (dataEmissao) await page.getByLabel(/^Data de emissão/).fill(dataEmissao);
  await escolherNoSelect(page, /^Motivo/, 'Outro');
  await page.getByLabel(/^Descrição/).first().fill(m);
  await page.getByLabel(/^Preço/).first().fill('100');

  const { numero, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Nota de Débito' }), m);
  expect(numero, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();

  await page.waitForURL(/\/vendas\/notas-debito$/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle');
  const linha = page.locator('tbody tr', { hasText: numero! });
  await expect(linha, `a ND ${numero} não aparece na lista`).toBeVisible({ timeout: 20_000 });
  await linha.getByText(numero!, { exact: true }).click();
  await page.waitForURL(/\/vendas\/notas-debito\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `Nota de débito ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  return numero!;
}

test.describe('/vendas/notas-debito/[id] — cancelar e liquidar (#565)', () => {
  test('liquidar por transferência: a ND fica LIQUIDADA e sem acções', async ({ page }) => {
    test.setTimeout(240_000);
    const numero = await emitirEAbrirDetalhe(page, 'ND liquidar');

    await page.getByRole('link', { name: 'Liquidar', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Liquidar ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('nd-total')).toContainText('116');

    await expect(page.getByRole('combobox', { name: 'Forma de pagamento' })).toHaveText(/Transferência bancária/);
    await escolherNoSelect(page, /^Conta bancária/, CONTA_BANCARIA);
    await page.getByRole('button', { name: 'Liquidar nota de débito' }).click();

    await page.waitForURL(/\/vendas\/notas-debito\/[^/]+$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: `Nota de débito ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nd-liquidacao')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Liquidar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cancelar', exact: true })).toHaveCount(0);
  });

  test('cancelar com motivo: a ND fica CANCELADA, com o motivo e o estorno', async ({ page }) => {
    test.setTimeout(240_000);
    const numero = await emitirEAbrirDetalhe(page, 'ND cancelar', dia15DoMesAnterior());
    await page.getByRole('tab', { name: /Detalhes/ }).click();
    await expect(page.getByTestId('nd-lancamento')).toBeVisible();

    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Cancelar ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Motivo').fill('Emitida por engano (E2E #565)');
    await page.getByRole('button', { name: 'Cancelar nota de débito' }).click();

    await page.waitForURL(/\/vendas\/notas-debito\/[^/]+$/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: `Nota de débito ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    const cancelamento = page.getByTestId('nd-cancelamento');
    await expect(cancelamento).toBeVisible({ timeout: 30_000 });
    await expect(cancelamento).toContainText('Emitida por engano (E2E #565)');
    await expect(page.getByTestId('nd-estorno')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Liquidar', exact: true })).toHaveCount(0);
  });
});
