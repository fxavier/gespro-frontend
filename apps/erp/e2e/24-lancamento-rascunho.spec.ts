/**
 * E2E — issue #137: editar e anular um lançamento em RASCUNHO.
 *
 * Spec: `docs/agentic/issue-137/spec.md` (D1–D6). Rótulos do contrato: «Editar»,
 * «Anular», campo «Motivo», botão «Anular lançamento», estado «Anulado», opção
 * de filtro «Anulado».
 *
 * Cria lançamentos pela UI em cada corrida (histórico com marca única) — corre
 * contra a base ISOLADA (`gespro_e2e77`), NUNCA contra `gespro`: um rascunho
 * anulado fica na base para sempre (D1: a linha fica, com número) e muda as
 * sentinelas da golden DFC se cair no `demo` da base de desenvolvimento.
 *
 *   DATABASE_URL=…/gespro_e2e77 DIRECT_URL=…/gespro_e2e77 npx next dev -p 3012
 *   BASE_URL=http://localhost:3012 npx playwright test e2e/24-lancamento-rascunho.spec.ts
 *
 * Contas: duas de existências (2633/2632, classe 2, fora da tesouraria), como
 * o `12-lancamentos` — o par não mexe em saldo nenhum que a DFC leia.
 *
 * `operador@demo.mz` NÃO tem `financas:lancamentos:escrita` (prisma/seed/rbac.ts:
 * o OPERADOR só leva o que `isReadOnly` aceita em `financas:*`), mas tem
 * `financas:leitura` — vê o detalhe, não vê as acções.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';
import { criarRascunho, LISTA_LANCAMENTOS as LISTA } from './helpers/lancamentos-ui';

// ─── utilitários ──────────────────────────────────────────────────────────────

function paraNumero(texto: string | null): number {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(limpo);
}

/** «Editar»/«Anular» como ligação ou botão, dentro do conteúdo da página. */
function accao(page: Page, nome: 'Editar' | 'Anular'): Locator {
  const main = page.locator('#main-content');
  return main
    .getByRole('link', { name: nome, exact: true })
    .or(main.getByRole('button', { name: nome, exact: true }));
}

/** Confirma o rascunho aberto (fica LANCADO). */
async function confirmarAberto(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('link', { name: /Estornar/ })).toBeVisible({ timeout: 30_000 });
}

