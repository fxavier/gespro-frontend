/**
 * Razão Geral por intervalos de períodos — ORÁCULO E2E (S2, issue #297).
 *
 * ESTES TESTES ESTÃO VERMELHOS até à implementação (S2). NUNCA alterar
 * este ficheiro sem autorização do autor do oráculo; alterar = BLOCKER.
 *
 * Cenários:
 *  1–2. Seletor: modo «Por períodos» (radio) e campos Exercício/Do período/Ao período/p13.
 *  3.   Submeter o modo períodos escreve ?exercicio/de/ate no URL (sem dataInicio/dataFim).
 *  4.   URL por períodos: linhas «Saldo anterior» e «Saldo final» presentes.
 *  5.   Cabeçalho menciona o código do exercício e «períodos N a M».
 *  6.   Sem movimentos no intervalo: card saldo anterior/final continua a aparecer.
 *  7.   Seletor reflecte ?exercicio/de/ate vindos do URL (modo períodos activo, campos preenchidos).
 *  8.   Seletor reflecte p13=1 (checkbox activo).
 *  9.   Modo datas (?contaId&dataInicio&dataFim) também exibe «Saldo anterior» e «Saldo final».
 * 10.   Invariante: saldo final do razão de 121 (de=1&ate=6) = saldo devedor do balancete.
 * 11.   Invariante Σ D/C: total débito e crédito do razão = movimento D/C do balancete.
 *
 * #343 (verificador): testes 3, 7, 8 e 13 adaptados ao ui/Select — `toHaveValue`/`fill`
 * passaram a rótulo mostrado e escolha de opção; nenhuma asserção removida.
 *
 * Regras de casa: sem sleeps arbitrários; networkidle antes de ler valores;
 * expect com auto-retry; só leitura da base.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const RAZAO = '/contabilidade/razao-geral';
const BALANCETE = '/contabilidade/balancete';
const EXERCICIO = '2026';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  if (!url) throw new Error('DATABASE_URL não definida — verifique apps/erp/.env');
  return url;
}

/** id e exercicioId (para o FiltroRazaoPeriodosSchema) da conta 121 no tenant demo. */
async function dadosConta121(): Promise<{ contaId: string; exercicioId: string }> {
  const c = new Client({ connectionString: urlBaseDados() });
  await c.connect();
  try {
    const rConta = await c.query<{ id: string }>(
      `SELECT c.id FROM "ContaPGC" c
         JOIN "Tenant" t ON t.id = c."tenantId"
        WHERE t.slug = 'demo' AND c.codigo = '121'`,
    );
    if (rConta.rows.length === 0) throw new Error('STOP: conta 121 não encontrada no tenant demo');

    const rExercicio = await c.query<{ id: string }>(
      `SELECT e.id FROM "ExercicioContabil" e
         JOIN "Tenant" t ON t.id = e."tenantId"
        WHERE t.slug = 'demo' AND e.codigo = '${EXERCICIO}'`,
    );
    if (rExercicio.rows.length === 0)
      throw new Error(`STOP: exercício ${EXERCICIO} não encontrado no tenant demo`);

    return { contaId: rConta.rows[0]!.id, exercicioId: rExercicio.rows[0]!.id };
  } finally {
    await c.end();
  }
}

/** Converte texto formatado em PT-PT para número (sem símbolos de moeda). */
function parsePtNum(t: string): number {
  const s = t
    .replace(/[^\d,.-]/g, '') // remove símbolos de moeda e espaços
    .replace(/\./g, '')        // remove ponto (separador de milhar PT)
    .replace(',', '.');         // vírgula decimal → ponto
  return Number(s);
}

