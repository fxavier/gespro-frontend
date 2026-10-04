/**
 * E2E — issue #347, regra «desassociar»: em edição, escolher «Nenhuma (conta
 * raiz)» no campo Conta Mãe tem de tirar mesmo a mãe à conta.
 *
 * Causa: o `conta-form.tsx` mapeia a sentinela `SEM_PAI` para `undefined`, e o
 * `AtualizarContaPGCSchema` (`.partial()`) lê `undefined` como «não alterar».
 * Guardar com «Nenhuma» devolve «Conta actualizada.» e a mãe fica lá.
 *
 * Fluxo (tudo pela UI, sem tocar na base):
 *   1. cria uma conta mãe M e uma conta filha F (com M como mãe) — códigos
 *      únicos por corrida (`89.<n>` e `89.<n>.1`), sem movimentos, logo editáveis;
 *   2. o detalhe de F mostra M como conta mãe (guarda do próprio cenário);
 *   3. edita F, escolhe «Nenhuma (conta raiz)», guarda;
 *   4. o detalhe de F diz «Nenhuma — é uma conta de raiz.» e já não liga a M.
 *
 * VERMELHO hoje: o passo 4 continua a mostrar a ligação a M. Já no passo 3 o
 * trigger volta a mostrar M depois de escolher «Nenhuma» (o `undefined` faz o
 * react-hook-form repor o valor inicial) — verificado com `expect.soft`.
 *
 * Resíduo: cada corrida deixa DUAS contas (sem lançamentos, classe 1, códigos
 * `89.<n>`/`89.<n>.1`) no plano do tenant `demo`. Não entram em mapas (não têm
 * movimento), mas aparecem na listagem do plano de contas.
 */

import { test, expect, type Page } from '@playwright/test';

const LISTA = '/contabilidade/plano-contas';
const N = `${Date.now()}`.slice(-7);
const COD_MAE = `89.${N}`;
const COD_FILHA = `89.${N}.1`;
const NOME_MAE = `Mae E2E 347 ${N}`;
const NOME_FILHA = `Filha E2E 347 ${N}`;

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

function popover(page: Page) {
  return page.locator('[data-radix-popper-content-wrapper]').last();
}

async function criarConta(page: Page, codigo: string, nome: string, mae?: { codigo: string; nome: string }) {
  await page.goto(`${LISTA}/novo`);
  await expect(page.getByRole('heading', { name: 'Nova Conta PGC' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Código').fill(codigo);
  await page.getByLabel('Nome').fill(nome);

  if (mae) {
    const trigger = page.getByRole('combobox', { name: 'Conta Mãe' });
    await trigger.click();
    const input = popover(page).getByPlaceholder('Pesquisar…');
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(mae.codigo);
    const rotulo = `${mae.codigo} — ${mae.nome}`;
    const opcao = popover(page).getByRole('option', { name: rotulo });
    await expect(opcao).toBeVisible({ timeout: 15_000 });
    await opcao.click();
    await expect(trigger).toHaveText(rotulo, { timeout: 5_000 });
  }

  await page.getByRole('button', { name: /Guardar Conta/ }).click();
  await page.waitForURL((url) => url.pathname === LISTA, { timeout: 60_000 });
}

test.describe('issue #347 — «Nenhuma (conta raiz)» tira a mãe à conta', () => {
  test('editar uma conta com mãe, escolher «Nenhuma» e guardar deixa-a sem mãe', async ({ page }) => {
    test.setTimeout(180_000);

    await criarConta(page, COD_MAE, NOME_MAE);
    await criarConta(page, COD_FILHA, NOME_FILHA, { codigo: COD_MAE, nome: NOME_MAE });

    // Guarda do cenário: a filha nasceu com a mãe.
    const detalhe = await caminhoDaConta(page, COD_FILHA);
    await expect(page.getByRole('link', { name: `${COD_MAE} — ${NOME_MAE}` })).toBeVisible({
      timeout: 30_000,
    });

    // Editar → «Nenhuma (conta raiz)» → guardar.
    await page.goto(`${detalhe}/editar`);
    await expect(page.getByRole('heading', { name: new RegExp(`Editar ${COD_FILHA.replace(/\./g, '\\.')}`) })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('combobox', { name: 'Conta Mãe' });
    await expect(trigger).toHaveText(`${COD_MAE} — ${NOME_MAE}`, { timeout: 10_000 });
    await trigger.click();
    const nenhuma = popover(page).getByRole('option', { name: /Nenhuma \(conta raiz\)/ });
    await expect(nenhuma).toBeVisible({ timeout: 10_000 });
    await nenhuma.click();
    // Soft: hoje o `undefined` faz o react-hook-form repor o valor inicial e o
    // trigger volta a mostrar a mãe — o mesmo defeito, visto antes de guardar.
    // Segue-se para o passo 4, que é o critério de aceitação.
    await expect.soft(trigger).toHaveText(/Nenhuma \(conta raiz\)/, { timeout: 5_000 });

    await page.getByRole('button', { name: /Guardar Conta/ }).click();
    await page.waitForURL((url) => url.pathname === detalhe, { timeout: 60_000 });

    // O detalhe (recarregado do servidor) já não tem mãe.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hierarquia' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nenhuma — é uma conta de raiz.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: `${COD_MAE} — ${NOME_MAE}` })).toHaveCount(0);
  });
});
