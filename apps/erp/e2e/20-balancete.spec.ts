import { test, expect, type Page } from '@playwright/test';

/**
 * Balancete de Verificação no modelo PHC — oracle E2E (#280 S1, #281 S2).
 *
 * S1 (PR #287): colunas PHC, totais, equilíbrio, URL params, selector remount.
 * S2 (este oracle): hierarquia por roll-up via contaMaeId; data-nivel em cada
 *   linha CONTA; negrito nas agregadoras; SUBTOTAL_CLASSE por classe; controlos
 *   «Grau máximo» e «Ver apenas contas de razão».
 *
 * Só leitura; não escreve na base.
 *
 * Conta de referência: 121 (Depósitos à ordem, folha DEVEDORA, tenant demo)
 * Valores derivados via SQL de leitura sobre o seed (2026-10-01):
 *   movD  período 6          = 398 555,17 MZN
 *   movC  período 6          = 80 000,00 MZN
 *   acumD períodos 1–6       = 2 534 248,29 MZN   (> movD(6): per. 1–5 também têm D)
 *   acumC períodos 1–6       = 80 000,00 MZN
 *   saldo devedor (1..6)     = 2 454 248,29 MZN   (credor = 0 → «—»)
 *   acumD classe 1 (1..6)    = 2 534 248,29 MZN   (só '121' tem movimento; roll-up via '12')
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
 * Extrai linhas de conta do tbody com exactamente 8 td e primeira célula a
 * começar com dígito. A partir de S2 inclui linhas-mãe (nivel 1/2) com
 * movimento via roll-up. O localizador de '121' usa === para não confundir
 * '12', '1211', etc.
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

interface LinhaTabela {
  nivel: string;   // data-nivel ('1'..'7') ou '' se não for linha CONTA
  tipo: string;    // data-tipo ('subtotal' | 'sintetica' | '')
  cells: string[]; // conteúdo dos td
}

/**
 * Extrai TODAS as linhas do tbody: CONTA, SUBTOTAL_CLASSE e SINTETICA.
 * Usado nos testes de hierarquia (roll-up, subtotais).
 */
async function todasLinhas(page: Page): Promise<LinhaTabela[]> {
  return page.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => ({
      nivel: tr.getAttribute('data-nivel') ?? '',
      tipo: tr.getAttribute('data-tipo') ?? '',
      cells: Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
    })),
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

  // Cada linha de conta (folha ou mãe com roll-up) tem exactamente 8 td
  for (const linha of linhas) {
    expect(
      linha.length,
      `conta ${linha[0]}: esperados 8 td, encontrados ${linha.length}`,
    ).toBe(8);
  }

  // Conta 121 — exact: '12' e '1211' têm comprimentos diferentes mas === evita-o na mesma
  const l121 = linhas.find((l) => l[0] === '121'); // exact string match
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
  const l121 = linhas.find((l) => l[0] === '121'); // exact — não confunde com '12'/'1211'
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

  // Período inicial → 03 — Março
  await page.getByLabel('Período inicial').click();
  await page.getByRole('option', { name: '03 — Março' }).click();

  // Período final → 05 — Maio
  await page.getByLabel('Período final').click();
  await page.getByRole('option', { name: '05 — Maio' }).click();

  await page.getByRole('button', { name: 'Aplicar' }).click();

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

  await checkbox.check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]p13=1/);

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

  await page.getByLabel('Período inicial').click();
  await page.getByRole('option', { name: '12 — Dezembro' }).click();

  await page.getByLabel('Período final').click();
  await page.getByRole('option', { name: '03 — Março' }).click();

  await page.getByRole('button', { name: 'Aplicar' }).click();

  // URL normalizada: inicial clamped a final → de=3&ate=3
  await expect(page).toHaveURL(/[?&]de=3(&|$)/);
  await expect(page).toHaveURL(/[?&]ate=3(&|$)/);

  await page.waitForLoadState('networkidle');

  // Após router.push os triggers devem reflectir a URL (remount obrigatório).
  // Bug: sem remount o trigger «Período inicial» permanece «12 — Dezembro».
  await expect(page.getByLabel('Período inicial')).toContainText('03 — Março');
  await expect(page.getByLabel('Período final')).toContainText('03 — Março');
});

// ---------------------------------------------------------------------------
// 7. Hierarquia padrão: linhas-mãe, negrito, roll-up classe 1, subtotal
// ---------------------------------------------------------------------------

