/**
 * E2E — issue #77: «IVA 0% é gravado como 16%».
 *
 * O formulário fazia `Number(l.taxaIva) || 0.16`: o 0 é falsy, e uma linha
 * escolhida a «0%» era mostrada e/ou gravada a 16%. Estes testes conduzem só a
 * UI (admin do seed) e comparam o que o ecrã mostra antes de gravar com o que o
 * documento gravado mostra depois.
 *
 * Cria documentos por corrida — corre contra a base ISOLADA (gespro_e2e77),
 * nunca contra `gespro`: facturas isentas partiriam a golden fixture da spec 22.
 *
 * As opções do Select de IVA escolhem-se pelo início do rótulo (/^0%/, /^16%/):
 * cobre os rótulos decididos (ROTULOS_TAXA_IVA: «0% (isento)», «16%») e os de
 * /vendas/faturas/nova («0% (isento)», «16% (padrão)»), e também os de hoje
 * («0%», «16%») — assim o vermelho de hoje é o defeito, não um rótulo em falta.
 */

import { test, expect, type Page, type Locator, type Route } from '@playwright/test';

/** aaaa-mm-dd no dia civil de Maputo, com deslocamento em dias. */
function diaMaputo(deslocamentoDias = 0): string {
  const d = new Date(Date.now() + deslocamentoDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(d);
}

/** «1 000,00 MTn» / «MT 1000,00» → 1000 */
function paraNumero(texto: string | null): number {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(limpo);
}

/** O valor imediatamente a seguir a um rótulo (ignora cabeçalhos de tabela). */
function valorAoLado(page: Page, rotulo: string): Locator {
  return page.locator(
    `xpath=//*[not(self::th)][normalize-space(text())="${rotulo}"]/following-sibling::*[1]`,
  );
}

async function esperarValor(loc: Locator, esperado: number, descricao: string) {
  await expect
    .poll(async () => paraNumero(await loc.textContent()), { message: descricao, timeout: 15_000 })
    .toBe(esperado);
}

/**
 * Carrega na acção de submeter e devolve o corpo da resposta da Server Action
 * que gravou o documento. O pedido identifica-se pelo payload (a descrição leva
 * a marca «E2E #77»). O corpo lê-se INTERCEPTANDO o pedido (`route.fetch`), não
 * com `response.text()`: o formulário navega logo a seguir e o Chromium deita
 * fora o corpo («No data found for resource»).
 */
async function submeterECapturar(page: Page, botao: Locator): Promise<{ id: string | null; numero: string | null; corpo: string }> {
  let entregar!: (corpo: string) => void;
  const corpoLido = new Promise<string>((r) => (entregar = r));
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() ?? '').includes('E2E #77')) {
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
    const numero = /"numero":"([^"]+)"/.exec(corpo)?.[1] ?? null;
    return { id, numero, corpo };
  } finally {
    await page.unroute('**/*', handler);
  }
}

async function escolherCliente(page: Page) {
  await page.getByRole('combobox', { name: /Cliente/ }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  const opcao = page.getByRole('option', { name: /Maria/ }).first();
  await expect(opcao).toBeVisible({ timeout: 15_000 });
  await opcao.click();
  await expect(page.getByRole('combobox', { name: /Cliente/ })).toHaveText(/Maria/);
}

async function escolherTaxa(page: Page, seletor: Locator, rotulo: RegExp) {
  await seletor.click();
  await page.getByRole('option', { name: rotulo }).click();
  await expect(seletor).toHaveText(rotulo);
}

/**
 * Escreve uma data tecla a tecla (dd mm aaaa, locale pt-PT). Nos campos de data
 * controlados só por `onChange` (sem `value`), o `fill` não chega ao estado do
 * formulário e o zod recusa «Invalid date».
 */
async function teclarData(campo: Locator, iso: string) {
  const [ano, mes, dia] = iso.split('-');
  await campo.focus();
  await campo.page().keyboard.type(`${dia}${mes}${ano}`);
}

async function abrirNovaFatura(page: Page) {
  await page.goto('/faturacao/nova');
  await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

const ivaLinha = (page: Page, i: number) => page.getByRole('combobox', { name: /IVA/i }).nth(i);

test.describe('/faturacao/nova — linha isenta', () => {
  test('uma linha nova começa em 16% VISÍVEL no Select', async ({ page }) => {
    await abrirNovaFatura(page);
    await expect(ivaLinha(page, 0)).toHaveText(/^16%/);
  });

  test('uma linha a 0% × 1000: total 1000,00 antes de emitir; o documento emitido tem IVA 0,00 e total 1000,00', async ({ page }) => {
    test.setTimeout(120_000);
    await abrirNovaFatura(page);

    await escolherCliente(page);
    await page.getByLabel('Data de Vencimento').fill(diaMaputo(30));
    await page.getByLabel('Descrição da linha 1').fill('Livro escolar (isento) — E2E #77');
    await page.getByLabel('Preço unitário linha 1').fill('1000');
    await escolherTaxa(page, ivaLinha(page, 0), /^0%/);

    // O que o ecrã mostra ANTES de gravar.
    await esperarValor(valorAoLado(page, 'IVA').last(), 0, 'IVA mostrado antes de emitir');
    await esperarValor(valorAoLado(page, 'Total').last(), 1000, 'Total mostrado antes de emitir');

    const { id, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }));
    expect(id, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();

    // O que ficou GRAVADO.
    await page.goto(`/faturacao/${id}`);
    await esperarValor(valorAoLado(page, 'IVA').first(), 0, 'IVA do documento emitido');
    await esperarValor(valorAoLado(page, 'Total').first(), 1000, 'Total do documento emitido');
  });

  test('uma linha a 0% e outra a 16% (1000 cada): IVA 160,00 e total 2160,00, antes e depois', async ({ page }) => {
    test.setTimeout(120_000);
    await abrirNovaFatura(page);

    await escolherCliente(page);
    await page.getByLabel('Data de Vencimento').fill(diaMaputo(30));
    await page.getByLabel('Descrição da linha 1').fill('Isento — E2E #77');
    await page.getByLabel('Preço unitário linha 1').fill('1000');
    await escolherTaxa(page, ivaLinha(page, 0), /^0%/);

    await page.getByRole('button', { name: 'Adicionar linha' }).click();
    await page.getByLabel('Descrição da linha 2').fill('Normal — E2E #77');
    await page.getByLabel('Preço unitário linha 2').fill('1000');
    await escolherTaxa(page, ivaLinha(page, 1), /^16%/);

    await esperarValor(valorAoLado(page, 'IVA').last(), 160, 'IVA mostrado antes de emitir');
    await esperarValor(valorAoLado(page, 'Total').last(), 2160, 'Total mostrado antes de emitir');

    const { id, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }));
    expect(id, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();

    await page.goto(`/faturacao/${id}`);
    await esperarValor(valorAoLado(page, 'IVA').first(), 160, 'IVA do documento emitido');
    await esperarValor(valorAoLado(page, 'Total').first(), 2160, 'Total do documento emitido');
  });
});

