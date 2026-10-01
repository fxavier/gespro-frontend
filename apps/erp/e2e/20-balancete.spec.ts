import { test, expect, type Page } from '@playwright/test';

/**
 * Balancete de Verificação no modelo PHC — oracle E2E (#280, S1).
 *
 * ORACLE: RED contra a página actual (6 colunas, parâmetros dataInicio/dataFim).
 * Só leitura; não escreve na base.
 *
 * Conta de referência: 121 (Depósitos à ordem, folha DEVEDORA, tenant demo)
 * Valores derivados via SQL de leitura sobre o seed (2026-10-01):
 *   movD  período 6          = 398 555,17 MZN
 *   movC  período 6          = 80 000,00 MZN
 *   acumD períodos 1–6       = 2 534 248,29 MZN   (> movD(6): per. 1–5 também têm D)
 *   acumC períodos 1–6       = 80 000,00 MZN
 *   saldo devedor (1..6)     = 2 454 248,29 MZN   (credor = 0 → «—»)
 *
 * Regras de casa: sem sleeps arbitrários; networkidle antes de interagir com
 * formulários; expect com auto-retry; só leitura da base.
 */

const BASE = '/contabilidade/balancete';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converte célula formatada em PT-PT para number.
 * «2.534.248,29» → 2534248.29  |  «398 555,17» → 398555.17  |  «—» → NaN
 */
function parsePtNum(t: string): number {
  const s = t
    .replace(/\s/g, '')   // espaços (separador de milhar variante)
    .replace(/\./g, '')   // ponto (separador de milhar PT)
    .replace(',', '.');   // vírgula decimal → ponto
  return Number(s);
}

/** Navega e aguarda networkidle — obrigatório antes de interagir com formulários. */
async function navegar(page: Page, query: string): Promise<void> {
  await page.goto(`${BASE}?${query}`);
  await page.waitForLoadState('networkidle');
}

/**
 * Extrai linhas de conta do tbody: exactamente 8 td, primeira célula começa
 * com dígito (exclui «Totais», linha sintética e linhas de esqueleto).
 */
async function linhasDeConta(page: Page): Promise<string[][]> {
  return page.locator('tbody tr').evaluateAll((trs) =>
    trs
      .map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
      )
      .filter((c) => c.length === 8 && /^\d/.test(c[0] ?? '')),
  );
}

// ---------------------------------------------------------------------------
// 1. Layout: cabeçalho PHC, 8 td, saldo devedor/credor, totais, equilíbrio
// ---------------------------------------------------------------------------

test('1.1 cabeçalho PHC: grupos «Movimento do período», «Acumulado», «Saldo» e 6 sub-colunas', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  // Grupos de topo (th de duas linhas de cabeçalho)
  await expect(page.getByRole('columnheader', { name: 'Movimento do período' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Acumulado' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Saldo' })).toBeVisible();

  // Sub-colunas: 2× «Débito» (Mov + Acum), 2× «Crédito», 1× «Devedor», 1× «Credor»
  await expect(page.getByRole('columnheader', { name: 'Débito' })).toHaveCount(2);
  await expect(page.getByRole('columnheader', { name: 'Crédito' })).toHaveCount(2);
  await expect(page.getByRole('columnheader', { name: 'Devedor' })).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Credor' })).toHaveCount(1);
});

test('1.2 linhas têm 8 td; sem negativos; conta 121 saldo em Devedor, Credor «—»', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  const linhas = await linhasDeConta(page);
  expect(linhas.length, 'deve existir pelo menos uma linha de conta').toBeGreaterThan(0);

  // Cada linha de conta tem exactamente 8 td
  for (const linha of linhas) {
    expect(
      linha.length,
      `conta ${linha[0]}: esperados 8 td, encontrados ${linha.length}`,
    ).toBe(8);
  }

  // Conta 121 deve aparecer no intervalo 01–06
  const l121 = linhas.find((l) => l[0] === '121');
  expect(l121, 'conta 121 deve aparecer no balancete 01–06/2026').toBeTruthy();

  // [0]=código [1]=descrição [2]=movD [3]=movC [4]=acumD [5]=acumC [6]=saldoDevedor [7]=saldoCredor
  const [, , , , , , saldoDevedor, saldoCredor] = l121!;
  // 121 é DEVEDORA → saldo positivo → Credor = «—», Devedor > 0
  expect(saldoCredor, '121 DEVEDORA: coluna Credor deve ser «—»').toBe('—');
  expect(saldoDevedor, '121: coluna Devedor não deve ser «—»').not.toBe('—');
  expect(parsePtNum(saldoDevedor), '121: saldo devedor deve ser > 0').toBeGreaterThan(0);

  // Sem sinal negativo nas 6 colunas de valor (índices 2–7): zeros são «—»
  for (const linha of linhas) {
    for (let i = 2; i <= 7; i++) {
      const cel = linha[i] ?? '';
      if (cel !== '—') {
        expect(cel, `conta ${linha[0]} col ${i}: sem sinal negativo`).not.toMatch(/^[-−]/u);
      }
    }
  }
});