test('7. hierarquia padrão: nivel-1 e nivel-2 em negrito; roll-up classe 1 = soma nivel-2; «Total da classe 1»', async ({
  page,
}) => {
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  // Linhas CONTA de nivel 1 e 2 devem existir (hierarquia activa por omissão)
  await expect(page.locator('tr[data-nivel="1"]')).not.toHaveCount(0);
  await expect(page.locator('tr[data-nivel="2"]')).not.toHaveCount(0);

  // Linhas agregadoras em negrito (font-semibold na <tr>, conforme ADR-0040)
  await expect(page.locator('tr[data-nivel="1"]').first()).toHaveClass(/font-semibold/);
  await expect(page.locator('tr[data-nivel="2"]').first()).toHaveClass(/font-semibold/);

  // Roll-up: a linha da classe 1 (código «1», nivel 1) deve ter acumD igual à
  // soma dos acumD dos seus filhos de nivel 2 que aparecem no balancete.
  const todas = await todasLinhas(page);

  // Linha da classe 1 — exact match por código
  const l1 = todas.find((r) => r.nivel === '1' && r.cells[0] === '1'); // exact
  expect(l1, 'linha da classe 1 (código «1») deve existir').toBeTruthy();
  const acumD1 = parsePtNum(l1!.cells[4]);
  expect(acumD1, 'acumD da classe 1 deve ser > 0').toBeGreaterThan(0);

  // Filhos nivel-2 da classe 1: códigos de dois dígitos a começar por '1' (11, 12, 13…)
  const n2c1 = todas.filter(
    (r) =>
      r.nivel === '2' &&
      /^1\d$/.test(r.cells[0] ?? '') &&
      r.tipo !== 'subtotal' &&
      r.tipo !== 'sintetica',
  );
  expect(n2c1.length, 'pelo menos um filho nivel-2 da classe 1 deve aparecer').toBeGreaterThan(0);

  const somaAcumDn2 = n2c1.reduce((acc, r) => {
    const v = parsePtNum(r.cells[4]);
    return acc + (isNaN(v) ? 0 : v);
  }, 0);
  expect(acumD1, 'acumD classe 1 = soma acumD dos filhos nivel-2').toBeCloseTo(somaAcumDn2, 2);

  // «Total da classe 1» existe e iguala o acumD da linha nivel-1 «1»
  const sub1 = todas.find(
    (r) => r.tipo === 'subtotal' && (r.cells[1] ?? '').includes('Total da classe 1'),
  );
  expect(sub1, 'linha «Total da classe 1» deve existir').toBeTruthy();
  expect(
    parsePtNum(sub1!.cells[4]),
    'acumD «Total da classe 1» = acumD da linha «1»',
  ).toBeCloseTo(acumD1, 2);
});

// ---------------------------------------------------------------------------
// 8. «Grau máximo» = 2: URL nivel=2, sem linhas nivel>2, Totais inalterados
// ---------------------------------------------------------------------------

test('8. «Grau máximo»=2: URL nivel=2, sem linhas nivel>2, Totais inalterados vs omissão', async ({
  page,
}) => {
  // Capturar Totais do view por omissão antes de aplicar o filtro
  await navegar(page, 'exercicio=2026&de=1&ate=6');
  const totaisLoc = page.locator('tfoot tr, tbody tr').filter({ hasText: 'Totais' }).first();
  await expect(totaisLoc).toBeVisible();
  const totaisDefault = await totaisLoc.evaluate((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
  );

  // Seleccionar «Grau máximo» = «2»
  await page.getByLabel('Grau máximo').click();
  await page.getByRole('option', { name: '2' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]nivel=2/);
  await page.waitForLoadState('networkidle');

  // Nenhuma linha CONTA com data-nivel > 2
  const nivels = await page.locator('tr[data-nivel]').evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-nivel') ?? '0')),
  );
  for (const n of nivels) {
    expect(n, `data-nivel deve ser ≤ 2 com nivel=2, encontrado ${n}`).toBeLessThanOrEqual(2);
  }

  // Totais inalterados (os totais são do núcleo — folhas apenas — e não dependem do nível de vista)
  const totaisNew = await page
    .locator('tfoot tr, tbody tr')
    .filter({ hasText: 'Totais' })
    .first()
    .evaluate((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
    );
  expect(totaisNew, 'Totais devem ser iguais após nivel=2').toEqual(totaisDefault);
});

// ---------------------------------------------------------------------------
// 9. «Ver apenas contas de razão»: URL razao=1, só CONTA nivel=2, Totais inalterados
// ---------------------------------------------------------------------------


test('9. «Ver apenas contas de razão»: URL razao=1, toda linha CONTA tem nivel=2, Totais inalterados', async ({
  page,
}) => {
  // Capturar Totais do view por omissão
  await navegar(page, 'exercicio=2026&de=1&ate=6');
  const totaisLoc = page.locator('tfoot tr, tbody tr').filter({ hasText: 'Totais' }).first();
  await expect(totaisLoc).toBeVisible();
  const totaisDefault = await totaisLoc.evaluate((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
  );

  // Activar «Ver apenas contas de razão»
  await page.getByLabel('Ver apenas contas de razão').check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]razao=1/);
  await page.waitForLoadState('networkidle');

  // Todas as linhas CONTA (com data-nivel) têm nivel=2 — só contas de razão visíveis
  const nivels = await page.locator('tr[data-nivel]').evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-nivel') ?? '0')),
  );
  expect(nivels.length, 'deve existir pelo menos uma linha de razão').toBeGreaterThan(0);
  for (const n of nivels) {
    expect(n, `data-nivel deve ser 2 em modo razão, encontrado ${n}`).toBe(2);
  }

  // Totais inalterados
  const totaisNew = await page
    .locator('tfoot tr, tbody tr')
    .filter({ hasText: 'Totais' })
    .first()
    .evaluate((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
    );
  expect(totaisNew, 'Totais devem ser iguais após razao=1').toEqual(totaisDefault);
});