test.describe('/compras/pedidos/novo — item isento', () => {
  /**
   * Não há página de detalhe do pedido (`/compras/pedidos/[id]` não existe):
   * o valor gravado lê-se na coluna «Valor Total» da listagem, na linha do
   * número devolvido pela gravação.
   */
  test('item a 0% × 1000: o pedido gravado tem valor total 1000,00 (sem IVA)', async ({ page }) => {
    test.setTimeout(120_000);

    // O formulário pede o id do fornecedor: tira-se da UI, abrindo um fornecedor.
    await page.goto('/fornecedores/lista');
    const primeira = page.locator('tbody tr').first();
    await expect(primeira).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await primeira.click();
    await page.waitForURL(/\/fornecedores\/c[a-z0-9]{20,}$/, { timeout: 30_000 });
    const fornecedorId = new URL(page.url()).pathname.split('/').pop()!;
    expect(fornecedorId, `URL do fornecedor: ${page.url()}`).toMatch(/^c[a-z0-9]{20,}$/);

    await page.goto('/compras/pedidos/novo');
    await expect(page.getByRole('heading', { name: 'Novo Pedido de Compra' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    await page.getByLabel('ID do Fornecedor').fill(fornecedorId);
    await page.getByLabel('Condições de Pagamento').fill('30 dias');
    await page.getByLabel('Data de Entrega Prevista').fill(diaMaputo(30));
    await page.getByLabel('Endereço de Entrega').fill('Av. 25 de Setembro, Maputo');
    await page.getByLabel('Descrição do item 1').fill('Livros escolares (isento) — E2E #77');
    await page.getByLabel('Preço unitário item 1').fill('1000');
    await escolherTaxa(page, page.getByRole('combobox', { name: /IVA/i }).first(), /^0%/);

    await esperarValor(valorAoLado(page, 'IVA').last(), 0, 'IVA mostrado antes de criar');
    await esperarValor(valorAoLado(page, 'Total').last(), 1000, 'Total mostrado antes de criar');

    const { numero, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Criar Pedido' }));
    expect(numero, `a criação não devolveu o pedido: ${corpo.slice(0, 400)}`).not.toBeNull();

    await page.waitForURL(/\/compras\/pedidos$/, { timeout: 60_000 });
    const linha = page.locator('tbody tr', { hasText: numero! });
    await expect(linha).toBeVisible({ timeout: 15_000 });
    await esperarValor(linha.locator('td').nth(4), 1000, `Valor Total gravado do pedido ${numero}`);
  });
});

test.describe('/vendas/faturas/nova — linha isenta', () => {
  test('linha a 0% × 1000: o documento emitido tem IVA 0,00 e total 1000,00', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/vendas/faturas/nova');
    await expect(page.getByRole('heading', { name: 'Nova Fatura' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    await page.getByRole('combobox', { name: /Série de documento/ }).click();
    await page.getByRole('option').first().click();
    await escolherCliente(page);
    await teclarData(page.getByLabel(/Data de emissão/), diaMaputo(0));
    await teclarData(page.getByLabel(/Data de vencimento/), diaMaputo(30));
    await page.getByLabel(/Descrição/).first().fill('Livro escolar (isento) — E2E #77 vendas');
    await page.getByLabel(/Preço Unit/).first().fill('1000');
    await escolherTaxa(page, page.getByRole('combobox', { name: /^IVA/ }).first(), /^0%/);

    const { id, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }));
    expect(id, `a emissão não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();

    await page.goto(`/vendas/faturas/${id}`);
    await esperarValor(valorAoLado(page, 'IVA').first(), 0, 'IVA do documento emitido');
    await esperarValor(valorAoLado(page, 'Total').first(), 1000, 'Total do documento emitido');
  });
});
