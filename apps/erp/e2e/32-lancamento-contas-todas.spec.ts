/**
 * E2E — issue #87: contas das classes 5–8 inacessíveis no formulário de
 * lançamento contabilístico (lista truncada a 200 contas).
 *
 * Causa: `listarContas({ aceitaLancamento: true, take: 200 })` no SSR de
 * `/contabilidade/lancamentos/novo` e `[id]/editar` deixa de fora 237 das 437
 * contas folha do PGC. As classes 6–8 ficam inteiramente inalcançáveis:
 *   - primeira conta da classe 6 (611): índice 222 na lista ordenada
 *   - primeira conta da classe 7 (711): índice 357
 *   - primeira conta da classe 8 (851): índice 435
 *
 * Estes testes são VERMELHOS na versão actual do código (propósito):
 *   - `getByRole('option', { name: /711 — Mercadorias/ })` expira porque a
 *     opção nunca aparece na lista local truncada.
 *   - Se passarem na versão actual, o bug descrito não existe — PARAR e reportar.
 *
 * Os testes são agnósticos à implementação do fix: testam comportamento
 * visível (escrever o código, a opção aparece, seleccionar).  Funcionam
 * tanto com Combobox local (filtro imediato) como com ComboboxRemoto
 * (debounce 250 ms + servidor): o expect de visibilidade tem auto-retry.
 *
 * Contas escolhidas (folhas, aceitaLancamento: true, acima do corte de 200):
 *   611  Custo dos inventários vendidos ou consumidos  (classe 6, índice 222)
 *   711  Mercadorias                                   (classe 7, índice 357)
 *   851  Imposto corrente                              (classe 8, índice 435)
 *
 * Escrevem no tenant demo — limpeza da base local:
 *
 *   docker exec gespro-db psql \
 *     -U "$(docker exec gespro-db printenv POSTGRES_USER)" \
 *     -d "$(docker exec gespro-db printenv POSTGRES_DB)" -c "
 *     BEGIN;
 *     DELETE FROM \"PartidaLancamento\" WHERE \"lancamentoId\" IN
 *       (SELECT id FROM \"Lancamento\" WHERE historico LIKE '%E2E #87%');
 *     DELETE FROM \"Lancamento\" WHERE historico LIKE '%E2E #87%';
 *     COMMIT;"
 */

import { test, expect, type Page } from '@playwright/test';

const LISTA = '/contabilidade/lancamentos';

