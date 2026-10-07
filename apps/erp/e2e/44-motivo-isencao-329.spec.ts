/**
 * E2E — issue #329: «motivoIsencao não exigido em linhas a 0%» (ADR-0039 §4).
 *
 * Nos formulários MANUAIS de Factura, Nota de Crédito e Nota de Débito, uma linha a 0% mostra
 * um campo «Motivo de isenção», obrigatório; a 16% o campo não aparece. Emitir uma factura a 0%
 * sem motivo não emite nada; com motivo, emite.
 *
 * Cria documentos por corrida — corre contra a base ISOLADA (gespro_e2e77), nunca contra
 * `gespro`: facturas isentas partiriam a golden fixture da spec 22 (método do 17-iva-isento).
 * Marca dos documentos: «motivo-isencao-329».
 */

import { test, expect, type Page, type Locator, type Route } from '@playwright/test';

const MARCA = 'motivo-isencao-329';
const MOTIVO = 'Isento nos termos do artigo 9.º do Código do IVA';

const campoMotivo = (page: Page) => page.getByLabel(/^Motivo de isenção/);

async function escolherTaxa(page: Page, seletor: Locator, rotulo: RegExp) {
  await seletor.click();
  await page.getByRole('option', { name: rotulo }).click();
  await expect(seletor).toHaveText(rotulo);
}

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

/** Corpo da Server Action que gravou o documento (identificada pela marca no payload). */
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

const FORMULARIOS = [
  { rota: '/faturacao/nova', titulo: 'Nova Fatura' },
  { rota: '/vendas/faturas/nova', titulo: 'Nova Fatura' },
  { rota: '/faturacao/nota-credito/nova', titulo: 'Nova Nota de Crédito' },
  { rota: '/vendas/notas-credito/nova', titulo: 'Nova Nota de Crédito' },
  { rota: '/vendas/notas-debito/nova', titulo: 'Nova Nota de Débito' },
] as const;

test.describe('«Motivo de isenção» aparece só a 0%', () => {
  for (const { rota, titulo } of FORMULARIOS) {
    test(`${rota}: a 16% não há campo; a 0% aparece; de volta a 16% desaparece`, async ({ page }) => {
      test.setTimeout(90_000);
      await abrir(page, rota, titulo);
      const iva = page.getByRole('combobox', { name: /IVA/ }).first();

      await expect(iva).toHaveText(/^16%/);
      await expect(campoMotivo(page)).toHaveCount(0);

      await escolherTaxa(page, iva, /^0%/);
      await expect(campoMotivo(page).first()).toBeVisible({ timeout: 15_000 });

      await escolherTaxa(page, iva, /^16%/);
      await expect(campoMotivo(page)).toHaveCount(0);
    });
  }
});

test.describe('/vendas/faturas/nova — o motivo é obrigatório a 0%', () => {
  test('sem motivo não emite; com motivo emite', async ({ page }) => {
    test.setTimeout(120_000);
    await abrir(page, '/vendas/faturas/nova', 'Nova Fatura');

    await escolherCliente(page);
    await page.getByLabel(/Descrição/).first().fill(`Livro escolar (isento) — ${MARCA}`);
    await page.getByLabel(/Preço Unit/).first().fill('1000');
    await escolherTaxa(page, page.getByRole('combobox', { name: /^IVA/ }).first(), /^0%/);

    const motivo = campoMotivo(page).first();
    await expect(motivo).toBeVisible({ timeout: 15_000 });

    // Sem motivo: nada é emitido — o formulário fica e o campo é marcado inválido.
    const emitidas: string[] = [];
    page.on('response', async (r) => {
      if (r.request().method() === 'POST' && (r.request().postData() ?? '').includes(MARCA)) {
        const corpo = await r.text().catch(() => '');
        if (/"ok":true/.test(corpo)) emitidas.push(corpo);
      }
    });
    await page.getByRole('button', { name: 'Emitir Fatura' }).click();
    await expect(motivo).toHaveAttribute('aria-invalid', 'true', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/vendas\/faturas\/nova$/);
    expect(emitidas, 'nenhuma factura emitida sem motivo').toEqual([]);

    // Com motivo: emite.
    await motivo.fill(MOTIVO);
    const { id, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }));
    expect(id, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
  });
});
