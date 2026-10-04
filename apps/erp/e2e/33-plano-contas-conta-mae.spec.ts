/**
 * E2E — issue #344: selector de conta mãe no plano de contas só oferecia as
 * primeiras 200 contas (lista local truncada).
 *
 * Causa: `novo/page.tsx` (linha 21) e `[id]/editar/page.tsx` (linha 35)
 * carregam `listarContas({ take: 200 })` para um Combobox local.
 * Com 505 contas no tenant demo (seed PGC-NIRF), as classes 6–8 ficam
 * inteiramente inalcançáveis como conta mãe:
 *   - 71 — Vendas:       índice 411 na lista ordenada por código
 *   - 711 — Mercadorias: índice 412 (filho directo de 71)
 *
 * Contas escolhidas (seed PGC):
 *   71   Vendas       (candidata a mãe; índice 411 > corte 200)
 *   711  Mercadorias  (tem contaMaeId = id de 71; demonstra o bug no editar)
 *
 * ESPERADO (comportamento correcto após fix):
 *   - Teste 1: escrever «71» no combobox Conta Mãe encontra «71 — Vendas».
 *   - Teste 2: abrir o combobox sem pesquisar mostra «Nenhuma (conta raiz)»
 *              e pelo menos uma conta da primeira página.
 *   - Teste 3: editar 711 mostra «71 — Vendas» no trigger de Conta Mãe.
 *
 * VERMELHO na versão actual (sem fix):
 *   - Teste 1: `options.find(o => o.value === actual)` devolve undefined (71
 *              não está nas primeiras 200) → opção nunca aparece → expira.
 *   - Teste 3: trigger mostra «Nenhuma (conta raiz)» (placeholder) em vez de
 *              «71 — Vendas» porque o Combobox não encontra o valor nas opções.
 *
 * Teste 2 pode ser verde desde já — serve de regra de regressão.
 *
 * Nenhum teste cria ou altera dados no tenant demo:
 *   - Teste 1 e 2: formulário /novo — navega e interaje, não guarda.
 *   - Teste 3: conta 711 tem lançamentos (trancado=true); apenas lê o valor.
 */

import { test, expect, type Page } from '@playwright/test';

const LISTA = '/contabilidade/plano-contas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navega à listagem com pesquisa pelo `codigo` exacto, clica na linha e
 * aguarda a rota de detalhe `/contabilidade/plano-contas/<uuid>`.
 * Devolve o pathname do detalhe (sem trailing slash).
 */
async function caminhoDaConta(page: Page, codigo: string): Promise<string> {
  await page.goto(`${LISTA}?search=${codigo}`);
  const linha = page.locator('tbody tr').filter({
    has: page.getByRole('cell', { name: codigo, exact: true }),
  });
  await expect(linha).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await linha.click();
  await page.waitForURL(/\/contabilidade\/plano-contas\/[a-z0-9-]+$/, { timeout: 60_000 });
  return new URL(page.url()).pathname;
}

/**
 * Abre o combobox «Conta Mãe», escreve `codigo` no campo de pesquisa, aguarda
 * que a opção `nomeRegex` apareça (auto-retry) e selecciona-a.
 *
 * Agnóstico à implementação: funciona tanto com Combobox local (filtro imediato)
 * como com ComboboxRemoto (debounce 250 ms + chamada ao servidor).
 *
 * Com o bug presente (lista truncada): a opção nunca aparece para contas além
 * do índice 200 → expect expira → teste VERMELHO.
 */
