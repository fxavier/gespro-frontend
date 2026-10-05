/**
 * E2E — issue #138 / ADR-0035: UI do encerramento do exercício (nó N5-v, oráculo).
 *
 * Contrato da UI (sem modais — só AlertDialog para confirmar o destrutivo):
 * - `/contabilidade/exercicios`: exercício `ABERTO` → ligação «Encerrar exercício» para
 *   `/contabilidade/exercicios/<id>/encerrar`; `ENCERRADO_PROVISORIO` → ligação «Reabrir exercício»
 *   (`…/<id>/reabrir`) e botão «Encerrar definitivamente» (AlertDialog). Sem permissão, nenhuma.
 * - `…/<id>/encerrar`: campo «Estimativa do imposto» (aceita `0`, `100`, `100,50`), botão
 *   «Encerrar exercício»; valor inválido → erro no campo, nada submetido; `{ ok:false }` → TODOS os
 *   impedimentos em frases pt-PT (role `alert` ou região «Não é possível encerrar»), nunca o código.
 * - `…/<id>/reabrir`: campo «Motivo» (textarea), botão «Reabrir exercício». Para um exercício que NÃO
 *   está `ENCERRADO_PROVISORIO`, mostra «não está encerrado provisoriamente» e nem campo nem botão
 *   (espelha a página de reabrir período).
 *
 * NÃO DESTRUTIVO: corre contra o `demo` partilhado. O exercício 2026 tem meses abertos, logo o
 * encerramento devolve impedimentos e nada se escreve. Um encerramento com sucesso NÃO se testa
 * aqui — está nos testes de integração. Nunca submeter um motivo válido de reabertura.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

const LISTA = '/contabilidade/exercicios';
const CODIGO = '2026';
const ENCERRAR = /\/contabilidade\/exercicios\/[^/]+\/encerrar$/;

// ─── utilitários ──────────────────────────────────────────────────────────────

/**
 * O cartão do exercício `codigo`: o contentor mais interior de `#main-content` que tem o título
 * «Exercício <codigo>». Os ancestrais vêm antes dos descendentes na ordem do documento, por isso
 * `.last()` é o mais interior que ainda contém `alvo`.
 */
function cartaoExercicio(page: Page, codigo: string, alvo: Locator): Locator {
  return page
    .locator('#main-content div, #main-content section, #main-content article')
    .filter({ has: page.getByRole('heading', { name: `Exercício ${codigo}` }) })
    .filter({ has: alvo })
    .last();
}

async function abrirLista(page: Page) {
  await page.goto(LISTA);
  await expect(page.getByRole('heading', { name: `Exercício ${CODIGO}` })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

/**
 * A ligação «Encerrar exercício» SEM raiz — é a que serve de `has:` em `cartaoExercicio`. Um `has:`
 * avalia-se relativo a cada candidato: enraizada em `#main-content`, exigiria que o cartão contivesse
 * o `#main-content` e nunca casaria.
 */
function linkEncerrar(page: Page): Locator {
  return page.getByRole('link', { name: 'Encerrar exercício', exact: true });
}

/** A mesma ligação, em qualquer ponto do conteúdo da página — para afirmar ausência. */
function ligacaoEncerrar(page: Page): Locator {
  return page.locator('#main-content').getByRole('link', { name: 'Encerrar exercício', exact: true });
}

/** href da ligação «Encerrar exercício» do exercício 2026, a partir da lista. */
async function hrefEncerrar2026(page: Page): Promise<string> {
  await abrirLista(page);
  const link = cartaoExercicio(page, CODIGO, linkEncerrar(page)).getByRole('link', {
    name: 'Encerrar exercício',
    exact: true,
  });
  await expect(link).toBeVisible({ timeout: 20_000 });
  const href = await link.getAttribute('href');
  expect(href).toMatch(ENCERRAR);
  return href!;
}

/**
 * Salvaguarda do `demo` partilhado: os casos que submetem uma estimativa só são inofensivos enquanto
 * o exercício tiver pelo menos um mês ABERTO (é isso que devolve impedimentos). Conta, no cartão, as
 * linhas «Mês N» com o estado «Aberto» (o período 13 não conta). Chamar com a lista aberta e com o
 * cartão resolvido pela TABELA (o contentor mais interior com a ligação é só o cabeçalho).
 */
async function exigirMesAberto(page: Page, cartao: Locator): Promise<void> {
  const mesesAbertos = cartao
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: /^Mês \d+$/ }) })
    .filter({ has: page.getByText('Aberto', { exact: true }) });
  await expect(cartao.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const n = await mesesAbertos.count();
  expect(
    n,
    `PARAR: o exercício ${CODIGO} do demo não tem nenhum mês aberto — submeter a estimativa ` +
      'ENCERRARIA o exercício a sério na base partilhada. Reabra um mês ou use uma base isolada.',
  ).toBeGreaterThan(0);
}

