import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

/**
 * Balancete de Verificação no modelo PHC — oracle E2E (#280 S1, #281 S2, #283 S3, #284 S4, #285 S5, #286 S6).
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

// ===========================================================================
// S3 (#283) — filtros, tipo de apresentação e saldos contra natureza
//
// Contrato: .scratch/sdlc/balancete-phc/S3-contrato.md («Página / URL», §3, §4).
// Filtros são APRESENTAÇÃO: «Totais» e o indicador de equilíbrio nunca mudam.
// Natureza no seed (períodos 1..6/2026, SQL de leitura 2026-10-01; #295 corrigiu a classe 4):
//   421   Fornecedores c/c  CREDORA   D 80 000,00  C 162 100,00   → saldo credor, na natureza
//   44331 Operações gerais  CREDORA   D 0          C 442 404,68   → saldo credor, na natureza
//   121, 411, 6112, 63299 e 711 também estão na sua natureza — o seed não tem contas contra natureza.
// ===========================================================================

const BASE_S3 = 'exercicio=2026&de=1&ate=6';

/** Células da linha «Totais». */
async function celulasTotais(page: Page): Promise<string[]> {
  const loc = page.locator('tfoot tr, tbody tr').filter({ hasText: 'Totais' }).first();
  await expect(loc).toBeVisible();
  return loc.evaluate((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
  );
}

interface LinhaConta {
  codigo: string;
  contexto: boolean;
  cells: string[];
}

/** Linhas CONTA (`tr[data-nivel]`) com marca de contexto. */
async function linhasContaS3(page: Page): Promise<LinhaConta[]> {
  return page.locator('tbody tr[data-nivel]').evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map(
        (td) => td.textContent?.trim() ?? '',
      );
      return {
        codigo: cells[0] ?? '',
        contexto: tr.getAttribute('data-contexto') === '1',
        cells,
      };
    }),
  );
}

async function expectEquilibrado(page: Page): Promise<void> {
  await expect(page.getByText('Balancete equilibrado')).toBeVisible();
  await expect(page.locator('[aria-label="Movimento"]')).toBeVisible();
  await expect(page.locator('[aria-label="Acumulado"]')).toBeVisible();
  await expect(page.locator('[aria-label="Saldos"]')).toBeVisible();
}

// ---------------------------------------------------------------------------
// 12. Nenhum filtro altera «Totais» nem o indicador de equilíbrio
// ---------------------------------------------------------------------------

