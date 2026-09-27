/**
 * Fluxos de faturação pela UI, partilhados pelos E2E que CRIAM documentos
 * (`21-nc-proforma-cotacao`) e pelo a11y quando precisa de uma NC (#148).
 * Escrevem na base: só contra a base isolada (`gespro_e2e77`) ou a do CI.
 */
import { expect, type Page, type Locator, type Route } from '@playwright/test';

// ─── utilitários ──────────────────────────────────────────────────────────────

/** aaaa-mm-dd no dia civil de Maputo, com deslocamento em dias. */
export function diaMaputo(deslocamentoDias = 0): string {
  const d = new Date(Date.now() + deslocamentoDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo' }).format(d);
}

/** dd/mm/aaaa de hoje em Maputo — o formato de `formatarData`. */
export function hojeFormatado(): string {
  const [a, m, d] = diaMaputo(0).split('-');
  return `${d}/${m}/${a}`;
}

/** «1 160,00 MTn» / «MT 1.160,00» → 1160 */
export function paraNumero(texto: string | null): number {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(limpo);
}

/** O valor imediatamente a seguir a um rótulo (`dt` → `dd`), ignorando cabeçalhos de tabela. */
export function valorAoLado(page: Page, rotulo: string): Locator {
  return page.locator(
    `xpath=//*[not(self::th)][normalize-space(text())="${rotulo}"]/following-sibling::*[1]`,
  );
}

export async function esperarValor(loc: Locator, esperado: number, descricao: string) {
  await expect
    .poll(async () => paraNumero(await loc.textContent()), { message: descricao, timeout: 15_000 })
    .toBe(esperado);
}

/** Escapa um texto literal para dentro de uma RegExp (números de documento têm `/`). */
export const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Marca única por corrida, para encontrar o que ESTE teste criou. */
export const marca = (rotulo: string) => `E2E #148 ${rotulo} ${Date.now().toString(36)}`;

/**
 * Carrega na acção de submeter e devolve o corpo da resposta da Server Action
 * cujo payload leva `marcaPayload`. O corpo lê-se interceptando o pedido
 * (`route.fetch`): o formulário navega logo a seguir e o Chromium deita fora o
 * corpo de uma resposta já lida pela página (ver `17-iva-isento`).
 */
export async function submeterECapturar(
  page: Page,
  botao: Locator,
  marcaPayload: string,
): Promise<{ id: string | null; numero: string | null; corpo: string }> {
  let entregar!: (corpo: string) => void;
  const corpoLido = new Promise<string>((r) => (entregar = r));
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() ?? '').includes(marcaPayload)) {
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
      new Promise<string>((_, rej) =>
        setTimeout(() => rej(new Error('a gravação não foi pedida ao servidor em 60s')), 60_000),
      ),
    ]);
    const id = /"ok":true,"data":\{"id":"([^"]+)"/.exec(corpo)?.[1] ?? null;
    const numero = /"numero":"([^"]+)"/.exec(corpo)?.[1] ?? null;
    return { id, numero, corpo };
  } finally {
    await page.unroute('**/*', handler);
  }
}

export async function abrir(page: Page, url: string, titulo: string | RegExp) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