test('1.3 linha «Totais» presente e indicador «Balancete equilibrado» com três itens', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  // Linha de totais (tfoot ou tbody)
  await expect(
    page.locator('tfoot tr, tbody tr').filter({ hasText: 'Totais' }).first(),
  ).toBeVisible();

  // Indicador de equilíbrio (o exercício demo não tem saldos anteriores — equilibra)
  await expect(page.getByText('Balancete equilibrado')).toBeVisible();

  // Três itens com aria-label (ADR-0040: cada um com ✓/✗ e aria-label)
  await expect(page.locator('[aria-label="Movimento"]')).toBeVisible();
  await expect(page.locator('[aria-label="Acumulado"]')).toBeVisible();
  await expect(page.locator('[aria-label="Saldos"]')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Acumulado ≥ Movimento — conta 121, período 6 vs. acumulado 1..6
// ---------------------------------------------------------------------------

test('2. acumulado(1..6) > movimento(6) para conta 121 (valores do seed verificados)', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=6&ate=6');

  const linhas = await linhasDeConta(page);
  const l121 = linhas.find((l) => l[0] === '121');
  expect(l121, 'conta 121 deve aparecer no balancete do período 6').toBeTruthy();

  // [2]=movD  [3]=movC  [4]=acumD  [5]=acumC
  const movD = parsePtNum(l121![2]);
  const acumD = parsePtNum(l121![4]);

  // Seed (2026-10-01 SQL): movD período 6 = 398 555,17
  expect(movD, 'movD período 6 da conta 121').toBeCloseTo(398_555.17, 2);

  // Acumulado 1..6 inclui os débitos dos períodos 1..5 → deve ser estritamente maior
  expect(acumD, 'acumD(1..6) deve ser estritamente > movD(6)').toBeGreaterThan(movD);

  // Seed: acumD(1..6) = 2 534 248,29
  expect(acumD, 'acumD(1..6) da conta 121').toBeCloseTo(2_534_248.29, 2);
});

// ---------------------------------------------------------------------------
// 3. Retrocompatibilidade: parâmetros legados não quebram a página
// ---------------------------------------------------------------------------

test('3. parâmetros legados dataInicio/dataFim são ignorados e a página renderiza', async ({
  page,
}) => {
  // URL no formato antigo — a nova página deve ignorar e mostrar o exercício corrente
  await navegar(page, 'dataInicio=2026-06-01&dataFim=2026-06-30');

  // Grupos de cabeçalho devem estar visíveis (não um ecrã de erro)
  await expect(page.getByRole('columnheader', { name: 'Movimento do período' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Acumulado' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 4. Selectores UI: escolher períodos 03–05 e verificar URL
// ---------------------------------------------------------------------------

test('4. selectors: «Período inicial»=03 e «Período final»=05 após «Aplicar» actualizam URL', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=9');
  // networkidle garantido por navegar(); seguro interagir com os controles

  // Período inicial → 03 — Março
  await page.getByLabel('Período inicial').click();
  await page.getByRole('option', { name: '03 — Março' }).click();

  // Período final → 05 — Maio
  await page.getByLabel('Período final').click();
  await page.getByRole('option', { name: '05 — Maio' }).click();

  // Aplicar (submete o formulário / navegação)
  await page.getByRole('button', { name: 'Aplicar' }).click();

  // URL deve conter de=3 e ate=5
  await expect(page).toHaveURL(/[?&]de=3(&|$)/);
  await expect(page).toHaveURL(/[?&]ate=5(&|$)/);
});

// ---------------------------------------------------------------------------
// 5. Período 13: checkbox existe, ao activar e aplicar adiciona p13=1
// ---------------------------------------------------------------------------

test('5. checkbox «Incluir período 13 (encerramento)» existe e ao activar adiciona p13=1 na URL', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  const checkbox = page.getByLabel('Incluir período 13 (encerramento)');
  await expect(checkbox, 'checkbox período 13 deve estar visível').toBeVisible();

  // Activar e aplicar
  await checkbox.check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  // URL deve conter p13=1
  await expect(page).toHaveURL(/[?&]p13=1/);

  // Página ainda renderiza com os grupos de cabeçalho (sem dados no per. 13 neste branch)
  await expect(page.getByRole('columnheader', { name: 'Movimento do período' })).toBeVisible();
  await expect(page.getByText('Balancete equilibrado')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 6. Normalização inicial > final: triggers reflectem URL após router.push
// ---------------------------------------------------------------------------

test('6. inicial>final normaliza para final..final e triggers reflectem URL (remount obrigatório)', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  // Escolher Período inicial = 12 — Dezembro (maior que o final que vamos escolher)
  await page.getByLabel('Período inicial').click();
  await page.getByRole('option', { name: '12 — Dezembro' }).click();

  // Escolher Período final = 03 — Março (menor que o inicial)
  await page.getByLabel('Período final').click();
  await page.getByRole('option', { name: '03 — Março' }).click();

  // Aplicar — a página deve normalizar: periodoInicial clamped a periodoFinal
  await page.getByRole('button', { name: 'Aplicar' }).click();

  // URL normalizada: de=3 e ate=3 (inicial clamped ao valor de final)
  await expect(page).toHaveURL(/[?&]de=3(&|$)/);
  await expect(page).toHaveURL(/[?&]ate=3(&|$)/);

  // Aguardar estabilização completa após navegação
  await page.waitForLoadState('networkidle');

  // Após router.push, os triggers devem ler os parâmetros da URL (remount obrigatório).
  // Bug conhecido: sem remount o trigger de «Período inicial» fica em «12 — Dezembro».
  await expect(page.getByLabel('Período inicial')).toContainText('03 — Março');
  await expect(page.getByLabel('Período final')).toContainText('03 — Março');
});
