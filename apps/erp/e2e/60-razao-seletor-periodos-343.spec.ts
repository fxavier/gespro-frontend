/**
 * razao-seletor-periodos-343 — ORÁCULO E2E da issue #343.
 *
 * Escrito pelo VERIFICADOR; um agente de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato: no modo «Por períodos» do razão (/contabilidade/razao-geral), «Exercício»,
 * «Do período» e «Ao período» são os controlos do balancete (`ui/Select`, opções
 * «01 — Janeiro» … «12 — Dezembro», «13 — Encerramento» só com «Incluir período 13»), e o
 * «Consultar» empurra um URL com o MESMO formato do drill-down do balancete
 * (`hrefRazaoPeriodos`: contaId, exercicio, de, ate[, p13=1], por esta ordem).
 *
 * Só leitura da base (tenant demo, conta 121, exercício 2026 do seed).
 * Regras da casa: networkidle antes de interagir; sem sleeps; auto-retry nos expect.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const RAZAO = '/contabilidade/razao-geral';
const BALANCETE = '/contabilidade/balancete';
const EXERCICIO = '2026';

function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida — verifique apps/erp/.env');
  return url;
}

async function idConta121(): Promise<string> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    const r = await c.query<{ id: string }>(
      `SELECT c.id FROM "ContaPGC" c JOIN "Tenant" t ON t.id = c."tenantId"
        WHERE t.slug = 'demo' AND c.codigo = '121'`,
    );
    if (r.rows.length === 0) throw new Error('STOP: conta 121 não encontrada no tenant demo');
    return r.rows[0]!.id;
  } finally {
    await c.end();
  }
}

/** A query string que o drill-down do balancete gera (mesma ordem de `hrefRazaoPeriodos`). */
function queryDrillDown(contaId: string, de: number, ate: number, p13: boolean): string {
  const q = new URLSearchParams({ contaId, exercicio: EXERCICIO, de: String(de), ate: String(ate) });
  if (p13) q.set('p13', '1');
  return `?${q.toString()}`;
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

/** Abre um ui/Select pelo rótulo e escolhe a opção pelo texto exacto. */
async function escolher(page: Page, rotulo: string, opcao: string): Promise<void> {
  await page.getByRole('combobox', { name: rotulo }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
  await expect(page.getByRole('combobox', { name: rotulo })).toContainText(opcao);
}

/** Textos das opções da lista aberta. */
async function opcoesAbertas(page: Page): Promise<string[]> {
  const lista = page.getByRole('listbox');
  await expect(lista).toBeVisible();
  return (await lista.getByRole('option').allTextContents()).map((t) => t.trim());
}

const DOZE = [
  '01 — Janeiro', '02 — Fevereiro', '03 — Março', '04 — Abril', '05 — Maio', '06 — Junho',
  '07 — Julho', '08 — Agosto', '09 — Setembro', '10 — Outubro', '11 — Novembro', '12 — Dezembro',
];

test('razao-seletor-periodos-343 a. Exercício, Do período e Ao período são ui/Select com os rótulos do balancete', async ({ page }) => {
  const contaId = await idConta121();
  await page.goto(`${RAZAO}${queryDrillDown(contaId, 3, 5, false)}`);
  await aguardar(page);

  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeChecked();
  // Nenhum controlo nativo nem campo numérico para os períodos.
  await expect(page.locator('select#razao-exercicio, input[type="number"]')).toHaveCount(0);

  await expect(page.getByRole('combobox', { name: 'Exercício' })).toContainText(EXERCICIO);
  await expect(page.getByRole('combobox', { name: 'Do período' })).toContainText('03 — Março');
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('05 — Maio');
});

test('razao-seletor-periodos-343 b. o 13 — Encerramento só aparece com «Incluir período 13»', async ({ page }) => {
  const contaId = await idConta121();
  await page.goto(`${RAZAO}${queryDrillDown(contaId, 3, 5, false)}`);
  await aguardar(page);

  await page.getByRole('combobox', { name: 'Ao período' }).click();
  expect(await opcoesAbertas(page)).toEqual(DOZE);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await page.getByRole('checkbox', { name: /Incluir período 13/ }).click();
  await page.getByRole('combobox', { name: 'Ao período' }).click();
  expect(await opcoesAbertas(page)).toEqual([...DOZE, '13 — Encerramento']);
  await page.keyboard.press('Escape');

  await page.getByRole('combobox', { name: 'Do período' }).click();
  expect(await opcoesAbertas(page)).toEqual([...DOZE, '13 — Encerramento']);
  await page.keyboard.press('Escape');
});

test('razao-seletor-periodos-343 c. escolher exercício e períodos e «Consultar» empurra o URL do drill-down', async ({ page }) => {
  const contaId = await idConta121();
  await page.goto(`${RAZAO}${queryDrillDown(contaId, 3, 5, false)}`);
  await aguardar(page);

  await escolher(page, 'Exercício', EXERCICIO);
  await escolher(page, 'Do período', '02 — Fevereiro');
  await escolher(page, 'Ao período', '06 — Junho');
  await page.getByRole('button', { name: 'Consultar' }).click();

  await expect.poll(() => new URL(page.url()).search).toBe(queryDrillDown(contaId, 2, 6, false));
  await aguardar(page);
  await expect(page.getByTestId('razao-intervalo')).toContainText(/períodos 2 a 6/i);
  await expect(page.getByRole('combobox', { name: 'Do período' })).toContainText('02 — Fevereiro');
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('06 — Junho');
});

test('razao-seletor-periodos-343 d. desmarcar «Incluir período 13» corta o 13 a 12 à vista, antes de consultar', async ({ page }) => {
  const contaId = await idConta121();
  await page.goto(`${RAZAO}${queryDrillDown(contaId, 12, 13, true)}`);
  await aguardar(page);

  await expect(page.getByRole('checkbox', { name: /Incluir período 13/ })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('13 — Encerramento');

  await page.getByRole('checkbox', { name: /Incluir período 13/ }).click();
  // O utilizador vê o corte — não é feito em silêncio no servidor.
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('12 — Dezembro');

  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect.poll(() => new URL(page.url()).search).toBe(queryDrillDown(contaId, 12, 12, false));
});

test('razao-seletor-periodos-343 e. com p13 o 13..13 vai para o URL com p13=1', async ({ page }) => {
  const contaId = await idConta121();
  await page.goto(`${RAZAO}${queryDrillDown(contaId, 3, 5, false)}`);
  await aguardar(page);

  await page.getByRole('checkbox', { name: /Incluir período 13/ }).click();
  await escolher(page, 'Ao período', '13 — Encerramento');
  await escolher(page, 'Do período', '13 — Encerramento');
  await page.getByRole('button', { name: 'Consultar' }).click();

  await expect.poll(() => new URL(page.url()).search).toBe(queryDrillDown(contaId, 13, 13, true));
});

test('razao-seletor-periodos-343 f. drill-down do balancete → «Consultar» sem mexer devolve o mesmo URL', async ({ page }) => {
  await page.goto(`${BALANCETE}?exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  const linha121 = page.locator('tbody tr[data-nivel]').filter({
    has: page.locator('td:first-child', { hasText: /^121$/ }),
  });
  await expect(linha121).toHaveCount(1);
  await linha121.locator('td:first-child a').click();
  await page.waitForURL(/\/contabilidade\/razao-geral\?/);
  await aguardar(page);

  const doDrillDown = new URL(page.url()).search;
  const contaId = new URL(page.url()).searchParams.get('contaId')!;
  expect(doDrillDown, 'o drill-down usa o formato hrefRazaoPeriodos').toBe(queryDrillDown(contaId, 3, 5, false));

  await expect(page.getByRole('combobox', { name: 'Exercício' })).toContainText(EXERCICIO);
  await expect(page.getByRole('combobox', { name: 'Do período' })).toContainText('03 — Março');
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('05 — Maio');

  await page.getByRole('button', { name: 'Consultar' }).click();
  await aguardar(page);
  expect(new URL(page.url()).search, 'o selector do razão escreve o que o drill-down escreveu').toBe(doDrillDown);
});