test('12. filtros (ci/cf, classe, comSaldo, q, excluir) não alteram «Totais» nem o equilíbrio', async ({
  page,
}) => {
  const assinaturaLinhas = () =>
    page
      .locator('tbody tr')
      .evaluateAll((trs) => trs.map((tr) => tr.textContent?.trim() ?? '').join('|'));

  await navegar(page, BASE_S3);
  const totaisDefault = await celulasTotais(page);
  const linhasDefault = await assinaturaLinhas();
  await expectEquilibrado(page);

  // `muda`: o filtro tem de alterar as linhas mostradas no seed (senão o teste é vácuo).
  // comSaldo=1 não muda nada no seed 1..6 (todas as contas com movimento têm saldo).
  const casos = [
    { filtro: 'ci=2&cf=4', muda: true },
    { filtro: 'classe=7', muda: true },
    { filtro: 'comSaldo=1', muda: false },
    { filtro: 'q=caixa', muda: true },
    { filtro: 'excluir=12', muda: true },
  ];
  for (const { filtro, muda } of casos) {
    await navegar(page, `${BASE_S3}&${filtro}`);
    expect(await celulasTotais(page), `Totais com ${filtro}`).toEqual(totaisDefault);
    await expectEquilibrado(page);
    if (muda) {
      expect(await assinaturaLinhas(), `${filtro} deve alterar as linhas mostradas`).not.toBe(
        linhasDefault,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 13. «Conta inicial»/«Conta final» pela UI
// ---------------------------------------------------------------------------

test('13. «Conta inicial»=6 e «Conta final»=7 → URL ci=6&cf=7; contas (não-contexto) começam por 6 ou 7', async ({
  page,
}) => {
  await navegar(page, BASE_S3);

  await page.getByLabel('Conta inicial', { exact: true }).fill('6');
  await page.getByLabel('Conta final', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]ci=6(&|$)/);
  await expect(page).toHaveURL(/[?&]cf=7(&|$)/);
  await page.waitForLoadState('networkidle');

  const linhas = (await linhasContaS3(page)).filter((l) => !l.contexto);
  expect(linhas.length, 'deve haver contas das classes 6–7 (seed tem 6112, 63299, 711)').toBeGreaterThan(0);
  for (const l of linhas) {
    expect(l.codigo, `conta ${l.codigo} fora do intervalo 6..7`).toMatch(/^[67]/);
  }
  // Contas de fora do intervalo não aparecem
  expect(linhas.find((l) => l.codigo === '121'), '121 não pode aparecer em 6..7').toBeUndefined();
});

// ---------------------------------------------------------------------------
// 14. «Classe» = 7
// ---------------------------------------------------------------------------

test('14. «Classe»=7 → URL classe=7; só linhas da classe 7 e apenas «Total da classe 7»', async ({
  page,
}) => {
  await navegar(page, BASE_S3);

  await page.getByLabel('Classe', { exact: true }).click();
  await page.getByRole('option', { name: /^7\b/ }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]classe=7(&|$)/);
  await page.waitForLoadState('networkidle');

  const todas = await todasLinhas(page);
  const contas = todas.filter((r) => r.nivel !== '');
  expect(contas.length, 'classe 7 tem movimento no seed (711)').toBeGreaterThan(0);
  for (const r of contas) {
    expect(r.cells[0], `linha ${r.cells[0]} não é da classe 7`).toMatch(/^7/);
  }
  expect(contas.some((r) => r.cells[0] === '711'), '711 deve aparecer').toBe(true);

  const subtotais = todas.filter((r) => r.tipo === 'subtotal');
  expect(subtotais.length, 'só um subtotal (classe 7)').toBe(1);
  expect(subtotais[0]!.cells[1]).toContain('Total da classe 7');

  expect(todas.filter((r) => r.tipo === 'sintetica').length, 'sintética é da classe 8').toBe(0);
});

// ---------------------------------------------------------------------------
// 15. «Ver apenas contas com saldo»
// ---------------------------------------------------------------------------

test('15. «Ver apenas contas com saldo» → URL comSaldo=1; nenhuma conta (não-contexto) com Devedor e Credor «—»', async ({
  page,
}) => {
  await navegar(page, BASE_S3);

  await page.getByLabel('Ver apenas contas com saldo', { exact: true }).check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]comSaldo=1(&|$)/);
  await page.waitForLoadState('networkidle');

  const linhas = (await linhasContaS3(page)).filter((l) => !l.contexto);
  expect(linhas.length).toBeGreaterThan(0);
  for (const l of linhas) {
    const [devedor, credor] = l.cells.slice(-2);
    expect(
      devedor === '—' && credor === '—',
      `conta ${l.codigo} sem saldo não devia aparecer com comSaldo=1`,
    ).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// 16. «Excluir contas» = 121
// ---------------------------------------------------------------------------

test('16. «Excluir contas»=121 → URL excluir=121; 121 e descendentes saem; linha «12» mantém os valores', async ({
  page,
}) => {
  await navegar(page, BASE_S3);
  const antes = await linhasContaS3(page);
  const l12Antes = antes.find((l) => l.codigo === '12'); // exact
  expect(l12Antes, 'linha «12» deve existir na vista por omissão').toBeTruthy();

  await page.getByLabel('Excluir contas', { exact: true }).fill('121');
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]excluir=121(&|$)/);
  await page.waitForLoadState('networkidle');

  const depois = await linhasContaS3(page);
  for (const l of depois) {
    expect(l.codigo.startsWith('121'), `conta ${l.codigo} devia estar excluída`).toBe(false);
  }
  const l12Depois = depois.find((l) => l.codigo === '12');
  expect(l12Depois, 'linha «12» continua visível').toBeTruthy();
  expect(l12Depois!.cells.slice(2), 'valores de «12» não mudam (filtro é apresentação)').toEqual(
    l12Antes!.cells.slice(2),
  );
});

// ---------------------------------------------------------------------------
// 17. «Ver contas sem movimento e saldo»
// ---------------------------------------------------------------------------

test('17. «Ver contas sem movimento e saldo» → URL zeradas=1; mais contas e algumas só com «—»', async ({
  page,
}) => {
  await navegar(page, BASE_S3);
  const nDefault = (await linhasContaS3(page)).length;

  await page.getByLabel('Ver contas sem movimento e saldo', { exact: true }).check();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]zeradas=1(&|$)/);
  await page.waitForLoadState('networkidle');

  const linhas = await linhasContaS3(page);
  expect(linhas.length, 'zeradas=1 mostra mais contas do que a omissão').toBeGreaterThan(nDefault);
  const vazias = linhas.filter((l) => l.cells.slice(2).every((c) => c === '—'));
  expect(vazias.length, 'deve haver contas com as seis colunas «—»').toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// 18. «Apresentação»: Por período / Acumulado / Por período e acumulado
// ---------------------------------------------------------------------------

async function escolherApresentacao(page: Page, opcao: string): Promise<void> {
  await page.getByLabel('Apresentação', { exact: true }).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();
}

async function contagemTdContas(page: Page): Promise<number[]> {
  return page
    .locator('tbody tr[data-nivel]')
    .evaluateAll((trs) => trs.map((tr) => tr.querySelectorAll('td').length));
}

test('18. «Apresentação»: Por período (6 td, sem Acumulado) / Acumulado (6 td, sem Movimento) / ambos (8 td)', async ({
  page,
}) => {
  await navegar(page, BASE_S3);

  // Por período
  await escolherApresentacao(page, 'Por período');
  await expect(page).toHaveURL(/[?&]tipo=periodo(&|$)/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('columnheader', { name: 'Movimento do período' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Acumulado' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Saldo', exact: true })).toBeVisible();
  let tds = await contagemTdContas(page);
  expect(tds.length).toBeGreaterThan(0);
  expect(new Set(tds), 'Por período: 6 td por conta').toEqual(new Set([6]));

  // Acumulado
  await escolherApresentacao(page, 'Acumulado');
  await expect(page).toHaveURL(/[?&]tipo=acumulado(&|$)/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('columnheader', { name: 'Movimento do período' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Acumulado' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Saldo', exact: true })).toBeVisible();
  tds = await contagemTdContas(page);
  expect(tds.length).toBeGreaterThan(0);
  expect(new Set(tds), 'Acumulado: 6 td por conta').toEqual(new Set([6]));

  // Por período e acumulado
  await escolherApresentacao(page, 'Por período e acumulado');
  await expect(page).not.toHaveURL(/[?&]tipo=(periodo|acumulado)(&|$)/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('columnheader', { name: 'Movimento do período' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Acumulado' })).toBeVisible();
  tds = await contagemTdContas(page);
  expect(tds.length).toBeGreaterThan(0);
  expect(new Set(tds), 'ambos: 8 td por conta').toEqual(new Set([8]));
});

// ---------------------------------------------------------------------------
// 19. O selector reflecte o URL (carregamento directo e navegação client-side)
// ---------------------------------------------------------------------------

test('19. selector reflecte ci/cf/excluir/q/classe/comSaldo/zeradas/tipo do URL, também após voltar atrás', async ({
  page,
}) => {
  // (a) carregamento directo com todos os parâmetros
  await navegar(
    page,
    `${BASE_S3}&ci=6&cf=7&excluir=121,6112&q=caixa&classe=7&comSaldo=1&zeradas=1&tipo=acumulado`,
  );
  await expect(page.getByLabel('Conta inicial', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Conta final', { exact: true })).toHaveValue('7');
  const excluir = await page.getByLabel('Excluir contas', { exact: true }).inputValue();
  expect(excluir.replace(/\s/g, ''), '«Excluir contas» reflecte excluir=121,6112').toBe('121,6112');
  await expect(page.getByLabel('Pesquisar', { exact: true })).toHaveValue('caixa');
  await expect(page.getByLabel('Ver apenas contas com saldo', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Ver contas sem movimento e saldo', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Classe', { exact: true })).toContainText(/^\s*7\b/);
  await expect(page.getByLabel('Apresentação', { exact: true })).toHaveText('Acumulado');

  // (b) a partir da omissão, aplicar filtros pela UI e voltar atrás (navegação client-side):
  // o estado local do selector tem de voltar a reflectir o URL sem filtros.
  await navegar(page, BASE_S3);
  await expect(page.getByLabel('Classe', { exact: true })).toHaveText('Todas');
  await expect(page.getByLabel('Apresentação', { exact: true })).toHaveText('Por período e acumulado');

  await page.getByLabel('Conta inicial', { exact: true }).fill('6');
  await page.getByLabel('Conta final', { exact: true }).fill('7');
  await page.getByLabel('Pesquisar', { exact: true }).fill('merc');
  await page.getByLabel('Ver apenas contas com saldo', { exact: true }).check();
  await page.getByLabel('Apresentação', { exact: true }).click();
  await page.getByRole('option', { name: 'Por período', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar' }).click();

  await expect(page).toHaveURL(/[?&]ci=6(&|$)/);
  await expect(page).toHaveURL(/[?&]q=merc(&|$)/);
  await expect(page).toHaveURL(/[?&]tipo=periodo(&|$)/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Pesquisar', { exact: true })).toHaveValue('merc');
  await expect(page.getByLabel('Apresentação', { exact: true })).toHaveText('Por período');

  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]ci=/);
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Conta inicial', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Conta final', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Pesquisar', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Ver apenas contas com saldo', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Apresentação', { exact: true })).toHaveText('Por período e acumulado');
});

// ---------------------------------------------------------------------------
// 20. Marcador de saldo contra natureza
// ---------------------------------------------------------------------------

test('20. #295 — 421 e 44331 (passivos, CREDORA) e as outras contas com movimento NÃO têm o marcador «Saldo contra natureza»', async ({
  page,
}) => {
  // Antes da #295 a classe 4 era toda DEVEDORA e 421/44331 apareciam contra natureza.
  // O aviso estava certo face aos dados; os dados é que estavam errados.
  await navegar(page, BASE_S3);

  const linha = (codigo: string) =>
    page.locator('tbody tr[data-nivel]').filter({
      has: page.locator('td:first-child', { hasText: new RegExp(`^${codigo}$`) }),
    });

  for (const codigo of ['421', '44331', '121', '411', '6112', '63299', '711']) {
    await expect(linha(codigo), `linha ${codigo} visível`).toHaveCount(1);
    await expect(
      linha(codigo).locator('[aria-label="Saldo contra natureza"]'),
      `${codigo} está na sua natureza`,
    ).toHaveCount(0);
    const aviso = await linha(codigo).evaluate(
      (tr) => tr.classList.contains('text-warning') || tr.querySelector('.text-warning') !== null,
    );
    expect(aviso, `${codigo}: sem text-warning`).toBe(false);
  }

  // Qualquer marcador que apareça (resíduo da base) continua com o title acessível.
  const marcadores = page.locator('[aria-label="Saldo contra natureza"]');
  const n = await marcadores.count();
  for (let i = 0; i < n; i++) {
    await expect(marcadores.nth(i)).toHaveAttribute('title', 'Saldo contra natureza');
  }
});

// ===========================================================================
// S3 — Esclarecimentos 2 (G5 iter 1): antepassado = mãe mostrada; UX do form;
// rótulos de classe; validação de códigos.
// Seed (SQL de leitura 2026-10-01): 63299 «Outros fornecimentos e serviços» é
// raiz órfã da classe 6 (nível 5, contaMaeId null). 69 → 698 → 6981 é outra
// cadeia (mães reais). Períodos 1..9/2026.
// ===========================================================================

const BASE_E2 = 'exercicio=2026&de=1&ate=9';

// ---------------------------------------------------------------------------
// 21. excluir=69 não leva a raiz órfã 63299
// ---------------------------------------------------------------------------

test('21. excluir=69 mantém a raiz órfã 63299 visível e com os mesmos valores', async ({ page }) => {
  await navegar(page, BASE_E2);
  const antes = (await linhasContaS3(page)).find((l) => l.codigo === '63299');
  expect(antes, '63299 deve aparecer na vista por omissão 1..9').toBeTruthy();

  await navegar(page, `${BASE_E2}&excluir=69`);
  const linhas = await linhasContaS3(page);
  for (const l of linhas) {
    expect(l.codigo.startsWith('69'), `${l.codigo} devia estar excluída por excluir=69`).toBe(false);
  }
  const depois = linhas.find((l) => l.codigo === '63299');
  expect(depois, '63299 não é descendente de 69 — não pode ser excluída').toBeTruthy();
  expect(depois!.contexto, '63299 não é linha de contexto').toBe(false);
  expect(depois!.cells.slice(2), 'valores de 63299 inalterados').toEqual(antes!.cells.slice(2));
});

// ---------------------------------------------------------------------------
// 22. q=outros fornecimentos: 63299 sem 69/698/6981 como contexto
// ---------------------------------------------------------------------------

test('22. q=outros fornecimentos mostra 63299 e não mostra 69, 698 nem 6981', async ({ page }) => {
  await navegar(page, `${BASE_E2}&q=${encodeURIComponent('outros fornecimentos')}`);
  const linhas = await linhasContaS3(page);
  const l = linhas.find((r) => r.codigo === '63299');
  expect(l, '63299 corresponde à pesquisa').toBeTruthy();
  expect(l!.contexto, '63299 passa o filtro — não é contexto').toBe(false);
  for (const codigo of ['69', '698', '6981']) {
    expect(
      linhas.find((r) => r.codigo === codigo),
      `${codigo} não é mãe mostrada de 63299 — não pode aparecer como contexto`,
    ).toBeUndefined();
  }
});

// ---------------------------------------------------------------------------
// 23. Enter em «Pesquisar» aplica
// ---------------------------------------------------------------------------

test('23. Enter em «Pesquisar» (em #main-content) aplica o filtro → URL com q=', async ({ page }) => {
  await navegar(page, BASE_E2);
  const pesquisa = page.locator('#main-content').getByLabel('Pesquisar', { exact: true });
  await pesquisa.fill('merc');
  await pesquisa.press('Enter');
  await expect(page).toHaveURL(/[?&]q=merc(&|$)/);
  await page.waitForLoadState('networkidle');
  await expect(pesquisa).toHaveValue('merc');
});

// ---------------------------------------------------------------------------
// 24. Rótulos de «Classe» sem «Classe N —» duplicado
// ---------------------------------------------------------------------------

test('24. opções de «Classe» são «N — <nome>» sem «Classe N —» duplicado', async ({ page }) => {
  await navegar(page, BASE_E2);
  await page.getByLabel('Classe', { exact: true }).click();

  await expect(page.getByRole('option', { name: 'Todas', exact: true })).toBeVisible();
  // Nomes do nível 1 no seed, sem o prefixo «Classe N — »
  const esperado: Record<string, string> = {
    '1': 'Meios financeiros',
    '4': 'Contas a receber, contas a pagar, acréscimos e diferimentos',
    '7': 'Rendimentos e ganhos',
  };
  for (const [n, nome] of Object.entries(esperado)) {
    await expect(page.getByRole('option', { name: `${n} — ${nome}`, exact: true })).toBeVisible();
  }
  const textos = await page.getByRole('option').allTextContents();
  const classes = textos.map((t) => t.trim()).filter((t) => t !== 'Todas');
  expect(classes.length, 'oito classes').toBe(8);
  for (const t of classes) {
    expect(t, `rótulo «${t}»`).toMatch(/^[1-8] — /);
    expect(t, `rótulo «${t}» não repete «Classe N»`).not.toMatch(/Classe \d/);
  }
});

// ---------------------------------------------------------------------------
// 25. Código inválido em «Conta inicial»: erro no campo, sem navegar
// ---------------------------------------------------------------------------

test('25. «Conta inicial»=6a mostra erro junto do campo e não navega', async ({ page }) => {
  await navegar(page, BASE_E2);
  const urlAntes = page.url();

  const campo = page.getByLabel('Conta inicial', { exact: true });
  await campo.fill('6a');
  await page.getByRole('button', { name: 'Aplicar' }).click();

  // Mensagem no próprio campo: aria-invalid e texto visível no contentor do campo
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  // Mensagem no pai/avô do input ou referenciada por aria-describedby
  await expect
    .poll(() =>
      campo.evaluate((el) => {
        const textos: string[] = [];
        for (const id of (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) {
          textos.push(document.getElementById(id)?.textContent ?? '');
        }
        textos.push(el.parentElement?.textContent ?? '', el.parentElement?.parentElement?.textContent ?? '');
        return textos.some((t) => /inválid|código/i.test(t));
      }),
    )
    .toBe(true);

  expect(page.url(), 'URL não muda com código inválido').toBe(urlAntes);
  await expect(page).not.toHaveURL(/[?&]ci=/);
  await expect(campo).toHaveValue('6a');
});

// ===========================================================================
// S4 (#284 + #297) — drill-down de conta para o razão geral (por períodos)
//
// Actualizado em S2 (issue #297): o href usa agora parâmetros de período
// (`exercicio`, `de`, `ate`, opcionalmente `p13=1`) em vez de datas.
// Só linhas CONTA de contas com `aceitaLancamento` (não-contexto) têm o
// código como `<a>` com aria-label «Razão da conta <código> — <nome>» e href
// `/contabilidade/razao-geral?contaId=<id>&exercicio=<código>&de=<n>&ate=<n>`
// (mais `&p13=1` quando o balancete inclui o período 13).
// O id da conta 121 é uuid (tenant-bootstrap) e muda a cada base: lê-se da
// base em tempo de teste (só leitura), como em 26-payroll-tabelas.spec.ts.
// ===========================================================================

const RAZAO = '/contabilidade/razao-geral';
const BASE_S4 = 'exercicio=2026&de=3&ate=5';
const NOME_121 = 'Depósitos à ordem';
const ROTULO_121 = `Razão da conta 121 — ${NOME_121}`;

function urlBaseDados(): string {
  for (const f of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps/erp/.env')]) {
    if (fs.existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        // já carregado — usa o que estiver em process.env
      }
      break;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

/** Só leitura: id e aceitaLancamento das contas do tenant demo, por código. */
async function contasDemo(): Promise<Map<string, { id: string; aceitaLancamento: boolean }>> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    const r = await c.query<{ codigo: string; id: string; aceitaLancamento: boolean }>(
      `SELECT c.codigo, c.id, c."aceitaLancamento"
         FROM "ContaPGC" c JOIN "Tenant" t ON t.id = c."tenantId"
        WHERE t.slug = 'demo'`,
    );
    if (r.rows.length === 0) throw new Error('STOP: plano de contas do tenant demo vazio');
    return new Map(r.rows.map((l) => [l.codigo, { id: l.id, aceitaLancamento: l.aceitaLancamento }]));
  } finally {
    await c.end();
  }
}

/**
 * Compara o href da ligação de drill-down com o formato por períodos (#297 S2).
 * Parâmetros esperados: contaId, exercicio, de, ate; p13 só quando incluir13.
 */
function expectHrefRazaoPeriodos(
  href: string | null,
  esperado: { contaId: string; exercicio: string; de: string; ate: string; p13?: string },
  ctx: string,
): void {
  expect(href, `${ctx}: ligação sem href`).toBeTruthy();
  const u = new URL(href!, 'http://localhost');
  expect(u.pathname, `${ctx}: caminho do razão`).toBe(RAZAO);
  const params = Object.fromEntries(u.searchParams.entries());
  const chavesEsperadas = ['ate', 'contaId', 'de', 'exercicio', ...(esperado.p13 ? ['p13'] : [])];
  expect(
    Array.from(u.searchParams.keys()).sort(),
    `${ctx}: parâmetros sem repetições nem extras`,
  ).toEqual(chavesEsperadas);
  expect(params, `${ctx}: parâmetros do razão`).toEqual(esperado);
}

/** Linha CONTA pelo código exacto (não confunde '12' com '121'). */
function linhaConta(page: Page, codigo: string) {
  return page.locator('tbody tr[data-nivel]').filter({
    has: page.locator('td:first-child', { hasText: new RegExp(`^${codigo}$`) }),
  });
}

interface LinhaLigacao {
  codigo: string;
  nome: string;
  contexto: boolean;
  links: { texto: string; aria: string | null; href: string | null }[];
}

/** Para cada linha CONTA: as ligações na primeira célula. */
async function ligacoesPorLinha(page: Page): Promise<LinhaLigacao[]> {
  return page.locator('tbody tr[data-nivel]').evaluateAll((trs) =>
    trs.map((tr) => {
      const tds = Array.from(tr.querySelectorAll('td'));
      return {
        codigo: tds[0]?.textContent?.trim() ?? '',
        nome: tds[1]?.textContent?.trim() ?? '',
        contexto: tr.getAttribute('data-contexto') === '1',
        links: Array.from(tds[0]?.querySelectorAll('a') ?? []).map((a) => ({
          texto: a.textContent?.trim() ?? '',
          aria: a.getAttribute('aria-label'),
          href: a.getAttribute('href'),
        })),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// 26. Folha 121 tem ligação ao razão com conta e períodos 3..5 do exercício 2026
// ---------------------------------------------------------------------------

test('26. 121 (folha) tem ligação «Razão da conta 121 — …» para o razão períodos 3..5 do exercício 2026', async ({
  page,
}) => {
  const contas = await contasDemo();
  const c121 = contas.get('121');
  expect(c121?.aceitaLancamento, '121 é folha no seed').toBe(true);

  await navegar(page, BASE_S4);
  const link = page.getByRole('link', { name: ROTULO_121, exact: true });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('121'); // o texto é o código, e só o código
  // A ligação vive na primeira célula da linha 121
  await expect(linhaConta(page, '121').locator('td:first-child a')).toHaveCount(1);
  await expect(linhaConta(page, '121').locator('td:first-child a')).toHaveAttribute(
    'aria-label',
    ROTULO_121,
  );

  expectHrefRazaoPeriodos(
    await link.getAttribute('href'),
    { contaId: c121!.id, exercicio: '2026', de: '3', ate: '5' },
    '121 em 3..5',
  );

  // Toda a folha não-contexto mostrada tem exactamente uma ligação coerente
  const linhas = await ligacoesPorLinha(page);
  const folhas = linhas.filter((l) => !l.contexto && contas.get(l.codigo)?.aceitaLancamento);
  expect(folhas.length, 'há folhas em 3..5').toBeGreaterThan(1);
  for (const l of folhas) {
    expect(l.links.length, `folha ${l.codigo}: uma ligação`).toBe(1);
    expect(l.links[0]!.texto, `folha ${l.codigo}: texto = código`).toBe(l.codigo);
    expect(l.links[0]!.aria, `folha ${l.codigo}: aria-label`).toBe(
      `Razão da conta ${l.codigo} — ${l.nome}`,
    );
    expectHrefRazaoPeriodos(
      l.links[0]!.href,
      { contaId: contas.get(l.codigo)!.id, exercicio: '2026', de: '3', ate: '5' },
      `folha ${l.codigo}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 27. Clicar navega para o razão da 121 nos períodos 3..5 de 2026
// ---------------------------------------------------------------------------

test('27. clicar na ligação da 121 abre o razão da conta 121 nos períodos 3..5 de 2026', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  await page.getByRole('link', { name: ROTULO_121, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${RAZAO}\\?`));
  await expect(page).toHaveURL(/[?&]exercicio=2026(&|$)/);
  await expect(page).toHaveURL(/[?&]de=3(&|$)/);
  await expect(page).toHaveURL(/[?&]ate=5(&|$)/);
  // Parâmetros de datas NÃO devem estar no URL (#297)
  await expect(page).not.toHaveURL(/dataInicio/);
  await expect(page).not.toHaveURL(/dataFim/);
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: 'Razão Geral' })).toBeVisible();
  // O seletor mostra a conta e está no modo por períodos
  await expect(page.locator('#conta')).toContainText(`121 — ${NOME_121}`);
  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeChecked();
  // #343 (verificador): no razão «Do/Ao período» passaram a ui/Select (role combobox) com as
  // opções do balancete — o valor lê-se pelo rótulo mostrado, e o URL (de=3/ate=5) já está fixo acima.
  await expect(page.getByRole('combobox', { name: 'Do período' })).toContainText('03 — Março');
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('05 — Maio');
  // E o razão executou: linhas de saldo anterior e final presentes
  await expect(page.getByTestId('razao-saldo-anterior')).toBeVisible();
  await expect(page.getByTestId('razao-saldo-final')).toBeVisible();
  await expect(page.getByText('Escolha uma conta acima')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 28. Mães, subtotais, sintética e contexto não têm ligação
// ---------------------------------------------------------------------------

test('28. linhas-mãe (1, 12), «Total da classe N», sintética e contexto (q=ordem, q=caixa&zeradas=1) sem ligação', async ({
  page,
}) => {
  const contas = await contasDemo();

  await navegar(page, BASE_S4);
  for (const codigo of ['1', '12']) {
    await expect(linhaConta(page, codigo), `linha ${codigo} visível`).toHaveCount(1);
    await expect(
      linhaConta(page, codigo).locator('td:first-child a'),
      `mãe ${codigo} sem ligação`,
    ).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: /^Razão da conta 12? — / })).toHaveCount(0);

  // Toda a mãe mostrada (aceitaLancamento false) sem ligação nenhuma na linha
  const linhas = await ligacoesPorLinha(page);
  const maes = linhas.filter((l) => contas.get(l.codigo)?.aceitaLancamento === false);
  expect(maes.length, 'há mães em 3..5').toBeGreaterThan(1);
  for (const l of maes) {
    expect(l.links, `mãe ${l.codigo} sem ligação`).toEqual([]);
  }

  // «Total da classe N» e sintética: nenhuma ligação na linha
  const subtotais = page.locator('tbody tr[data-tipo="subtotal"]');
  expect(await subtotais.count(), 'há subtotais de classe').toBeGreaterThan(0);
  await expect(subtotais.first()).toContainText(/Total da classe \d/);
  await expect(page.locator('tbody tr[data-tipo="subtotal"] a')).toHaveCount(0);
  await expect(page.locator('tbody tr[data-tipo="sintetica"] a')).toHaveCount(0);

  // Contexto: q=ordem (121 «Depósitos à ordem» corresponde; 1 e 12 entram como
  // contexto) e q=caixa&zeradas=1 (11/111 sem movimento em 3..5 no seed; 1 é contexto).
  const casos = [
    { q: 'q=ordem', contextoEsperado: ['1', '12'], folhaComLigacao: '121' },
    { q: 'q=caixa&zeradas=1', contextoEsperado: ['1'], folhaComLigacao: '111' },
  ];
  for (const { q, contextoEsperado, folhaComLigacao } of casos) {
    await navegar(page, `${BASE_S4}&${q}`);
    const comQ = await ligacoesPorLinha(page);
    const contexto = comQ.filter((l) => l.contexto);
    for (const codigo of contextoEsperado) {
      expect(contexto.map((l) => l.codigo), `${q}: «${codigo}» é linha de contexto`).toContain(codigo);
    }
    for (const l of contexto) {
      expect(l.links, `${q}: contexto ${l.codigo} sem ligação`).toEqual([]);
    }
    for (const l of comQ.filter((r) => contas.get(r.codigo)?.aceitaLancamento === false)) {
      expect(l.links, `${q}: mãe ${l.codigo} sem ligação`).toEqual([]);
    }
    const folha = comQ.find((l) => l.codigo === folhaComLigacao);
    expect(folha, `${q}: ${folhaComLigacao} mostrada`).toBeTruthy();
    expect(folha!.contexto, `${q}: ${folhaComLigacao} corresponde à pesquisa`).toBe(false);
    expect(folha!.links.length, `${q}: folha ${folhaComLigacao} tem ligação`).toBe(1);
  }
});

// ---------------------------------------------------------------------------
// 29. Com período 13: href usa exercicio/de/ate/p13
// ---------------------------------------------------------------------------

test('29. de=12&ate=13&p13=1: a ligação da 121 usa exercicio=2026&de=12&ate=13&p13=1', async ({
  page,
}) => {
  const contas = await contasDemo();
  await navegar(page, 'exercicio=2026&de=12&ate=13&p13=1');
  const link = page.getByRole('link', { name: ROTULO_121, exact: true });
  await expect(link).toHaveCount(1);
  expectHrefRazaoPeriodos(
    await link.getAttribute('href'),
    { contaId: contas.get('121')!.id, exercicio: '2026', de: '12', ate: '13', p13: '1' },
    '121 em 12..13 com p13',
  );
});

// ---------------------------------------------------------------------------
// 30. A ligação não muda com o tipo de apresentação nem com filtros
// ---------------------------------------------------------------------------

test('30. a ligação da 121 é a mesma com tipo=periodo, tipo=acumulado e ci=1&cf=1', async ({
  page,
}) => {
  const contas = await contasDemo();
  const esperado = { contaId: contas.get('121')!.id, exercicio: '2026', de: '3', ate: '5' };
  for (const extra of ['tipo=periodo', 'tipo=acumulado', 'ci=1&cf=1', 'ci=1&cf=1&tipo=periodo&comSaldo=1']) {
    await navegar(page, `${BASE_S4}&${extra}`);
    const link = page.getByRole('link', { name: ROTULO_121, exact: true });
    await expect(link, `ligação presente com ${extra}`).toHaveCount(1);
    await expect(link).toHaveText('121');
    expectHrefRazaoPeriodos(await link.getAttribute('href'), esperado, `121 com ${extra}`);
  }
});

// ===========================================================================
// S5 (#285) — exportação CSV/Excel
//
// Contrato: .scratch/sdlc/balancete-phc/S5-contrato.md.
// Dois links no PageHeader, «Exportar CSV» e «Exportar Excel» (`<a href download>`),
// para GET /api/contabilidade/balancete/export?formato=csv|xlsx&<parâmetros da página>.
// Ficheiro `balancete-<exercicio>-<pi>-<pf>.<ext>`. CSV da casa (`toCsv`): BOM,
// separador `;`, CRLF, metadados opcionais antes do cabeçalho (por isso o cabeçalho
// procura-se pela linha cujo primeiro campo é «Conta»).
// Colunas (AMBOS): Conta · Descrição · Tipo · Nível · Movimento Débito · Movimento
// Crédito · Acumulado Débito · Acumulado Crédito · Saldo Devedor · Saldo Credor.
// Tipo ∈ {Conta, Subtotal, Sintética, Total}; decimais sem separador de milhares,
// ponto decimal, zeros como «0»; última linha Tipo «Total» = totais do núcleo.
// ===========================================================================

const EXPORT = '/api/contabilidade/balancete/export';
const COLUNAS_AMBOS = [
  'Conta',
  'Descrição',
  'Tipo',
  'Nível',
  'Movimento Débito',
  'Movimento Crédito',
  'Acumulado Débito',
  'Acumulado Crédito',
  'Saldo Devedor',
  'Saldo Credor',
];
const COLUNAS_PERIODO = COLUNAS_AMBOS.filter((c) => !c.startsWith('Acumulado'));
const COLUNAS_VALOR = COLUNAS_AMBOS.slice(4);

/** RFC-4180 com `;` — campos entre aspas podem conter `;`, aspas duplicadas e quebras. */
function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') {
      linha.push(campo);
      campo = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

interface CsvBalancete {
  cabecalho: string[];
  /** Linhas de dados como objecto coluna→valor (sem a linha «Total»). */
  corpo: Record<string, string>[];
  total: Record<string, string>;
}

function lerCsvBalancete(texto: string): CsvBalancete {
  const todas = parseCsv(texto);
  const iCab = todas.findIndex((l) => l[0] === 'Conta');
  expect(iCab, 'CSV: linha de cabeçalho começada por «Conta»').toBeGreaterThanOrEqual(0);
  const cabecalho = todas[iCab]!;
  const dados = todas
    .slice(iCab + 1)
    .filter((l) => !(l.length === 1 && l[0] === ''))
    .map((l) => {
      expect(l.length, `CSV: linha com ${cabecalho.length} campos: ${l.join(';')}`).toBe(
        cabecalho.length,
      );
      return Object.fromEntries(cabecalho.map((c, i) => [c, l[i] ?? '']));
    });
  const totais = dados.filter((d) => d['Tipo'] === 'Total');
  expect(totais.length, 'CSV: exactamente uma linha Tipo «Total»').toBe(1);
  expect(dados[dados.length - 1]!['Tipo'], 'CSV: a linha «Total» é a última').toBe('Total');
  return { cabecalho, corpo: dados.slice(0, -1), total: totais[0]! };
}

/** Valor do ecrã («—» = 0) arredondado a cêntimos. */
function centimosPagina(t: string): number {
  return t === '—' ? 0 : Math.round(parsePtNum(t) * 100);
}

/** Valor do CSV: sem separador de milhares, ponto decimal, nunca vazio. */
function centimosCsv(t: string, ctx: string): number {
  expect(t, `${ctx}: número no formato canónico (ponto decimal, sem milhares) — «${t}»`).toMatch(
    /^-?\d+(\.\d+)?$/,
  );
  return Math.round(Number(t) * 100);
}

async function descarregar(page: Page, nomeLink: 'Exportar CSV' | 'Exportar Excel' | 'Exportar PDF') {
  const link = page.getByRole('link', { name: nomeLink, exact: true });
  await expect(link).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const caminho = await download.path();
  expect(caminho, `${nomeLink}: o download completou`).toBeTruthy();
  return { nome: download.suggestedFilename(), bytes: fs.readFileSync(caminho!) };
}

async function hrefExport(
  page: Page,
  nomeLink: 'Exportar CSV' | 'Exportar Excel' | 'Exportar PDF',
): Promise<URL> {
  const link = page.getByRole('link', { name: nomeLink, exact: true });
  await expect(link).toHaveCount(1);
  const href = await link.getAttribute('href');
  expect(href, `${nomeLink}: href`).toBeTruthy();
  return new URL(href!, 'http://localhost');
}

/** Linhas do corpo da tabela, na ordem, no vocabulário do CSV. */
async function linhasPaginaParaCsv(page: Page) {
  return page.locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => {
      const tds = Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? '');
      const dt = tr.getAttribute('data-tipo');
      const nivel = tr.getAttribute('data-nivel');
      return {
        tipo: dt === 'subtotal' ? 'Subtotal' : dt === 'sintetica' ? 'Sintética' : nivel ? 'Conta' : '?',
        conta: dt ? '' : (tds[0] ?? ''),
        descricao: tds[1] ?? '',
        nivel: nivel ?? '',
        valores: tds.slice(2),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// 31. Links «Exportar CSV» / «Exportar Excel» com os parâmetros da página
// ---------------------------------------------------------------------------

test('31. links «Exportar CSV» e «Exportar Excel» apontam para a exportação com exercicio/de/ate', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  for (const [nome, formato] of [
    ['Exportar CSV', 'csv'],
    ['Exportar Excel', 'xlsx'],
  ] as const) {
    const link = page.getByRole('link', { name: nome, exact: true });
    await expect(link, `${nome}: um link`).toHaveCount(1);
    await expect(link, `${nome}: <a download>`).toHaveAttribute('download');
    const u = await hrefExport(page, nome);
    expect(u.pathname, `${nome}: rota`).toBe(EXPORT);
    expect(u.searchParams.getAll('formato'), `${nome}: formato`).toEqual([formato]);
    expect(u.searchParams.getAll('exercicio'), `${nome}: exercicio`).toEqual(['2026']);
    expect(u.searchParams.getAll('de'), `${nome}: de`).toEqual(['3']);
    expect(u.searchParams.getAll('ate'), `${nome}: ate`).toEqual(['5']);
  }
});

// ---------------------------------------------------------------------------
// 32. CSV: nome, cabeçalho AMBOS, linhas = página, «Total» = «Totais»
// ---------------------------------------------------------------------------

test('32. «Exportar CSV» descarrega balancete-2026-3-5.csv com as colunas, as linhas e os «Totais» da página', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  const totaisPagina = await celulasTotais(page); // ['Totais', movD, movC, acumD, acumC, sD, sC]
  expect(totaisPagina.length, 'Totais: rótulo + 6 valores').toBe(7);
  const linhasPagina = await linhasPaginaParaCsv(page);
  expect(linhasPagina.length, 'há linhas em 3..5').toBeGreaterThan(1);

  const { nome, bytes } = await descarregar(page, 'Exportar CSV');
  expect(nome).toBe('balancete-2026-3-5.csv');
  const csv = lerCsvBalancete(bytes.toString('utf8'));
  expect(csv.cabecalho, 'cabeçalho AMBOS exacto e por esta ordem').toEqual(COLUNAS_AMBOS);

  // Todos os valores numéricos no formato canónico, nunca vazios (zeros = «0»)
  for (const r of [...csv.corpo, csv.total]) {
    for (const c of COLUNAS_VALOR) centimosCsv(r[c] ?? '', `${r['Tipo']} ${r['Conta']} / ${c}`);
    expect(['Conta', 'Subtotal', 'Sintética', 'Total'], `Tipo «${r['Tipo']}»`).toContain(r['Tipo']);
    if (r['Tipo'] === 'Subtotal' || r['Tipo'] === 'Total') {
      expect(r['Nível'], `${r['Tipo']}: Nível vazio`).toBe('');
    }
  }

  // «Total» = «Totais» do ecrã, a cêntimos
  COLUNAS_VALOR.forEach((c, i) => {
    expect(centimosCsv(csv.total[c]!, `Total / ${c}`), `Total / ${c} = Totais do ecrã`).toBe(
      centimosPagina(totaisPagina[i + 1]!),
    );
  });

  // Mesmas linhas, mesma ordem, mesmos valores que a tabela
  expect(
    csv.corpo.map((r) => `${r['Tipo']}|${r['Conta']}`),
    'linhas do CSV = linhas da tabela, pela mesma ordem',
  ).toEqual(linhasPagina.map((l) => `${l.tipo}|${l.conta}`));
  csv.corpo.forEach((r, i) => {
    const p = linhasPagina[i]!;
    const ctx = `linha ${i + 1} (${p.tipo} ${p.conta})`;
    if (p.tipo === 'Conta') {
      expect(r['Nível'], `${ctx}: Nível = data-nivel`).toBe(p.nivel);
      expect(r['Descrição'], `${ctx}: Descrição = nome`).toBe(p.descricao);
    }
    if (p.tipo === 'Subtotal') {
      expect(r['Descrição'], `${ctx}: Descrição`).toMatch(/^Total da classe [1-8]$/);
      expect(r['Descrição']).toBe(p.descricao);
    }
    if (p.tipo === 'Sintética') {
      expect(r['Descrição'], `${ctx}: Descrição`).toBe(
        'Resultados de exercícios anteriores por encerrar (implícita)',
      );
    }
    COLUNAS_VALOR.forEach((c, j) => {
      expect(centimosCsv(r[c]!, `${ctx} / ${c}`), `${ctx} / ${c}`).toBe(
        centimosPagina(p.valores[j]!),
      );
    });
  });

  // A 121 está lá, com Tipo «Conta» e Nível 3
  const r121 = csv.corpo.find((r) => r['Conta'] === '121');
  expect(r121, '121 no CSV').toBeTruthy();
  expect(r121!['Tipo']).toBe('Conta');
  expect(r121!['Nível']).toBe('3');
  expect(r121!['Descrição']).toBe(NOME_121);
});

// ---------------------------------------------------------------------------
// 33. tipo=periodo&excluir=121: sem o par Acumulado, sem 121, «Total» igual
// ---------------------------------------------------------------------------

test('33. com tipo=periodo&excluir=121 o CSV não tem Acumulado nem a 121 e o «Total» não muda', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  const base = lerCsvBalancete((await descarregar(page, 'Exportar CSV')).bytes.toString('utf8'));

  await navegar(page, `${BASE_S4}&tipo=periodo&excluir=121`);
  const totaisPagina = await celulasTotais(page); // ['Totais', movD, movC, sD, sC]
  expect(totaisPagina.length, 'Totais por período: rótulo + 4 valores').toBe(5);

  const u = await hrefExport(page, 'Exportar CSV');
  expect(u.searchParams.get('tipo'), 'href leva tipo=periodo').toBe('periodo');
  expect(u.searchParams.get('excluir'), 'href leva excluir=121').toBe('121');

  const { nome, bytes } = await descarregar(page, 'Exportar CSV');
  expect(nome).toBe('balancete-2026-3-5.csv');
  const csv = lerCsvBalancete(bytes.toString('utf8'));
  expect(csv.cabecalho, 'cabeçalho Por período: sem Acumulado Débito/Crédito').toEqual(
    COLUNAS_PERIODO,
  );

  for (const r of csv.corpo) {
    expect(r['Conta'].startsWith('121'), `conta ${r['Conta']} devia estar excluída`).toBe(false);
  }
  expect(csv.corpo.some((r) => r['Conta'] === '12'), '«12» continua').toBe(true);

  for (const c of COLUNAS_PERIODO.slice(4)) {
    expect(centimosCsv(csv.total[c]!, `Total / ${c}`), `Total / ${c} igual ao do CSV sem filtros`).toBe(
      centimosCsv(base.total[c]!, `Total base / ${c}`),
    );
  }
  COLUNAS_PERIODO.slice(4).forEach((c, i) => {
    expect(centimosCsv(csv.total[c]!, `Total / ${c}`), `Total / ${c} = Totais do ecrã`).toBe(
      centimosPagina(totaisPagina[i + 1]!),
    );
  });
});

// ---------------------------------------------------------------------------
// 34. «Exportar Excel» descarrega um .xlsx (ZIP)
// ---------------------------------------------------------------------------

test('34. «Exportar Excel» descarrega balancete-2026-3-5.xlsx (assinatura ZIP «PK»)', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  const { nome, bytes } = await descarregar(page, 'Exportar Excel');
  expect(nome).toBe('balancete-2026-3-5.xlsx');
  expect(bytes.length, 'ficheiro não vazio').toBeGreaterThan(4);
  expect(bytes.subarray(0, 4).toString('hex'), 'assinatura ZIP local header (PK\\x03\\x04)').toBe(
    '504b0304',
  );
});

// ---------------------------------------------------------------------------
// 35. Os links seguem os filtros aplicados pela UI (e o voltar atrás)
// ---------------------------------------------------------------------------

test('35. depois de aplicar filtros pela UI os links de exportação levam-nos; voltar atrás repõe', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  let u = await hrefExport(page, 'Exportar CSV');
  expect(u.searchParams.has('excluir'), 'sem filtros: sem excluir').toBe(false);
  expect(u.searchParams.get('tipo') ?? 'ambos', 'sem filtros: tipo ambos').not.toBe('periodo');

  await page.getByLabel('Excluir contas', { exact: true }).fill('121');
  await escolherApresentacao(page, 'Por período'); // clica «Aplicar»
  await expect(page).toHaveURL(/[?&]excluir=121(&|$)/);
  await expect(page).toHaveURL(/[?&]tipo=periodo(&|$)/);
  await page.waitForLoadState('networkidle');

  for (const nome of ['Exportar CSV', 'Exportar Excel'] as const) {
    const link = page.getByRole('link', { name: nome, exact: true });
    await expect(link, `${nome}: href com excluir=121`).toHaveAttribute('href', /[?&]excluir=121(&|$)/);
    await expect(link, `${nome}: href com tipo=periodo`).toHaveAttribute('href', /[?&]tipo=periodo(&|$)/);
    u = await hrefExport(page, nome);
    expect(u.pathname).toBe(EXPORT);
    expect(u.searchParams.get('formato')).toBe(nome === 'Exportar CSV' ? 'csv' : 'xlsx');
    expect(u.searchParams.get('exercicio')).toBe('2026');
    expect(u.searchParams.get('de')).toBe('3');
    expect(u.searchParams.get('ate')).toBe('5');
  }

  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]excluir=/);
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('link', { name: 'Exportar CSV', exact: true }),
    'voltar atrás: href sem excluir',
  ).not.toHaveAttribute('href', /[?&]excluir=/);
});

// ===========================================================================
// S6 (#286) — exportação PDF (A4 horizontal)
//
// Contrato: .scratch/sdlc/balancete-phc/S6-contrato.md.
// Terceiro link no PageHeader, «Exportar PDF» (`<a href download>`), para a mesma
// GET /api/contabilidade/balancete/export com formato=pdf e os parâmetros da página.
// Resposta application/pdf, anexo `balancete-<exercicio>-<pi>-<pf>.pdf`.
// O conteúdo textual do PDF (cabeçalho, Transporte/A transportar, Totais,
// igualdades, «Página x de y») é coberto pelo oráculo unitário; aqui só
// link, download e assinatura.
// ===========================================================================

/** Número de objectos de página (`/Type /Page`, não `/Pages`) num PDF não cifrado. */
function contarPaginasPdf(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// 36. Link «Exportar PDF» com formato=pdf e exercicio/de/ate
// ---------------------------------------------------------------------------

test('36. link «Exportar PDF» aponta para a exportação com formato=pdf e exercicio/de/ate', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  const link = page.getByRole('link', { name: 'Exportar PDF', exact: true });
  await expect(link, 'Exportar PDF: um link').toHaveCount(1);
  await expect(link, 'Exportar PDF: <a download>').toHaveAttribute('download');
  // `download` sem valor: o nome vem do Content-Disposition do servidor.
  expect(await link.getAttribute('download'), 'download sem valor').toBe('');
  const u = await hrefExport(page, 'Exportar PDF');
  expect(u.pathname, 'rota').toBe(EXPORT);
  expect(u.searchParams.getAll('formato'), 'formato').toEqual(['pdf']);
  expect(u.searchParams.getAll('exercicio'), 'exercicio').toEqual(['2026']);
  expect(u.searchParams.getAll('de'), 'de').toEqual(['3']);
  expect(u.searchParams.getAll('ate'), 'ate').toEqual(['5']);

  // Os outros dois continuam lá, com o seu formato
  for (const [nome, formato] of [
    ['Exportar CSV', 'csv'],
    ['Exportar Excel', 'xlsx'],
  ] as const) {
    expect((await hrefExport(page, nome)).searchParams.get('formato'), `${nome}: formato`).toBe(
      formato,
    );
  }
});

// ---------------------------------------------------------------------------
// 37. Download: nome e assinatura «%PDF»
// ---------------------------------------------------------------------------

test('37. «Exportar PDF» descarrega balancete-2026-3-5.pdf (assinatura «%PDF»)', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  const { nome, bytes } = await descarregar(page, 'Exportar PDF');
  expect(nome).toBe('balancete-2026-3-5.pdf');
  expect(bytes.length, 'ficheiro não vazio').toBeGreaterThan(5);
  expect(bytes.subarray(0, 5).toString('latin1'), 'assinatura PDF').toBe('%PDF-');
  expect(contarPaginasPdf(bytes), 'pelo menos uma página').toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// 38. zeradas=1: muitas linhas → várias páginas, < 2 MB, < 20 s
// ---------------------------------------------------------------------------

test('38. com zeradas=1 o PDF tem várias páginas, menos de 2 MB e responde em menos de 20 s', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await navegar(page, `${BASE_S4}&zeradas=1`);
  const nLinhas = await page.locator('tbody tr').count();
  expect(nLinhas, 'pré-condição: zeradas=1 dá muitas linhas').toBeGreaterThan(100);

  const u = await hrefExport(page, 'Exportar PDF');
  expect(u.searchParams.get('zeradas'), 'href leva zeradas=1').toBe('1');
  expect(u.searchParams.get('formato')).toBe('pdf');

  // Tempo do pedido medido pela API do contexto (mesma sessão), sem depender do download.
  const inicio = Date.now();
  const resp = await page.request.get(`${u.pathname}${u.search}`, { timeout: 30_000 });
  const ms = Date.now() - inicio;
  expect(resp.status(), 'HTTP 200').toBe(200);
  expect(resp.headers()['content-type'] ?? '', 'Content-Type').toMatch(/^application\/pdf/);
  expect(resp.headers()['content-disposition'] ?? '', 'anexo com o nome').toMatch(
    /attachment;.*filename="?balancete-2026-3-5\.pdf"?/,
  );
  const bytes = await resp.body();
  expect(bytes.subarray(0, 5).toString('latin1'), 'assinatura PDF').toBe('%PDF-');
  expect(bytes.length, 'tamanho razoável (< 2 MB)').toBeLessThan(2 * 1024 * 1024);
  expect(ms, `pedido em ${ms} ms (< 20 s em dev)`).toBeLessThan(20_000);
  expect(contarPaginasPdf(bytes), `várias páginas para ${nLinhas} linhas`).toBeGreaterThanOrEqual(2);

  // E o link também descarrega
  const dl = await descarregar(page, 'Exportar PDF');
  expect(dl.nome).toBe('balancete-2026-3-5.pdf');
  expect(dl.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
});

// ---------------------------------------------------------------------------
// 39. O link PDF segue os filtros aplicados pela UI
// ---------------------------------------------------------------------------

test('39. depois de aplicar «Excluir contas»=121 pela UI o link PDF leva excluir=121', async ({
  page,
}) => {
  await navegar(page, BASE_S4);
  let u = await hrefExport(page, 'Exportar PDF');
  expect(u.searchParams.has('excluir'), 'sem filtros: sem excluir').toBe(false);

  await page.getByLabel('Excluir contas', { exact: true }).fill('121');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/[?&]excluir=121(&|$)/);
  await page.waitForLoadState('networkidle');

  const link = page.getByRole('link', { name: 'Exportar PDF', exact: true });
  await expect(link, 'href com excluir=121').toHaveAttribute('href', /[?&]excluir=121(&|$)/);
  u = await hrefExport(page, 'Exportar PDF');
  expect(u.pathname).toBe(EXPORT);
  expect(u.searchParams.get('formato')).toBe('pdf');
  expect(u.searchParams.get('exercicio')).toBe('2026');
  expect(u.searchParams.get('de')).toBe('3');
  expect(u.searchParams.get('ate')).toBe('5');
});