async function aguardar(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// 1. Seletor: modo «Por períodos» e «Por datas» existem como opções
// ---------------------------------------------------------------------------

test('1. seletor tem opções «Por datas» e «Por períodos» (radio group)', async ({ page }) => {
  await page.goto(RAZAO);
  await aguardar(page);

  await expect(page.getByRole('radio', { name: 'Por datas' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Activar «Por períodos» mostra os campos correctos
// ---------------------------------------------------------------------------

test('2. ao activar «Por períodos» aparecem «Exercício», «Do período», «Ao período» e «Incluir período 13»', async ({
  page,
}) => {
  await page.goto(RAZAO);
  await aguardar(page);

  await page.getByRole('radio', { name: 'Por períodos' }).click();

  await expect(page.getByLabel('Exercício')).toBeVisible();
  await expect(page.getByLabel('Do período')).toBeVisible();
  await expect(page.getByLabel('Ao período')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Incluir período 13' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 3. Submeter modo períodos escreve exercicio/de/ate no URL (sem datas)
// ---------------------------------------------------------------------------

test('3. submeter «Por períodos» escreve exercicio/de/ate no URL sem dataInicio/dataFim', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();

  // Navegar com a conta e intervalo por períodos pré-carregados para evitar
  // interagir com o seletor de exercício (que pode ser um Select/Combobox).
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  // Modo períodos deve estar activo; alterar «Ao período» e re-submeter
  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeChecked();
  // #343: «Ao período» é um ui/Select com as opções do balancete (antes: Input type=number).
  await page.getByRole('combobox', { name: 'Ao período' }).click();
  await page.getByRole('option', { name: '06 — Junho', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('06 — Junho');
  await page.getByRole('button', { name: 'Consultar' }).click();
  await aguardar(page);

  await expect(page).toHaveURL(/[?&]exercicio=2026(&|$)/);
  await expect(page).toHaveURL(/[?&]de=3(&|$)/);
  await expect(page).toHaveURL(/[?&]ate=6(&|$)/);
  await expect(page).not.toHaveURL(/dataInicio/);
  await expect(page).not.toHaveURL(/dataFim/);
});

// ---------------------------------------------------------------------------
// 4. URL por períodos: linhas «Saldo anterior» e «Saldo final» visíveis
// ---------------------------------------------------------------------------

test('4. ?contaId&exercicio&de&ate → linhas «Saldo anterior» e «Saldo final» visíveis', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();
  // 121 tem movimento nos períodos 3..5 (seed)
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  await expect(page.getByTestId('razao-saldo-anterior')).toBeVisible();
  await expect(page.getByTestId('razao-saldo-final')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 5. Cabeçalho menciona o exercício e o intervalo de períodos
// ---------------------------------------------------------------------------

test('5. elemento data-testid="razao-intervalo" contém o exercício e «períodos 3 a 5»', async ({ page }) => {
  const { contaId } = await dadosConta121();
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  // O elemento de intervalo (testid próprio) deve conter o código do exercício e
  // o intervalo de períodos — sem tocar nas datas das linhas de movimento.
  const intervalo = page.getByTestId('razao-intervalo');
  await expect(intervalo).toContainText(EXERCICIO);
  await expect(intervalo).toContainText(/períodos 3 a 5/i);
});

// ---------------------------------------------------------------------------
// 6. Sem movimentos no intervalo: card saldo anterior/final ainda aparece
// ---------------------------------------------------------------------------

test('6. período 13 sem lançamentos: «Saldo anterior» e «Saldo final» visíveis mesmo sem linhas', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();
  // Período 13 sem lançamentos (encerramento #138 ainda não lançado no seed)
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=13&ate=13&p13=1`);
  await aguardar(page);

  await expect(page.getByTestId('razao-saldo-anterior')).toBeVisible();
  await expect(page.getByTestId('razao-saldo-final')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 7. Seletor reflecte ?exercicio/de/ate vindos do URL
// ---------------------------------------------------------------------------

test('7. URL ?exercicio=2026&de=3&ate=5 → modo «Por períodos» activo, campos preenchidos', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeChecked();
  // #343: os três são ui/Select (role combobox) — o valor lê-se pelo rótulo mostrado.
  await expect(page.getByRole('combobox', { name: 'Exercício' })).toContainText(EXERCICIO);
  await expect(page.getByRole('combobox', { name: 'Do período' })).toContainText('03 — Março');
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('05 — Maio');
  // Sem p13 no URL → checkbox inactivo
  await expect(page.getByRole('checkbox', { name: 'Incluir período 13' })).not.toBeChecked();
});

// ---------------------------------------------------------------------------
// 8. Seletor reflecte p13=1 vindo do URL
// ---------------------------------------------------------------------------

test('8. URL ?exercicio=2026&de=12&ate=13&p13=1 → checkbox «Incluir período 13» activo', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=12&ate=13&p13=1`);
  await aguardar(page);

  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Incluir período 13' })).toBeChecked();
  // #343: ui/Select — rótulos do balancete.
  await expect(page.getByRole('combobox', { name: 'Do período' })).toContainText('12 — Dezembro');
  await expect(page.getByRole('combobox', { name: 'Ao período' })).toContainText('13 — Encerramento');
});

// ---------------------------------------------------------------------------
// 9. Modo datas (?dataInicio&dataFim) também exibe «Saldo anterior» e «Saldo final»
// ---------------------------------------------------------------------------

test('9. modo datas (?dataInicio&dataFim) exibe «Saldo anterior» e «Saldo final»', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();
  // Datas correspondentes ao intervalo 3..5 de 2026 (Maputo)
  await page.goto(`${RAZAO}?contaId=${contaId}&dataInicio=2026-03-01&dataFim=2026-05-31`);
  await aguardar(page);

  await expect(page.getByTestId('razao-saldo-anterior')).toBeVisible();
  await expect(page.getByTestId('razao-saldo-final')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 10. Invariante: saldo final do razão = saldo do balancete (de=1&ate=6)
//
// O saldo final do razão de uma conta, para o mesmo intervalo de períodos,
// deve ser igual ao «Saldo» dessa conta no balancete de verificação (#297).
// ---------------------------------------------------------------------------

test('10. saldo final do razão de 121 (de=1&ate=6) = saldo devedor do balancete (mesmo intervalo)', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();

  // 10a. Ler o saldo devedor da 121 no balancete (períodos 1..6)
  await page.goto(`${BALANCETE}?exercicio=${EXERCICIO}&de=1&ate=6`);
  await aguardar(page);

  // Linha 121 no balancete (aceitaLancamento → tem link na 1ª célula; localiza por código exacto)
  const linha121 = page.locator('tbody tr[data-nivel]').filter({
    has: page.locator('td:first-child', { hasText: /^121$/ }),
  });
  await expect(linha121, 'conta 121 visível no balancete').toHaveCount(1);

  // Colunas em modo AMBOS (padrão): Conta | Desc | MovD | MovC | AcumD | AcumC | SaldoD | SaldoC
  // Índice 6 = Saldo Devedor; 121 é DEVEDORA → saldo > 0 em coluna Devedor
  const saldoDevedorTexto = await linha121.locator('td').nth(6).textContent();
  expect(saldoDevedorTexto, '121: Saldo Devedor não é «—» em 1..6').not.toBe('—');
  const saldoBalancete = parsePtNum(saldoDevedorTexto ?? '');
  expect(saldoBalancete, 'saldo balancete > 0 (conta devedora com movimento)').toBeGreaterThan(0);

  // 10b. Ler o saldo final do razão no mesmo intervalo
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=1&ate=6`);
  await aguardar(page);

  const saldoFinalEl = page.getByTestId('razao-saldo-final');
  await expect(saldoFinalEl, 'linha saldo final visível').toBeVisible();

  const saldoFinalTexto = await saldoFinalEl.textContent();
  const saldoRazao = parsePtNum(saldoFinalTexto ?? '');

  // Comparar a cêntimos (evita flutuação de ponto flutuante)
  expect(
    Math.round(saldoRazao * 100),
    `saldo final razão (${saldoRazao}) = saldo balancete (${saldoBalancete}) em cêntimos`,
  ).toBe(Math.round(saldoBalancete * 100));
});

// ---------------------------------------------------------------------------
// 11. Invariante Σ D/C: totais do razão = movimento D/C do balancete (de=3&ate=5)
//
// `saldoFinal.totais.debito` e `.credito` devem igualar `movD` e `movC` do
// balancete para o mesmo intervalo (#297 §contrato RazaoConta.totais).
// ---------------------------------------------------------------------------

test('11. Σ débito e Σ crédito do razão de 121 (de=3&ate=5) = movimento D/C do balancete', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();

  // 11a. Ler movimento D/C da 121 no balancete (períodos 3..5)
  await page.goto(`${BALANCETE}?exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  const linha121 = page.locator('tbody tr[data-nivel]').filter({
    has: page.locator('td:first-child', { hasText: /^121$/ }),
  });
  await expect(linha121).toHaveCount(1);

  // Modo AMBOS: Conta | Desc | MovD | MovC | AcumD | AcumC | SaldoD | SaldoC
  const movDTexto = await linha121.locator('td').nth(2).textContent();
  const movCTexto = await linha121.locator('td').nth(3).textContent();
  const movD = parsePtNum(movDTexto ?? '');
  const movC = parsePtNum(movCTexto ?? '');
  expect(movD, 'movimento D > 0 em 3..5 (seed)').toBeGreaterThan(0);

  // 11b. Ler Σ D/C do razão (no row «Saldo final» ou em testids próprios)
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=${EXERCICIO}&de=3&ate=5`);
  await aguardar(page);

  await expect(page.getByTestId('razao-saldo-final')).toBeVisible();

  // O «Saldo final» deve expor os totais D/C acessíveis por testid
  const totalDebitoEl = page.getByTestId('razao-total-debito');
  const totalCreditoEl = page.getByTestId('razao-total-credito');
  await expect(totalDebitoEl, 'testid razao-total-debito visível').toBeVisible();
  await expect(totalCreditoEl, 'testid razao-total-credito visível').toBeVisible();

  const totalDebito = parsePtNum((await totalDebitoEl.textContent()) ?? '');
  const totalCredito = parsePtNum((await totalCreditoEl.textContent()) ?? '');

  expect(
    Math.round(totalDebito * 100),
    `Σ débito razão (${totalDebito}) = movimento D balancete (${movD})`,
  ).toBe(Math.round(movD * 100));

  expect(
    Math.round(totalCredito * 100),
    `Σ crédito razão (${totalCredito}) = movimento C balancete (${movC})`,
  ).toBe(Math.round(movC * 100));
});

// ---------------------------------------------------------------------------
// 12. Fluxo sem params: seleccionar conta, activar «Por períodos», Consultar
//
// Garante que o seletor escreve `exercicio=<código>` no URL quando o utilizador
// parte de uma página sem parâmetros e escolhe o modo por períodos.
// ---------------------------------------------------------------------------

test('12. sem params: seleccionar 121, «Por períodos», «Consultar» → URL tem exercicio= não vazio, modo activo, razao-intervalo tem «períodos»', async ({
  page,
}) => {
  await page.goto(RAZAO);
  await aguardar(page);

  // Abrir a combobox de conta e escolher 121
  await page.locator('#conta').click();
  await page.keyboard.type('121');
  await page.getByRole('option', { name: /121/ }).first().click();

  // Activar o modo «Por períodos»
  await page.getByRole('radio', { name: 'Por períodos' }).click();

  // Clicar «Consultar» (usa o exercício por omissão do seletor)
  await page.getByRole('button', { name: 'Consultar' }).click();
  await aguardar(page);

  // URL deve ter exercicio= com valor não vazio
  await expect(page).toHaveURL(/[?&]exercicio=[^&]+/);
  const url = new URL(page.url());
  expect(url.searchParams.get('exercicio'), 'exercicio= não vazio').toBeTruthy();

  // Modo períodos mantém-se seleccionado
  await expect(page.getByRole('radio', { name: 'Por períodos' })).toBeChecked();

  // Cabeçalho de intervalo menciona «períodos»
  await expect(page.getByTestId('razao-intervalo')).toContainText(/períodos/i);
});

// ---------------------------------------------------------------------------
// 13. Exercício inexistente (1999): aviso visível; razao-intervalo usa fallback
//
// Quando `exercicio=1999` não existe na lista do tenant, a página recorre ao
// exercício corrente ou ao primeiro disponível, mostra um aviso com «1999» e
// o campo «Exercício» reflecte o código usado, não «1999».
// ---------------------------------------------------------------------------

test('13. exercicio=1999 (inexistente): razao-intervalo não contém «1999»; aviso visível com «1999»', async ({
  page,
}) => {
  const { contaId } = await dadosConta121();
  await page.goto(`${RAZAO}?contaId=${contaId}&exercicio=1999&de=1&ate=12`);
  await aguardar(page);

  // O intervalo exibido usa o fallback, não o código inválido
  const intervalo = page.getByTestId('razao-intervalo');
  await expect(intervalo).toBeVisible();
  await expect(intervalo).not.toContainText('1999');

  // O campo «Exercício» no seletor mostra o exercício realmente usado (não «1999»)
  // «1999» não existe na lista → nunca pode aparecer como valor seleccionado
  const exField = page.getByRole('combobox', { name: 'Exercício' });
  await expect(exField).toBeVisible();
  await expect(exField).not.toContainText('1999');

  // Aviso visível que menciona o código pedido «1999» como não encontrado
  // (texto tipo: «Exercício 1999 não encontrado»)
  await expect(page.getByText(/não encontrado/i)).toContainText('1999');
});
