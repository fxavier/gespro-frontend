/**
 * E2E oracle — issue #159: «Recalcular» e «Adicionar ajuste» no detalhe de
 * payroll PENDENTE.
 *
 * ACs cobertos:
 *   AC1 — Detalhe PENDENTE mostra botão «Recalcular»; clicar abre um AlertDialog de
 *          confirmação e confirmar mostra toast «Payroll recalculado».
 *   AC2 — Detalhe PENDENTE mostra link «Adicionar ajuste» (href …/ajuste).
 *          A rota /rh/payroll/<id>/ajuste é uma página completa (sem modal) com
 *          campos Tipo, Natureza, Descrição, Valor e botão «Guardar ajuste».
 *          Sucesso: navega de volta ao detalhe; nova linha aparece com
 *          «<descrição> (ajuste)» em Proventos; Total bruto aumenta pelo valor.
 *   AC4 — DESCONTO com valor impossível (LIQUIDO_NEGATIVO): erro visível na
 *          página de ajuste; URL mantém-se em /ajuste; nenhuma linha com essa
 *          descrição no detalhe.
 *
 * AC3 (payroll não-PENDENTE esconde acções + /ajuste redirige) NÃO é
 * exercitável: o tenant demo não tem nenhum payroll não-PENDENTE sem criar
 * dados de teste. Registado como follow-up.
 *
 * Higiene de dados — este oráculo escreve uma LinhaPayroll PROVENTO no tenant
 * demo. Para limpar após corridas de CI/dev:
 *
 *   docker exec gespro-db psql \
 *     -U "$(docker exec gespro-db printenv POSTGRES_USER)" \
 *     -d "$(docker exec gespro-db printenv POSTGRES_DB)" \
 *     -c "DELETE FROM \"LinhaPayroll\" WHERE descricao LIKE 'E2E #159%';"
 *
 *   Depois recalcular o payroll afectado via «Recalcular» na UI.
 *
 * Determinismo: sem sleeps arbitrários; usa expect com auto-retry e waitForURL.
 *
 * Correr contra o worktree 3107:
 *   BASE_URL=http://localhost:3107 \
 *   npx playwright test e2e/25-payroll-ajustes.spec.ts --project=e2e
 */

import path from 'node:path';
import { test, expect } from '@playwright/test';

// ─── constantes ───────────────────────────────────────────────────────────────

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/admin.json');
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LISTA_PENDENTE = `${BASE}/rh/payroll?status=PENDENTE`;

// ─── utilitários ──────────────────────────────────────────────────────────────

/**
 * «MT 12.345,67» ou «MT 12 345,67» (separador de milhar pode ser ponto,
 * espaço normal ou espaço não-quebrável — toLocaleString('pt-PT') usa espaço)
 * → 12345.67
 *
 * Mesmo algoritmo que paraNumero em e2e/24: mantém só dígitos, vírgula e
 * menos; remove pontos residuais (separadores de milhar com ponto); converte
 * vírgula decimal em ponto.
 */
function parseValorMT(texto: string): number {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(limpo);
}

/**
 * Preenche um campo de selecção que pode ser um native <select> ou um trigger
 * Radix (<button role="combobox">). Tolera ambos sem seleccionar pelo aria-label
 * porque os Selects do Radix são wraps de <button>, não de <select>.
 *
 * Pesquisa o label via getByLabel; se for nativo usa selectOption, senão clica
 * no trigger e escolhe a opção pelo texto visível.
 */
async function escolherOpcao(
  page: import('@playwright/test').Page,
  label: string,
  visibleText: string,
): Promise<void> {
  const campo = page.getByLabel(label, { exact: true });
  await expect(campo).toBeVisible({ timeout: 10_000 });
  const tag = await campo.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    await campo.selectOption({ label: visibleText });
  } else {
    // Radix Select: o trigger abre uma listbox
    await campo.click();
    await page
      .getByRole('option', { name: visibleText })
      .or(page.getByRole('listitem').filter({ hasText: visibleText }))
      .first()
      .click();
  }
}

// ─── fixture: payroll PENDENTE ────────────────────────────────────────────────

/** Caminho absoluto do detalhe do primeiro payroll PENDENTE, ex. /rh/payroll/cl… */
let pendentePath: string;