/** Histórico único por corrida para não poluir pesquisas de outros testes. */
function marcaHistorico(rotulo: string): string {
  return `${rotulo} — E2E #87 ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Abre o combobox de conta de uma partida, escreve o `codigo` no campo de
 * pesquisa, aguarda que a opção correspondente apareça (auto-retry) e
 * selecciona-a. Por fim afirma que o trigger mostra o rótulo escolhido.
 *
 * Funciona tanto com Combobox local (filtro imediato) como com ComboboxRemoto
 * (debounce 250 ms + chamada ao servidor): o `expect` com `toBeVisible` e o
 * `.click()` têm auto-retry durante todo o `timeout` configurado.
 */
async function escolherConta(
  page: Page,
  caixa: ReturnType<typeof page.locator>,
  codigo: string,
  nomeRegex: RegExp,
): Promise<void> {
  await caixa.click();
  // Escopo ao wrapper do Radix Popover: evita modo estrito quando o popover
  // anterior ainda está na animação de fecho (~150 ms) e dois inputs
  // 'Pesquisar…' coexistem no DOM. `.last()` apanha o mais recente (o novo).
  const input = page
    .locator('[data-radix-popper-content-wrapper]')
    .getByPlaceholder('Pesquisar…')
    .last();
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(codigo);
  // Com ComboboxRemoto: debounce de 250 ms + resposta do servidor.
  // Com Combobox local: filtro imediato, mas a opção não existe na lista truncada.
  const opcao = page.getByRole('option', { name: nomeRegex });
  await expect(opcao.first()).toBeVisible({ timeout: 15_000 });
  await opcao.first().click();
  // O popover fecha e o trigger mostra o rótulo escolhido.
  await expect(caixa).toHaveText(nomeRegex, { timeout: 5_000 });
}

/**
 * Escolhe um diário no combobox correspondente.
 * Partilha a lógica do `escolherConta` mas com selector próprio.
 */
async function escolherDiario(page: Page, pesquisa: string, opcaoRegex: RegExp): Promise<void> {
  const caixa = page.getByRole('combobox', { name: /Diário/ });
  await caixa.click();
  const input = page
    .locator('[data-radix-popper-content-wrapper]')
    .getByPlaceholder('Pesquisar…')
    .last();
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(pesquisa);
  await page.getByRole('option', { name: opcaoRegex }).first().click();
  await expect(caixa).toHaveText(opcaoRegex, { timeout: 5_000 });
}

// ---------------------------------------------------------------------------

test.describe('issue #87 — contas de classe 6, 7 e 8 seleccionáveis no formulário de lançamento', () => {
  /**
   * Teste 1 — combobox de conta: escrever o código encontra a opção.
   *
   * Não cria nenhum lançamento; valida apenas que as opções aparecem e são
   * seleccionáveis no formulário de criação.
   */
  test('conta de classe 7 (711) e de classe 6 (611) encontradas por código e seleccionáveis', async ({
    page,
  }) => {
    await page.goto(`${LISTA}/novo`);
    await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    const contas = page.getByRole('combobox', { name: 'Conta' });

    // Partida de Débito: classe 6 — 611 Custo dos inventários vendidos ou consumidos.
    // Com o bug presente a opção nunca aparece (lista truncada a 200; classe 6 começa
    // no índice 222) — o test.expect expira e o teste fica VERMELHO.
    await escolherConta(page, contas.nth(0), '611', /611 — Custo dos inventários/);

    // Partida de Crédito: classe 7 — 711 Mercadorias (índice 357 na lista completa).
    await escolherConta(page, contas.nth(1), '711', /711 — Mercadorias/);
  });

  /**
   * Teste 2 — fluxo completo: cria um lançamento equilibrado D:611 / C:711
   * e verifica que aparece na listagem sem erros.
   *
   * Deixa um RASCUNHO no tenant demo (valor: 1,00 MT — escolha mínima para
   * não afectar sentinelas). Não confirma o lançamento.
   */
  test('lançamento equilibrado D:611 / C:711 é guardado sem erro e visível na listagem', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const historico = marcaHistorico('Teste D611 C711');

    await page.goto(`${LISTA}/novo`);
    await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    await escolherDiario(page, 'Outros', /Outros/);
    await page.getByPlaceholder('Descrição do lançamento').fill(historico);

    const contas = page.getByRole('combobox', { name: 'Conta' });

    // D: 611 (classe 6)
    await escolherConta(page, contas.nth(0), '611', /611 — Custo dos inventários/);

    // C: 711 (classe 7)
    await escolherConta(page, contas.nth(1), '711', /711 — Mercadorias/);

    // Valores equilibrados (débito = crédito = 1,00 MT)
    const valores = page.getByPlaceholder('0.00');
    await valores.nth(0).fill('1');
    await valores.nth(1).fill('1');

    // Guardar → redireccionado para a listagem
    await page.getByRole('button', { name: 'Guardar Lançamento' }).click();
    await page.waitForURL(/\/contabilidade\/lancamentos$/, { timeout: 60_000 });

    // O lançamento aparece na listagem (sem erro de rota, sem kartão 500)
    await page.goto(`${LISTA}?q=${encodeURIComponent(historico)}`);
    const linha = page.locator('tbody tr', { hasText: historico });
    await expect(linha).toHaveCount(1, { timeout: 30_000 });
    // Não contém texto cru de estado
    await expect(linha).not.toContainText('RASCUNHO');
  });

  /**
   * Teste 4 — lista inicial não vazia: abrir o combobox de conta SEM escrever
   * nada deve mostrar a primeira página de opções.
   *
   * Regra: o ComboboxRemoto de conta tem de carregar uma primeira página de
   * opções ao montar, de modo a que o utilizador veja alternativas mesmo sem
   * escrever nada — o mesmo comportamento de um `<select>` nativo.
   *
   * A conta esperada na primeira página é «111 — Caixa» (primeiro código do
   * PGC por ordem crescente, classe 1, sempre na posição 1 de qualquer lista).
   */
  test('combobox de conta mostra opções iniciais sem escrever nada', async ({ page }) => {
    await page.goto(`${LISTA}/novo`);
    await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    // Abrir o combobox da primeira partida SEM escrever nada.
    const contas = page.getByRole('combobox', { name: 'Conta' });
    await contas.nth(0).click();

    // O popover deve abrir com opções visíveis — sem digitação, a primeira página.
    const popover = page.locator('[data-radix-popper-content-wrapper]').last();

    // «111 — Caixa» é o primeiro código do PGC; deve estar em qualquer
    // primeira página com dimensão razoável.
    await expect(popover.getByRole('option', { name: /111 — Caixa/ })).toBeVisible({
      timeout: 10_000,
    });

    // O estado vazio específico deste campo não deve estar visível.
    await expect(popover.getByText('Nenhuma conta encontrada')).not.toBeVisible();
  });

  /**
   * Teste 3 — página de edição: conta de classe 7 pré-preenchida; conta de
   * classe 8 (851) seleccionável.
   *
   * Cria primeiro um RASCUNHO com D:611 / C:711 (a criação falhará se o bug
   * estiver presente — é a falha esperada). Com o fix aplicado, navega até à
   * página de edição e verifica:
   *   a) o trigger da segunda partida mostra "711 — Mercadorias";
   *   b) é possível substituí-la por "851 — Imposto corrente" (classe 8).
   */
  test('editar RASCUNHO: conta de classe 7 pré-preenchida; conta de classe 8 seleccionável', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const historico = marcaHistorico('Teste edição classe 7 e 8');

    // ── Criação do rascunho ──────────────────────────────────────────────────
    await page.goto(`${LISTA}/novo`);
    await expect(page.getByRole('heading', { name: 'Novo Lançamento Contabilístico' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    await escolherDiario(page, 'Outros', /Outros/);
    await page.getByPlaceholder('Descrição do lançamento').fill(historico);

    const contas = page.getByRole('combobox', { name: 'Conta' });
    await escolherConta(page, contas.nth(0), '611', /611 — Custo dos inventários/);
    await escolherConta(page, contas.nth(1), '711', /711 — Mercadorias/);

    const valores = page.getByPlaceholder('0.00');
    await valores.nth(0).fill('1');
    await valores.nth(1).fill('1');

    await page.getByRole('button', { name: 'Guardar Lançamento' }).click();
    await page.waitForURL(/\/contabilidade\/lancamentos$/, { timeout: 60_000 });

    // ── Navegar ao rascunho pela lista ───────────────────────────────────────
    await page.goto(`${LISTA}?status=RASCUNHO&q=${encodeURIComponent(historico)}`);
    const linha = page.locator('tbody tr', { hasText: historico });
    await expect(linha).toHaveCount(1, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await linha.click();
    await page.waitForURL(/\/contabilidade\/lancamentos\/[a-z0-9-]+$/, { timeout: 60_000 });

    const detalhe = new URL(page.url()).pathname;

    // ── Página de edição ─────────────────────────────────────────────────────
    await page.goto(`${detalhe}/editar`);
    // A página de edição tem título «Editar lançamento <numero>», não «Novo…».
    await expect(page.getByRole('heading', { name: /Editar lançamento/ })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    const contasEdicao = page.getByRole('combobox', { name: 'Conta' });

    // a) A segunda partida (Crédito) deve mostrar "711 — Mercadorias" pré-preenchida.
    await expect(contasEdicao.nth(1)).toHaveText(/711 — Mercadorias/, { timeout: 20_000 });

    // b) É possível substituir a conta da segunda partida por 851 (classe 8).
    //    Com o bug presente e sem o workaround do edit-page, 851 nunca aparece.
    await escolherConta(page, contasEdicao.nth(1), '851', /851 — Imposto corrente/);
  });
});
