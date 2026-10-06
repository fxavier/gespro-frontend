/**
 * E2E — issue #139 (ADR-0039 §1): o ecrã da conta de crédito por natureza de nota de débito.
 *
 * /contabilidade/configuracoes liga a /contabilidade/configuracoes/naturezas-nota-debito
 * («Contas por natureza de nota de débito»): uma linha por natureza (`data-natureza`), cada
 * uma com a combobox «Conta a crédito para <rótulo>» (pesquisa no servidor, só folhas activas
 * da classe admitida — 6 para Despesas repercutidas, 7 para as outras) e o seu «Guardar».
 *
 * ALTERA o tenant `demo` (partilhado): o teste muda Juros de mora de 781 para 7819 e REPÕE
 * 781 no afterEach — mesmo que a afirmação a meio falhe. O teste da classe só pesquisa, não grava.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

const PAGINA = '/contabilidade/configuracoes/naturezas-nota-debito';
const TITULO = 'Contas por natureza de nota de débito';
const PESQUISA = 'Pesquisar por código ou nome…';

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opção da combobox cujo texto COMEÇA por «<codigo> — » (pesquisar 781 também traz 7811…). */
const opcaoDaConta = (popover: Locator, codigo: string) =>
  popover.getByRole('option').filter({ hasText: new RegExp(`^\\s*${escaparRegex(codigo)} — `) });

async function abrirPagina(page: Page) {
  await page.goto(PAGINA);
  await expect(page.getByRole('heading', { name: TITULO, level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

function linha(page: Page, natureza: string) {
  return page.locator(`[data-natureza="${natureza}"]`);
}

function comboboxDe(page: Page, natureza: string, rotulo: string) {
  return linha(page, natureza).getByRole('combobox', { name: `Conta a crédito para ${rotulo}` });
}

/** Abre a combobox, pesquisa no servidor e devolve o popover aberto (âmbito: o último). */
async function pesquisar(combobox: Locator, page: Page, termo: string): Promise<Locator> {
  await combobox.click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  const campo = popover.getByPlaceholder(PESQUISA);
  await expect(campo).toBeVisible();
  await campo.fill(termo);
  return popover;
}

/** Escolhe a conta `codigo` para Juros de mora, guarda e espera que o servidor a tenha. */
async function definirJurosMora(page: Page, codigo: string) {
  const combobox = comboboxDe(page, 'JUROS_MORA', 'Juros de mora');
  const popover = await pesquisar(combobox, page, codigo);
  const opcao = opcaoDaConta(popover, codigo);
  await expect(opcao, `a conta ${codigo} não aparece na pesquisa`).toHaveCount(1, { timeout: 15_000 });
  await opcao.click();
  await expect(combobox).toHaveText(new RegExp(`^\\s*${escaparRegex(codigo)} — `));
  // Espera pela resposta da Server Action — o reload a seguir não pode ganhar-lhe a corrida.
  const gravado = page.waitForResponse(
    (r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']),
    { timeout: 30_000 },
  );
  await linha(page, 'JUROS_MORA').getByRole('button', { name: 'Guardar' }).click();
  expect((await gravado).ok(), 'a Server Action de guardar falhou').toBe(true);
  await page.waitForLoadState('networkidle');
}

test.describe('/contabilidade/configuracoes/naturezas-nota-debito (#139)', () => {
  let alterado = false;

  test.afterEach(async ({ page }) => {
    if (!alterado) return;
    // Repor a omissão do tenant demo (781 — Juros obtidos), pela própria UI.
    await abrirPagina(page);
    const combobox = comboboxDe(page, 'JUROS_MORA', 'Juros de mora');
    if (!/^\s*781 — /.test((await combobox.textContent()) ?? '')) await definirJurosMora(page, '781');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(comboboxDe(page, 'JUROS_MORA', 'Juros de mora')).toHaveText(/^\s*781 — Juros obtidos/, { timeout: 20_000 });
    alterado = false;
  });

  test('chega-se pelas configurações; Juros de mora mostra 781, muda para 7819, guarda e persiste', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/contabilidade/configuracoes');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Configurar contas por natureza de nota de débito' }).click();
    await page.waitForURL(new RegExp(`${escaparRegex(PAGINA)}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: TITULO, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // Uma linha por natureza, com o rótulo PT.
    for (const [natureza, rotulo] of [
      ['ACERTO_PRECO', 'Acerto de preço'],
      ['JUROS_MORA', 'Juros de mora'],
      ['DESPESAS_REPERCUTIDAS', 'Despesas repercutidas'],
      ['PENALIZACAO', 'Penalização'],
      ['OUTRO', 'Outro'],
    ]) {
      await expect(linha(page, natureza), natureza).toHaveCount(1);
      await expect(comboboxDe(page, natureza, rotulo), natureza).toBeVisible();
      await expect(linha(page, natureza).getByRole('button', { name: 'Guardar' }), natureza).toHaveCount(1);
    }

    await expect(comboboxDe(page, 'JUROS_MORA', 'Juros de mora')).toHaveText(/^\s*781 — Juros obtidos/);
    await expect(comboboxDe(page, 'ACERTO_PRECO', 'Acerto de preço')).toHaveText(/^\s*711 — /);
    await expect(comboboxDe(page, 'OUTRO', 'Outro')).toHaveText(/Sem conta — escolhida em cada nota de débito/);

    alterado = true;
    await definirJurosMora(page, '7819');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(comboboxDe(page, 'JUROS_MORA', 'Juros de mora')).toHaveText(/^\s*7819 — Outros juros/, { timeout: 20_000 });
    // As outras naturezas não mudaram.
    await expect(comboboxDe(page, 'ACERTO_PRECO', 'Acerto de preço')).toHaveText(/^\s*711 — /);
  });

  test('Despesas repercutidas só oferece contas da classe 6: pesquisar 781 não dá opção, 632 dá', async ({ page }) => {
    test.setTimeout(90_000);
    await abrirPagina(page);

    const combobox = comboboxDe(page, 'DESPESAS_REPERCUTIDAS', 'Despesas repercutidas');
    await expect(combobox).toHaveText(/Sem conta — escolhida em cada nota de débito/);

    // Uma conta da classe 6 aparece — prova que a pesquisa vai ao servidor e responde.
    let popover = await pesquisar(combobox, page, '632');
    await expect(opcaoDaConta(popover, '632')).toHaveCount(1, { timeout: 15_000 });

    // A 781 (classe 7) não aparece, nem nenhuma das suas filhas.
    await popover.getByPlaceholder(PESQUISA).fill('781');
    // A 632 sair da lista prova que a resposta à pesquisa «781» chegou.
    await expect(opcaoDaConta(popover, '632')).toHaveCount(0, { timeout: 15_000 });
    await expect(popover.getByRole('option').filter({ hasText: /^\s*781/ })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(combobox).toHaveText(/Sem conta — escolhida em cada nota de débito/);

    // E Juros de mora (classe 7) oferece a 7819 mas não a 632.
    popover = await pesquisar(comboboxDe(page, 'JUROS_MORA', 'Juros de mora'), page, '7819');
    await expect(opcaoDaConta(popover, '7819')).toHaveCount(1, { timeout: 15_000 });
    await popover.getByPlaceholder(PESQUISA).fill('632');
    // A 7819 sair da lista prova que a resposta à pesquisa «632» chegou.
    await expect(opcaoDaConta(popover, '7819')).toHaveCount(0, { timeout: 15_000 });
    await expect(opcaoDaConta(popover, '632')).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});