test.describe('/rh/payroll — recalcular e ajustes manuais (#159)', () => {
  /**
   * Resolve o primeiro payroll PENDENTE antes dos testes. Usa um contexto
   * temporário com o storageState do admin (o mesmo que os tests individuais).
   * Se não existir nenhum payroll PENDENTE, lança — stop condition activada.
   */
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: AUTH_FILE,
      baseURL: BASE,
    });
    const page = await ctx.newPage();

    try {
      await page.goto(LISTA_PENDENTE);

      // Aguarda a tabela ou o estado vazio
      const tabelaOuVazio = page
        .locator('tbody tr')
        .first()
        .or(page.getByText(/sem processamentos/i));
      await expect(tabelaOuVazio).toBeVisible({ timeout: 30_000 });

      const primeiraTr = page.locator('tbody tr').first();
      if ((await primeiraTr.count()) === 0) {
        throw new Error(
          'STOP CONDITION: nenhum payroll PENDENTE no tenant demo — ' +
          'corra pnpm db:seed e tente de novo.',
        );
      }

      // Clica na linha (DataTable usa router.push via onClick, sem <a> no tr)
      await primeiraTr.click();
      await page.waitForURL(/\/rh\/payroll\/[a-z0-9]{25}$/, { timeout: 30_000 });
      pendentePath = new URL(page.url()).pathname;
    } finally {
      await ctx.close();
    }
  });

  // ── AC1 — botão «Recalcular» presente e toast após clique ────────────────────

  test('AC1 — detalhe PENDENTE mostra «Recalcular» e toast «Payroll recalculado»', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(pendentePath);

    // ORACLE: gate vermelho — este botão não existe na UI actual.
    const btnRecalcular = page.getByRole('button', { name: 'Recalcular', exact: true });
    await expect(btnRecalcular).toBeVisible({ timeout: 20_000 });

    await btnRecalcular.click();

    // #159 (contrato do nó payroll-recalcular-ajustes-159): «Recalcular» pede confirmação
    // num AlertDialog; só a confirmação recalcula.
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible({ timeout: 10_000 });
    await dialogo.getByRole('button', { name: /^(Recalcular|Confirmar)$/ }).click();
    await expect(dialogo).toBeHidden({ timeout: 10_000 });

    // Toast sonner com o texto exacto — selector de braço único para evitar
    // strict-mode violation (o <li data-sonner-toast> e o <div> interno
    // resolvem os dois com getByText).
    await expect(
      page.locator('[data-sonner-toast]', { hasText: 'Payroll recalculado' }),
    ).toBeVisible({ timeout: 20_000 });
  });

  // ── AC2a — link «Adicionar ajuste» existe e aponta para /ajuste ───────────────

  test('AC2a — detalhe PENDENTE mostra link «Adicionar ajuste»', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto(pendentePath);

    const linkAjuste = page.getByRole('link', { name: 'Adicionar ajuste', exact: true });
    // ORACLE: gate vermelho — o link não existe na UI actual.
    await expect(linkAjuste).toBeVisible({ timeout: 20_000 });
    await expect(linkAjuste).toHaveAttribute('href', `${pendentePath}/ajuste`);
  });

  // ── AC2b — formulário /ajuste completo; sucesso: nova linha + total aumentado ─

  test('AC2b — /ajuste tem campos, guardar volta ao detalhe com nova linha (ajuste)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const descricao = `E2E #159 ${Date.now()}`;

    // Lê o Total bruto inicial antes de ir ao formulário
    await page.goto(pendentePath);
    await page.waitForLoadState('networkidle');
    const totalBrutoEl = page
      .locator('text=Total bruto')
      .locator('..')
      .locator('span.tabular-nums');
    await expect(totalBrutoEl).toBeVisible({ timeout: 20_000 });
    const totalBrutoAntes = parseValorMT((await totalBrutoEl.textContent()) ?? '0');

    // Navega para a página de ajuste
    await page.goto(`${pendentePath}/ajuste`);

    // ORACLE: campo «Tipo» presente — o formulário não existe ainda → falha aqui.
    await expect(page.getByLabel('Tipo', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Natureza', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Descrição', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Valor', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'Guardar ajuste', exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    // Preenche o formulário — PROVENTO / BÓNUS / descrição única / 1,00 MZN
    await escolherOpcao(page, 'Tipo', 'Provento');
    await escolherOpcao(page, 'Natureza', 'Bónus');
    await page.getByLabel('Descrição', { exact: true }).fill(descricao);
    // Valor: preenche com "1" (sem decimais); o input validará min 0,01
    await page.getByLabel('Valor', { exact: true }).fill('1');

    await page.getByRole('button', { name: 'Guardar ajuste', exact: true }).click();

    // Redirige para o detalhe
    await page.waitForURL(new RegExp(`${pendentePath}$`), { timeout: 30_000 });

    // A nova linha aparece em Proventos com sufixo « (ajuste)»
    await expect(page.locator('#main-content')).toContainText(`${descricao} (ajuste)`, {
      timeout: 20_000,
    });

    // Total bruto deve ter aumentado exatamente 1,00 MZN
    const totalBrutoDepois = parseValorMT((await totalBrutoEl.textContent()) ?? '0');
    expect(totalBrutoDepois).toBeCloseTo(totalBrutoAntes + 1, 2);
  });

  // ── AC4 — DESCONTO impossível → LIQUIDO_NEGATIVO → erro no formulário ─────────

  test('AC4 — DESCONTO impossível: erro visível em /ajuste, URL mantém-se, detalhe sem linha', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const descInvalida = 'E2E #159 desconto impossivel';

    await page.goto(`${pendentePath}/ajuste`);

    // ORACLE: gate vermelho — o formulário não existe ainda → falha aqui.
    await expect(page.getByLabel('Tipo', { exact: true })).toBeVisible({ timeout: 20_000 });

    await escolherOpcao(page, 'Tipo', 'Desconto');
    await escolherOpcao(page, 'Natureza', 'Penhora');
    await page.getByLabel('Descrição', { exact: true }).fill(descInvalida);
    await page.getByLabel('Valor', { exact: true }).fill('99999999');

    await page.getByRole('button', { name: 'Guardar ajuste', exact: true }).click();

    // Erro de negócio visível (form-item-message ou role=alert)
    const erroLocator = page
      .locator('#main-content [id$="-form-item-message"]')
      .or(page.locator('#main-content').getByRole('alert'));
    await expect(erroLocator.first()).toBeVisible({ timeout: 15_000 });
    await expect(erroLocator.first()).not.toHaveText('');

    // URL permanece em /ajuste
    expect(new URL(page.url()).pathname).toBe(`${pendentePath}/ajuste`);

    // Volta ao detalhe: nenhuma linha com a descrição inválida
    await page.goto(pendentePath);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#main-content')).not.toContainText(descInvalida, {
      timeout: 20_000,
    });
  });
});