/** Abre o menu de acções da linha da lista que tem `historico`. */
async function abrirMenuDaLinha(page: Page, url: string, historico: string) {
  await page.goto(url);
  const linha = page.locator('tbody tr', { hasText: historico });
  await expect(linha).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await linha.getByRole('button', { name: /Acções para/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Ver detalhe' })).toBeVisible({ timeout: 10_000 });
}

/** Os dois totais (débito, crédito) da linha «Totais» do detalhe. */
async function totais(page: Page): Promise<[number, number]> {
  const celulas = await page.getByRole('row', { name: /Totais/ }).locator('td').allInnerTexts();
  return [paraNumero(celulas[1]), paraNumero(celulas[2])];
}

// ─── testes ───────────────────────────────────────────────────────────────────

test.describe('/contabilidade/lancamentos — rascunho editável e anulável (#137)', () => {
  test('editar um rascunho: histórico e partidas novos, o MESMO número', async ({ page }) => {
    test.setTimeout(180_000);
    const r = await criarRascunho(page, 'Rascunho a editar', '2500');

    await expect(accao(page, 'Editar')).toBeVisible({ timeout: 20_000 });
    await accao(page, 'Editar').click();
    await page.waitForURL(new RegExp(`${r.detalhe}/editar$`), { timeout: 60_000 });
    await page.waitForLoadState('networkidle');

    // Pré-preenchido com o que está gravado.
    const historico = page.getByPlaceholder('Descrição do lançamento');
    await expect(historico).toHaveValue(r.historico, { timeout: 20_000 });

    const novoHistorico = `${r.historico} (corrigido)`;
    await historico.fill(novoHistorico);
    await page.getByPlaceholder('0.00').nth(0).fill('3100');
    await page.getByPlaceholder('0.00').nth(1).fill('3100');

    await page.getByRole('button', { name: /Guardar/ }).click();
    await page.waitForURL((u) => !u.pathname.endsWith('/editar'), { timeout: 60_000 });

    await page.goto(r.detalhe);
    await expect(page.getByRole('heading', { name: `Lançamento ${r.numero}` })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#main-content')).toContainText(novoHistorico);
    const [debito, credito] = await totais(page);
    expect(debito).toBe(3100);
    expect(credito).toBe(3100);
    // Continua rascunho: editar não confirma.
    await expect(page.locator('#main-content').getByText('Rascunho', { exact: true }).first()).toBeVisible();
  });

  test('anular um rascunho: motivo obrigatório, estado «Anulado», fora da lista por omissão', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const r = await criarRascunho(page, 'Rascunho a anular', '1200');

    // Antes de anular, a lista por omissão mostra-o — é o que dá sentido ao «já não mostra».
    await page.goto(LISTA);
    await expect(page.locator('tbody tr', { hasText: r.historico })).toHaveCount(1, { timeout: 30_000 });

    // A lista oferece as duas acções num rascunho (admin tem a permissão).
    await abrirMenuDaLinha(page, LISTA, r.historico);
    await expect(page.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Anular' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto(r.detalhe);
    await expect(accao(page, 'Anular')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await accao(page, 'Anular').click();
    await page.waitForURL(new RegExp(`${r.detalhe}/anular$`), { timeout: 60_000 });
    await page.waitForLoadState('networkidle');

    // Sem motivo: erro visível, e fica na página.
    const motivo = page.getByLabel('Motivo');
    await expect(motivo).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Anular lançamento' }).click();
    const erro = page
      .locator('#main-content [id$="-form-item-message"]')
      .or(page.locator('#main-content').getByRole('alert'));
    await expect(erro.first()).toBeVisible({ timeout: 10_000 });
    await expect(erro.first()).not.toHaveText('');
    expect(new URL(page.url()).pathname).toBe(`${r.detalhe}/anular`);

    // Com motivo: volta ao detalhe, «Anulado», motivo à vista, mesmo número.
    const textoMotivo = `Lançado em duplicado ${Date.now()}`;
    await motivo.fill(textoMotivo);
    await page.getByRole('button', { name: 'Anular lançamento' }).click();
    await page.waitForURL(new RegExp(`${r.detalhe}$`), { timeout: 60_000 });

    const main = page.locator('#main-content');
    await expect(main.getByText('Anulado', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(main).toContainText(textoMotivo);
    await expect(page.getByRole('heading', { name: `Lançamento ${r.numero}` })).toBeVisible();
    await expect(main).not.toContainText('ANULADO');
    // Um anulado já não se edita nem se anula.
    await expect(accao(page, 'Editar')).toHaveCount(0);
    await expect(accao(page, 'Anular')).toHaveCount(0);

    // A lista por omissão esconde-o…
    await page.goto(LISTA);
    await expect(page.getByRole('heading', { name: /Lançamentos Contabilísticos/ })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('tbody tr', { hasText: r.historico })).toHaveCount(0);

    // …e o filtro «Anulado» mostra-o.
    await page.goto(`${LISTA}?status=ANULADO`);
    const linha = page.locator('tbody tr', { hasText: r.historico });
    await expect(linha).toHaveCount(1, { timeout: 30_000 });
    await expect(linha).toContainText(r.numero);
    await expect(linha).toContainText('Anulado');

    // O filtro de estado (select nativo «Estado» do FilterBar) oferece «Anulado»,
    // e escolhê-lo leva à mesma lista filtrada.
    await page.goto(LISTA);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Estado', { exact: true }).selectOption({ label: 'Anulado' });
    await page.waitForURL(/[?&]status=ANULADO/, { timeout: 30_000 });
    await expect(page.locator('tbody tr', { hasText: r.historico })).toHaveCount(1, { timeout: 30_000 });
  });

  test('um LANCADO não tem «Editar» nem «Anular»; /editar explica em vez de mostrar o formulário', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const r = await criarRascunho(page, 'Rascunho a confirmar', '800');
    await confirmarAberto(page);

    // Detalhe
    await page.goto(r.detalhe);
    await expect(page.getByRole('link', { name: /Estornar/ })).toBeVisible({ timeout: 30_000 });
    await expect(accao(page, 'Editar')).toHaveCount(0);
    await expect(accao(page, 'Anular')).toHaveCount(0);

    // Menu da lista
    await abrirMenuDaLinha(page, `${LISTA}?status=LANCADO`, r.historico);
    await expect(page.getByRole('menuitem', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Anular' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // URL directa de edição
    await page.goto(`${r.detalhe}/editar`);
    await expect(page.locator('#main-content')).toContainText(/rascunho/i, { timeout: 30_000 });
    await expect(page.getByPlaceholder('Descrição do lançamento')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Guardar/ })).toHaveCount(0);

    // URL directa de anulação
    await page.goto(`${r.detalhe}/anular`);
    await expect(page.locator('#main-content')).toContainText(/rascunho/i, { timeout: 30_000 });
    await expect(page.getByLabel('Motivo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Anular lançamento' })).toHaveCount(0);
  });

  test('o estornar de um rascunho liga a «Editar» e «Anular»', async ({ page }) => {
    test.setTimeout(120_000);
    const r = await criarRascunho(page, 'Rascunho no estornar', '400');

    await page.goto(`${r.detalhe}/estornar`);
    const main = page.locator('#main-content');
    await expect(main).toContainText(/rascunho/i, { timeout: 30_000 });
    await expect(main.getByRole('link', { name: 'Editar', exact: true })).toHaveAttribute(
      'href',
      `${r.detalhe}/editar`,
    );
    await expect(main.getByRole('link', { name: 'Anular', exact: true })).toHaveAttribute(
      'href',
      `${r.detalhe}/anular`,
    );
    // O texto antigo, que mandava corrigir «à vontade» sem dizer onde, saiu.
    await expect(main).not.toContainText('corrija-o à vontade');
  });

  test('sem financas:lancamentos:escrita (operador) não vê «Editar» nem «Anular» num rascunho', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const r = await criarRascunho(page, 'Rascunho visto pelo operador', '600');

    // Controlo: o admin vê as duas acções neste mesmo rascunho.
    await expect(accao(page, 'Editar')).toBeVisible({ timeout: 20_000 });
    await expect(accao(page, 'Anular')).toBeVisible();

    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const op = await contexto.newPage();
    try {
      await loginAs(op, USERS.operador);

      await op.goto(r.detalhe);
      await expect(op.getByRole('heading', { name: `Lançamento ${r.numero}` })).toBeVisible({
        timeout: 30_000,
      });
      await op.waitForLoadState('networkidle');
      await expect(accao(op, 'Editar')).toHaveCount(0);
      await expect(accao(op, 'Anular')).toHaveCount(0);

      await abrirMenuDaLinha(op, `${LISTA}?status=RASCUNHO`, r.historico);
      await expect(op.getByRole('menuitem', { name: 'Editar' })).toHaveCount(0);
      await expect(op.getByRole('menuitem', { name: 'Anular' })).toHaveCount(0);
    } finally {
      await contexto.close();
    }
  });
});