/** Badge de estado do cabeçalho do documento (o `StatusBadge` do `PageHeader`). */
export async function esperarEstado(page: Page, rotulo: string) {
  await expect(page.locator('#main-content').getByText(rotulo, { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
}

// ─── fluxos de criação pela UI ────────────────────────────────────────────────

/** Emite uma factura de 1 × 1000 a 16% (total 1160) e devolve o id e o número. */
export async function emitirFatura(page: Page): Promise<{ id: string; numero: string }> {
  const m = marca('factura');
  await abrir(page, '/faturacao/nova', 'Nova Fatura');

  await page.getByRole('combobox', { name: /Cliente/ }).click();
  await page.getByPlaceholder(/Pesquisar por código/).fill('Maria');
  const opcao = page.getByRole('option', { name: /Maria/ }).first();
  await expect(opcao).toBeVisible({ timeout: 15_000 });
  await opcao.click();
  await expect(page.getByRole('combobox', { name: /Cliente/ })).toHaveText(/Maria/);

  await page.getByLabel('Data de Vencimento').fill(diaMaputo(30));
  await page.getByLabel('Descrição da linha 1').fill(m);
  await page.getByLabel('Preço unitário linha 1').fill('1000');
  await expect(page.getByRole('combobox', { name: /IVA/i }).first()).toHaveText(/^16%/);

  const { id, numero, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Emitir Fatura' }), m);
  expect(id, `a emissão da factura não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
  expect(numero).not.toBeNull();
  await page.waitForURL(/\/faturacao$/, { timeout: 60_000 });
  return { id: id!, numero: numero! };
}

/**
 * Escolhe a factura a creditar na combobox «Factura a creditar» (#258): abre-a,
 * pesquisa no servidor por uma PARTE do número (os últimos 6 dígitos) e clica na
 * opção cujo texto começa pelo número completo.
 */
export async function escolherFaturaACreditar(page: Page, faturaNumero: string) {
  const combobox = page.getByRole('combobox', { name: /Factura a creditar/ });
  await combobox.click();
  await page.getByPlaceholder('Pesquisar pelo número…').fill(faturaNumero.slice(-6));
  const opcao = page.getByRole('option').filter({ hasText: new RegExp(`^\\s*${escaparRegex(faturaNumero)}`) });
  await expect(opcao, `a factura ${faturaNumero} não aparece na pesquisa`).toHaveCount(1, { timeout: 15_000 });
  await opcao.click();
  await expect(combobox).toHaveText(new RegExp(escaparRegex(faturaNumero)));
}

/** Emite uma NC de 1 × 100 a 16% (total 116) sobre a factura; devolve o número. */
export async function emitirNotaCredito(page: Page, faturaNumero: string): Promise<string> {
  const m = marca('NC');
  await abrir(page, '/faturacao/nota-credito/nova', 'Nova Nota de Crédito');

  await escolherFaturaACreditar(page, faturaNumero);
  await page.getByLabel('Motivo *').fill(`Devolução parcial — ${m}`);
  await page.getByLabel('Descrição da linha 1').fill(m);
  await page.getByLabel('Preço unitário linha 1').fill('100');

  const { numero, corpo } = await submeterECapturar(
    page,
    page.getByRole('button', { name: 'Emitir Nota de Crédito' }),
    m,
  );
  expect(numero, `a emissão da NC não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
  await page.waitForURL(/\/faturacao\/nota-credito$/, { timeout: 60_000 });
  return numero!;
}

/** Abre o detalhe da NC pelo menu ⋯ da lista → «Ver detalhe». Devolve o URL do detalhe. */
export async function abrirNCPelaLista(page: Page, numero: string): Promise<string> {
  await abrir(page, '/faturacao/nota-credito', 'Notas de Crédito');
  const linha = page.locator('tbody tr', { hasText: numero });
  await expect(linha, `a NC ${numero} não aparece na lista`).toBeVisible({ timeout: 20_000 });
  await linha.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Ver detalhe' }).click();
  await page.waitForURL(/\/faturacao\/nota-credito\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `Nota de crédito ${numero}`, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
  return new URL(page.url()).pathname;
}

/** Id de um cliente, tirado da UI (lista de clientes → primeira linha). */
export async function obterClienteId(page: Page): Promise<string> {
  await page.goto('/clientes/lista');
  const primeira = page.locator('tbody tr').first();
  await expect(primeira).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await primeira.click();
  await page.waitForURL(/\/clientes\/c[a-z0-9]{20,}$/, { timeout: 30_000 });
  return new URL(page.url()).pathname.split('/').pop()!;
}

