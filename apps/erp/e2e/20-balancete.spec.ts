import { test, expect, type Page } from '@playwright/test';

/**
 * Balancete — saldo anterior, «Incluir zeradas» e pesquisa (#141).
 *
 * Só leitura: não escreve na base. O período é Junho do exercício do seed; a
 * conta 121 (Depósitos à ordem) tem movimento desde Janeiro, logo o saldo
 * anterior a 1/6 não pode ser zero. As asserções não dependem de valores do
 * seed — só da aritmética e da forma da tabela.
 */
const PERIODO = 'dataInicio=2026-06-01&dataFim=2026-06-30';
const num = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'));

async function linhas(page: Page, query = '') {
  await page.goto(`/contabilidade/balancete?${PERIODO}${query}`);
  await expect(page.getByText('DIFERENÇA (deve ser zero)')).toBeVisible({ timeout: 60_000 });
  return page.locator('tbody tr').evaluateAll((trs) =>
    trs
      .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''))
      .filter((c) => c.length === 6),
  );
}

test('saldo anterior é o acumulado antes do período e entra no saldo actual', async ({ page }) => {
  const c121 = (await linhas(page)).find((c) => c[0] === '121');
  expect(c121, 'a conta 121 aparece no balancete de Junho').toBeTruthy();
  const [, , anterior, debitos, creditos, actual] = c121!.map(num) as number[];
  expect(anterior).toBeGreaterThan(0);
  // 121 é devedora: actual = anterior + débitos − créditos.
  expect(actual).toBeCloseTo(anterior + debitos - creditos, 2);
});

test('«Incluir zeradas» acrescenta as contas sem movimento', async ({ page }) => {
  const sem = await linhas(page, '&incluirZeradas=false');
  const com = await linhas(page, '&incluirZeradas=true');
  expect(com.length).toBeGreaterThan(sem.length);
});

test('a pesquisa filtra as contas por código', async ({ page }) => {
  const todas = await linhas(page);
  const filtradas = await linhas(page, '&search=711');
  expect(filtradas.length).toBeGreaterThan(0);
  expect(filtradas.length).toBeLessThan(todas.length);
  for (const c of filtradas) expect(c[0].startsWith('711') || c[1].includes('711')).toBe(true);
});