// ---------------------------------------------------------------------------
// 10. «Grau máximo» opção «Todos»: renderiza, remove nivel da URL, nivel>2 reaparecem
// ---------------------------------------------------------------------------

test('10. «Grau máximo» «Todos»: a partir de nivel=2 escolher «Todos» remove nivel da URL e repõe linhas nivel>2', async ({
  page,
}) => {
  // Navegar para página com nivel=2 activo; trigger deve reflectir URL
  await navegar(page, 'exercicio=2026&de=1&ate=6&nivel=2');

  await expect(
    page.getByLabel('Grau máximo'),
    '«Grau máximo» deve mostrar «2» quando nivel=2 na URL',
  ).toContainText('2');

  // Abrir e escolher «Todos» (value ''; SelectItem não pode dropar este valor — senão RED aqui)
  await page.getByLabel('Grau máximo').click();
  await page.getByRole('option', { name: 'Todos' }).click();

  await page.getByRole('button', { name: 'Aplicar' }).click();

  // URL não deve conter nivel=
  await expect(page).not.toHaveURL(/[?&]nivel=/);
  await page.waitForLoadState('networkidle');

  // Linhas de nivel > 2 devem voltar (hierarquia completa restaurada)
  await expect(
    page.locator('tr[data-nivel="3"]'),
    'linhas nivel 3 devem voltar após remover filtro nivel',
  ).not.toHaveCount(0);

  // Trigger deve reflectir URL: sem nivel → «Todos»
  await expect(
    page.getByLabel('Grau máximo'),
    '«Grau máximo» deve mostrar «Todos» após navigate sem nivel',
  ).toContainText('Todos');
});

// ---------------------------------------------------------------------------
// 11. Sync selector: checkbox e «Grau máximo» reflectem URL; subtotais sem data-nivel
// ---------------------------------------------------------------------------

test('11. sync selector: checkbox e «Grau máximo» reflectem URL após navigate; subtotais sem data-nivel', async ({
  page,
}) => {
  // Aplicar «Ver apenas contas de razão» via UI e verificar a página resultante
  await navegar(page, 'exercicio=2026&de=1&ate=6');

  await page.getByLabel('Ver apenas contas de razão').check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]razao=1/);
  await page.waitForLoadState('networkidle');

  // Checkbox deve estar marcado na página resultante (URL tem razao=1)
  await expect(
    page.getByLabel('Ver apenas contas de razão'),
    'checkbox deve estar marcado após navigate com razao=1',
  ).toBeChecked();

  // «Grau máximo» deve reflectir URL: sem nivel → «Todos»
  await expect(
    page.getByLabel('Grau máximo'),
    '«Grau máximo» deve mostrar «Todos» quando nivel ausente da URL',
  ).toContainText('Todos');

  // Invariante estrutural: linhas de subtotal nunca devem carregar data-nivel
  // (verificado após razao=1 onde os subtotais estão presentes)
  const subtotaisComNivel = await page.locator('[data-tipo="subtotal"][data-nivel]').count();
  expect(subtotaisComNivel, 'subtotais não devem ter atributo data-nivel').toBe(0);
});
