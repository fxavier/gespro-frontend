/**
 * E2E — issue #336: hash de integridade do documento fiscal no detalhe da factura.
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato: uma factura emitida pela UI grava `hashValidacao` (sha256, 64 hex); os DOIS
 * detalhes — /vendas/faturas/<id> e o separador «Detalhes» de /faturacao/<id> — mostram-no
 * rotulado «Hash de integridade» (não «Hash de validação», nunca «certificado»), e é o
 * MESMO valor nos dois.
 *
 * Cria uma factura por corrida — corre contra a base ISOLADA (gespro_e2e77), nunca contra
 * `gespro`: facturas novas no tenant `demo` partem a golden fixture da spec 22.
 * Marca dos documentos: «hash-documento-336».
 */

import { test, expect, type Page, type Locator, type Route } from '@playwright/test';

const MARCA = 'hash-documento-336';
const HEX64 = /\b[0-9a-f]{64}\b/;

async function abrir(page: Page, rota: string, titulo: string) {
  await page.goto(rota);
  await expect(page.getByRole('heading', { name: titulo })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function escolherCliente(page: Page) {
  await page.getByRole('combobox', { name: /Cliente/ }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  const opcao = page.getByRole('option', { name: /Maria/ }).first();
  await expect(opcao).toBeVisible({ timeout: 15_000 });
  await opcao.click();
  await expect(page.getByRole('combobox', { name: /Cliente/ })).toHaveText(/Maria/);
}

/** Id do documento gravado, lido da resposta da Server Action (identificada pela marca). */
async function submeterECapturar(page: Page, botao: Locator): Promise<{ id: string | null; corpo: string }> {
  let entregar!: (corpo: string) => void;
  const corpoLido = new Promise<string>((r) => (entregar = r));
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() ?? '').includes(MARCA)) {
      const resposta = await route.fetch();
      const corpo = await resposta.text();
      await route.fulfill({ response: resposta, body: corpo });
      entregar(corpo);
    } else {
      await route.fallback();
    }
  };
  await page.route('**/*', handler);
  try {
    await botao.click();
    const corpo = await Promise.race([
      corpoLido,
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('a gravação não foi pedida ao servidor em 60s')), 60_000)),
    ]);
    const id = /"ok":true,"data":\{"id":"([^"]+)"/.exec(corpo)?.[1] ?? null;
    return { id, corpo };
  } finally {
    await page.unroute('**/*', handler);
  }
}

/** Bloco do rótulo: o elemento-pai do texto «Hash de integridade» (rótulo + valor). */
async function hashMostrado(page: Page): Promise<string> {
  const rotulo = page.getByText('Hash de integridade', { exact: true });
  await expect(rotulo, 'o detalhe não mostra «Hash de integridade»').toBeVisible({ timeout: 20_000 });
  const bloco = rotulo.locator('xpath=..');
  await expect(bloco).toHaveText(HEX64);
  const texto = (await bloco.textContent()) ?? '';
  return HEX64.exec(texto)![0];
}

test.describe('#336 — «Hash de integridade» no detalhe da factura', () => {
  test('factura emitida pela UI mostra o hash nos dois detalhes, com o mesmo valor', async ({ page }) => {
    test.setTimeout(180_000);

    await abrir(page, '/vendas/faturas/nova', 'Nova Fatura');
    await escolherCliente(page);
    await page.getByLabel(/Descrição/).first().fill(`Serviço — ${MARCA}`);
    await page.getByLabel(/Preço Unit/).first().fill('1000');
    await expect(page.getByRole('combobox', { name: /^IVA/ }).first()).toHaveText(/^16%/);

    const { id, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }));
    expect(id, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();

    // /vendas/faturas/<id>
    await page.goto(`/vendas/faturas/${id}`);
    await page.waitForLoadState('networkidle');
    const hashVendas = await hashMostrado(page);
    await expect(page.getByText('Hash de validação')).toHaveCount(0);
    await expect(page.getByText(/certificad/i)).toHaveCount(0);

    // /faturacao/<id> — separador «Detalhes»
    await page.goto(`/faturacao/${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /Detalhes/ }).click();
    const hashFaturacao = await hashMostrado(page);
    await expect(page.getByText('Hash de validação')).toHaveCount(0);
    await expect(page.getByText(/certificad/i)).toHaveCount(0);

    expect(hashFaturacao).toBe(hashVendas);
  });
});