/** Região dos impedimentos: `role=alert` ou região «Não é possível encerrar», dentro da página. */
function regiaoImpedimentos(page: Page): Locator {
  const main = page.locator('#main-content');
  return main
    .getByRole('alert')
    .or(main.getByRole('region', { name: 'Não é possível encerrar' }));
}

function erroDeCampo(page: Page): Locator {
  return page.locator('#main-content [id$="-form-item-message"]').first();
}

// ─── testes ───────────────────────────────────────────────────────────────────

test.describe('/contabilidade/exercicios — encerramento do exercício (ADR-0035, #138)', () => {
  test('admin: «Encerrar exercício» no exercício ABERTO leva à rota dedicada', async ({ page }) => {
    test.setTimeout(120_000);
    const href = await hrefEncerrar2026(page);

    await cartaoExercicio(page, CODIGO, linkEncerrar(page))
      .getByRole('link', { name: 'Encerrar exercício', exact: true })
      .click();
    await page.waitForURL(ENCERRAR, { timeout: 60_000 });
    expect(new URL(page.url()).pathname).toBe(href);

    // Rota inteira, não modal.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Estimativa do imposto')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Encerrar exercício' })).toBeVisible();
  });

  test('admin: meses abertos → todos os impedimentos em pt-PT, sem códigos; continua Aberto', async ({ page }) => {
    test.setTimeout(120_000);
    const href = await hrefEncerrar2026(page);
    await exigirMesAberto(page, cartaoExercicio(page, CODIGO, page.locator('table')));
    await page.goto(href);
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Estimativa do imposto').fill('0');
    await page.getByRole('button', { name: 'Encerrar exercício' }).click();

    const regiao = regiaoImpedimentos(page).filter({ hasText: /meses|períodos mensais/i });
    await expect(regiao.first()).toBeVisible({ timeout: 30_000 });
    await expect(regiao.first().getByRole('listitem').first()).toBeVisible();
    await expect(page.getByText('PERIODOS_MENSAIS_ABERTOS')).toHaveCount(0);
    await expect(page.locator('#main-content')).not.toContainText(/\b[A-Z]{3,}(?:_[A-Z]+)+\b/);

    // Nada mudou: o exercício continua Aberto na lista.
    await abrirLista(page);
    const cartao = cartaoExercicio(page, CODIGO, linkEncerrar(page));
    await expect(cartao.getByText('Aberto', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(cartao.getByText('Encerrado (Provisório)')).toHaveCount(0);
  });

  test('admin: estimativa inválida → erro no campo, nada submetido', async ({ page }) => {
    test.setTimeout(120_000);
    const href = await hrefEncerrar2026(page);
    await page.goto(href);
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Estimativa do imposto').fill('-5');
    await page.getByRole('button', { name: 'Encerrar exercício' }).click();

    await expect(erroDeCampo(page)).toBeVisible({ timeout: 10_000 });
    await expect(regiaoImpedimentos(page)).toHaveCount(0);
    await expect(page.getByText('Não é possível encerrar')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(href);
  });

  test('leitura: sem «Encerrar exercício» na lista', async ({ browser }) => {
    test.setTimeout(120_000);
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await contexto.newPage();
    try {
      await loginAs(page, USERS.leitura);
      await abrirLista(page);
      // Âncora: sem `#main-content` a ausência abaixo seria vácua.
      await expect(page.locator('#main-content')).toContainText(`Exercício ${CODIGO}`);
      await expect(ligacaoEncerrar(page)).toHaveCount(0);
      await expect(page.locator('#main-content').getByRole('link', { name: 'Reabrir exercício' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Encerrar definitivamente' })).toHaveCount(0);
    } finally {
      await contexto.close();
    }
  });

  test('admin: reabrir um exercício ABERTO → mensagem legível, sem formulário', async ({ page }) => {
    test.setTimeout(120_000);
    const href = await hrefEncerrar2026(page);
    const reabrir = href.replace(/\/encerrar$/, '/reabrir');
    await page.goto(reabrir);
    await page.waitForLoadState('networkidle');

    // Espelha a página de reabrir período: fora de ENCERRADO_PROVISORIO não há formulário.
    const main = page.locator('#main-content');
    await expect(main.getByText(/não está encerrado provisoriamente/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Motivo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reabrir exercício' })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(reabrir);
  });
});
