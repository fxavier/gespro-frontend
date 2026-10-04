/**
 * Lançamentos contabilísticos pela UI (#137), partilhados pelos E2E que CRIAM
 * lançamentos (`24-lancamento-rascunho`) e pelo a11y quando precisa de um
 * rascunho ou de um anulado. Escrevem na base: só contra a base isolada
 * (`gespro_e2e77`) ou a do CI.
 *
 * Contas: duas de existências (2633/2632, classe 2, fora da tesouraria), como o
 * `12-lancamentos` — o par não mexe em saldo nenhum que a DFC leia.
 */
import { expect, type Page, type Locator } from '@playwright/test';

export const LISTA_LANCAMENTOS = '/contabilidade/lancamentos';

/** Histórico único por corrida, com a marca que identifica os dados da #137. */
export function marcaLancamento(rotulo: string): string {
  return `${rotulo} — E2E #137 ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

/** Escolhe uma opção num `Combobox` (filtro local) pelo início do rótulo. */
export async function escolherNoCombobox(page: Page, caixa: Locator, pesquisa: string, opcao: RegExp) {
  await caixa.click();
  // Scoped ao wrapper do Radix Popover: evita strict mode quando o popover
  // anterior ainda está na animação de fecho e dois inputs coexistem no DOM.
  await page.locator('[data-radix-popper-content-wrapper]').last().getByPlaceholder('Pesquisar…').fill(pesquisa);
  await page.getByRole('option', { name: opcao }).first().click();
  await expect(caixa).toHaveText(opcao);
}

export interface Rascunho {
  id: string;
  numero: string;
  historico: string;
  /** Caminho do detalhe: `/contabilidade/lancamentos/<id>`. */
  detalhe: string;
}

/** Cria um rascunho pela UI e deixa aberto o detalhe dele (aberto pela lista). */
export async function criarRascunho(page: Page, rotulo: string, valor = '2500'): Promise<Rascunho> {
  const historico = marcaLancamento(rotulo);

  await page.goto(`${LISTA_LANCAMENTOS}/novo`);
  await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');

  await escolherNoCombobox(page, page.getByRole('combobox', { name: /Diário/ }), 'Outros', /Outros/);
  await page.getByPlaceholder('Descrição do lançamento').fill(historico);
  const contas = page.getByRole('combobox', { name: 'Conta' });
  await escolherNoCombobox(page, contas.nth(0), '2633', /^2633 /);
  await escolherNoCombobox(page, contas.nth(1), '2632', /^2632 /);
  await page.getByPlaceholder('0.00').nth(0).fill(valor);
  await page.getByPlaceholder('0.00').nth(1).fill(valor);

  await page.getByRole('button', { name: 'Guardar Lançamento' }).click();
  await page.waitForURL(/\/contabilidade\/lancamentos$/, { timeout: 60_000 });

  await page.goto(`${LISTA_LANCAMENTOS}?status=RASCUNHO`);
  const linha = page.locator('tbody tr', { hasText: historico });
  await expect(linha).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await linha.click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });

  const detalhe = new URL(page.url()).pathname;
  const id = detalhe.split('/').pop()!;
  const titulo = await page.getByRole('heading', { name: /^Lançamento / }).first().innerText();
  const numero = titulo.replace(/^Lançamento\s+/, '').trim();
  expect(numero).not.toBe('');
  return { id, numero, historico, detalhe };
}

/** Anula um rascunho pela rota `/anular`, com motivo; termina no detalhe. */
export async function anularRascunho(page: Page, detalhe: string, motivo: string): Promise<void> {
  await page.goto(`${detalhe}/anular`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Motivo').fill(motivo);
  await page.getByRole('button', { name: 'Anular lançamento' }).click();
  await page.waitForURL(new RegExp(`${detalhe}$`), { timeout: 60_000 });
  await expect(page.locator('#main-content').getByText('Rascunho anulado')).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * Caminho do detalhe do primeiro lançamento com `status` na lista, ou null.
 * Prefere os criados pelos E2E da #137 (manuais, marcados), se houver.
 */
export async function hrefLancamento(
  page: Page,
  status: 'RASCUNHO' | 'ANULADO',
): Promise<string | null> {
  await page.goto(`${LISTA_LANCAMENTOS}?status=${status}`);
  await expect(page.getByRole('heading', { name: /Lançamentos Contabilísticos/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
  const linhas = page.locator('tbody tr');
  const marcada = linhas.filter({ hasText: 'E2E #137' }).first();
  const linha = (await marcada.count()) > 0 ? marcada : linhas.first();
  if ((await linha.count()) === 0) return null;
  const menu = linha.getByRole('button', { name: /Acções para/ });
  if ((await menu.count()) === 0) return null; // linha do estado vazio
  await menu.click();
  const href = await page.getByRole('menuitem', { name: 'Ver detalhe' }).getAttribute('href');
  await page.keyboard.press('Escape');
  return href;
}
