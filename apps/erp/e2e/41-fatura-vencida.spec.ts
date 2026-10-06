/**
 * E2E — marcar factura como vencida (fatura-pdf-pagamento, nó P3).
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato da UI:
 *   - o detalhe mostra «Marcar como vencida» só quando a factura está EMITIDA ou
 *     PARCIALMENTE_PAGA, o vencimento já passou (a partir do dia seguinte, em Maputo) e
 *     o utilizador tem `faturacao:fatura:gerir` (o admin do seed tem);
 *   - o botão abre um AlertDialog cuja confirmação é «Marcar como vencida»; depois de
 *     confirmar, o estado mostra «Vencida».
 *
 * Os dois casos emitem a sua factura pela UI (/faturacao/nova permite datas passadas):
 *   - vencida: emissão há 2 dias, vencimento ontem;
 *   - por vencer: emissão e vencimento HOJE — o caso-limite, o botão não pode aparecer.
 * Se «há 2 dias» cair no ano anterior (1–2 de Janeiro), o primeiro caso salta: a
 * emissão precisaria da série e do exercício do ano anterior.
 *
 * DEIXA DOCUMENTOS no tenant `demo` a cada corrida (duas facturas de 1160,00, uma delas
 * Vencida). Mesmo método e pressupostos do `21-nc-proforma-cotacao`.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  abrir,
  diaMaputo,
  escolherCliente,
  esperarEstado,
  marca,
  submeterECapturar,
} from './helpers/faturacao-ui';

/** Emite pela UI uma factura 1 × 1000 a 16% com as datas dadas (aaaa-mm-dd de Maputo). */
async function emitirFaturaComDatas(
  page: Page,
  dataEmissao: string,
  dataVencimento: string,
): Promise<{ id: string; numero: string }> {
  const m = marca('factura P3');
  await abrir(page, '/faturacao/nova', 'Nova Fatura');
  await escolherCliente(page, 'Maria');
  await page.getByLabel('Data de Emissão').fill(dataEmissao);
  await page.getByLabel('Data de Vencimento').fill(dataVencimento);
  await page.getByLabel('Descrição da linha 1').fill(m);
  await page.getByLabel('Preço unitário linha 1').fill('1000');

  const { id, numero, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }), m);
  expect(id, `a emissão da factura não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
  expect(numero).not.toBeNull();
  await page.waitForURL(/\/faturacao$/, { timeout: 60_000 });
  return { id: id!, numero: numero! };
}

async function abrirDetalhe(page: Page, fatura: { id: string; numero: string }) {
  await page.goto(`/faturacao/${fatura.id}`);
  await expect(page.getByRole('heading', { name: `Factura ${fatura.numero}`, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
}

test.describe('/faturacao/[id] — marcar como vencida', () => {
  test('factura EMITIDA com vencimento ontem: botão → AlertDialog → «Vencida»', async ({ page }) => {
    test.setTimeout(240_000);
    const emissao = diaMaputo(-2);
    test.skip(
      emissao.slice(0, 4) !== diaMaputo(0).slice(0, 4),
      'a emissão há 2 dias cairia no ano anterior (série/exercício de outro ano)',
    );

    const fatura = await emitirFaturaComDatas(page, emissao, diaMaputo(-1));
    await abrirDetalhe(page, fatura);
    await esperarEstado(page, 'Emitida');

    const botao = page.getByRole('button', { name: 'Marcar como vencida', exact: true });
    await expect(botao).toBeVisible({ timeout: 20_000 });
    await botao.click();

    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible({ timeout: 10_000 });
    await dialogo.getByRole('button', { name: 'Marcar como vencida', exact: true }).click();
    await expect(dialogo).toBeHidden({ timeout: 30_000 });

    await esperarEstado(page, 'Vencida');
    // Já VENCIDA: o botão desaparece. Ao recarregar continua Vencida (gravado, não só no cliente).
    await expect(page.getByRole('button', { name: 'Marcar como vencida', exact: true })).toHaveCount(0);
    await abrirDetalhe(page, fatura);
    await esperarEstado(page, 'Vencida');
  });

  test('factura EMITIDA que vence hoje: o botão não aparece', async ({ page }) => {
    test.setTimeout(240_000);
    const hoje = diaMaputo(0);
    const fatura = await emitirFaturaComDatas(page, hoje, hoje);
    await abrirDetalhe(page, fatura);
    await esperarEstado(page, 'Emitida');

    // A página carregou por inteiro (a acção que existe sempre está lá) e a de vencer não.
    await expect(page.getByRole('link', { name: 'Descarregar PDF' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar como vencida' })).toHaveCount(0);
  });
});