async function escolherContaMae(
  page: Page,
  codigo: string,
  nomeRegex: RegExp,
): Promise<void> {
  const trigger = page.getByRole('combobox', { name: 'Conta Mãe' });
  await trigger.click();
  // Âmbito ao wrapper do Radix Popover mais recente (evita modo estrito quando
  // um popover anterior ainda está na animação de fecho — mesma técnica de
  // e2e/32-lancamento-contas-todas.spec.ts).
  const input = page
    .locator('[data-radix-popper-content-wrapper]')
    .last()
    .getByPlaceholder('Pesquisar…');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill(codigo);
  // Aguarda a opção (auto-retry inclui debounce do ComboboxRemoto).
  const opcao = page.getByRole('option', { name: nomeRegex });
  await expect(opcao.first()).toBeVisible({ timeout: 15_000 });
  await opcao.first().click();
  // Trigger deve reflectir a escolha.
  await expect(trigger).toHaveText(nomeRegex, { timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

test.describe('issue #344 — conta mãe seleccionável além das primeiras 200 contas', () => {
  /**
   * Teste 1 — RED: escrever «71» no campo Conta Mãe do formulário /novo
   * encontra «71 — Vendas» (índice 411) e permite seleccioná-la.
   *
   * Com o bug: Combobox local truncado a 200 → opção nunca aparece → VERMELHO.
   * Com o fix (ComboboxRemoto): pesquisa no servidor devolve a opção → VERDE.
   *
   * Não guarda nada (sem resíduos no tenant demo).
   */
  test('novo — escrever «71» no campo Conta Mãe encontra «71 — Vendas» e selecciona', async ({
    page,
  }) => {
    await page.goto(`${LISTA}/novo`);
    await expect(page.getByRole('heading', { name: 'Nova Conta PGC' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    // Tenta encontrar e seleccionar «71 — Vendas».
    // Com o bug: expira em 15 s → VERMELHO.
    await escolherContaMae(page, '71', /71 — Vendas/);
  });

  /**
   * Teste 2 — pode ser VERDE desde já: abrir o combobox Conta Mãe sem
   * escrever nada mostra «Nenhuma (conta raiz)» e pelo menos uma conta.
   *
   * Guarda a regra de que o combobox apresenta uma lista inicial não vazia,
   * evitando regressões onde o utilizador abre o campo e não vê nenhuma opção.
   */
  test('novo — combobox Conta Mãe mostra opções iniciais sem pesquisar', async ({ page }) => {
    await page.goto(`${LISTA}/novo`);
    await expect(page.getByRole('heading', { name: 'Nova Conta PGC' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('combobox', { name: 'Conta Mãe' });
    await trigger.click();

    const popover = page.locator('[data-radix-popper-content-wrapper]').last();

    // «Nenhuma (conta raiz)» é sempre a primeira opção (permite desassociar).
    await expect(
      popover.getByRole('option', { name: /Nenhuma \(conta raiz\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Pelo menos uma conta do PGC deve estar visível (primeira da lista, código «1»).
    await expect(
      popover.getByRole('option', { name: /1 — Classe 1/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Teste 3 — RED: editar a conta 711 (Mercadorias) mostra «71 — Vendas»
   * no trigger do combobox Conta Mãe.
   *
   * 711 tem contaMaeId = UUID de «71 — Vendas» (índice 411, > 200).
   * O Combobox local não o encontra nas primeiras 200 opções → mostra o
   * placeholder «Nenhuma (conta raiz)» → utilizador pensa que não há mãe.
   *
   * Com o bug: trigger = «Nenhuma (conta raiz)» → VERMELHO.
   * Com o fix: trigger = «71 — Vendas» → VERDE.
   *
   * 711 tem lançamentos (trancado=true); não é necessário guardar nada.
   * Navega pela listagem para obter o id — sem consulta directa à base.
   */
  test('editar 711 — o trigger de Conta Mãe mostra «71 — Vendas»', async ({ page }) => {
    // Resolve o id de 711 pela listagem, evitando hard-code de uuid.
    const detalhe = await caminhoDaConta(page, '711');

    await page.goto(`${detalhe}/editar`);
    await expect(
      page.getByRole('heading', { name: /Editar 711 — Mercadorias/ }),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('combobox', { name: 'Conta Mãe' });

    // Com o bug: mostra «Nenhuma (conta raiz)» porque contaMaeId (uuid de 71)
    // não está nas primeiras 200 opções → VERMELHO.
    // Com o fix: mostra «71 — Vendas» → VERDE.
    await expect(trigger).toHaveText(/71 — Vendas/, { timeout: 10_000 });
  });
});
