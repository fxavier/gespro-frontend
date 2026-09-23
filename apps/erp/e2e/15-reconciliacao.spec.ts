/**
 * E2E: reconciliação bancária automática (ADR-0038, nó UI).
 *
 * Só o Standard Bank reconcilia no tenant demo: o BCI e o Millennium partilham a
 * conta PGC 121 e o serviço recusa-os (o ecrã tem de o dizer). O extracto é
 * sempre o mesmo ficheiro, por isso a segunda corrida é a prova do CA08
 * (JA_IMPORTADO, nada duplicado). O período abre-se uma vez e NÃO se fecha:
 * fechar é terminal e a corrida seguinte não poderia reabrir as mesmas datas.
 * O lançamento sugerido não se grava — verifica-se o pré-preenchimento.
 */

import { test, expect } from '@playwright/test';

const EXTRACTO = [
  'referencia;data;descricao;valor;tipo',
  'E2E-0001;10/09/2026;Transferência recebida E2E;25.000,00;D',
  ';15/09/2026;Comissão de manutenção E2E;350,00;C',
].join('\n');

async function abrirStandardBank(page: import('@playwright/test').Page) {
  await page.goto('/contabilidade/reconciliacao');
  await expect(page.getByRole('heading', { name: 'Reconciliação Bancária' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('row', { name: /Standard Bank/ }).click();
  await page.waitForURL(/\/contabilidade\/reconciliacao\/[a-z0-9-]+$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /Standard Bank/ })).toBeVisible();
}

test('a lista mostra as contas e assinala as que partilham conta PGC', async ({ page }) => {
  await page.goto('/contabilidade/reconciliacao');
  await expect(page.getByRole('row', { name: /BCI/ })).toContainText('conta PGC partilhada', { timeout: 30_000 });
  await expect(page.getByRole('row', { name: /Standard Bank/ })).not.toContainText('conta PGC partilhada');
});

test('importar um extracto, ver as excepções e pedir o lançamento sugerido (RF §9, §23, CA08)', async ({ page }) => {
  await abrirStandardBank(page);
  await page.getByRole('link', { name: /Importar extracto/ }).click();
  await page.waitForURL(/\/importar$/);

  await page.getByLabel('Extracto').setInputFiles({
    name: 'standard-bank-e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(EXTRACTO, 'utf8'),
  });
  await page.getByRole('button', { name: /Importar e reconciliar/ }).click();
  // 1.ª corrida importa; as seguintes provam a idempotência do ficheiro.
  await expect(page.getByText(/movimento\(s\) importado|já tinha sido importado/)).toBeVisible({ timeout: 30_000 });
  await page.waitForURL(/\/contabilidade\/reconciliacao\/[a-z0-9-]+$/, { timeout: 60_000 });

  // O workspace abre nas excepções: o banco sem contrapartida está lá.
  await expect(page.getByRole('link', { name: /Excepções/ })).toHaveAttribute('aria-current', 'page');
  const comissao = page.getByRole('row', { name: /Comissão de manutenção E2E/ });
  await expect(comissao).toBeVisible();
  await expect(comissao).toContainText('Banco sem contabilização');
  await expect(page.locator('#main-content')).not.toContainText('BANCO_SEM_CONTABILIZACAO');

  // RF §9: a regra das comissões sugere o lançamento — chega pré-preenchido.
  await comissao.getByRole('button', { name: /Contabilizar/ }).click();
  await page.waitForURL(/\/contabilidade\/lancamentos\/novo\?/, { timeout: 60_000 });
  expect(new URL(page.url()).searchParams.getAll('p')).toHaveLength(2);
  await expect(page.getByRole('textbox', { name: /Histórico/ }).first()).toHaveValue(/Comissão de manutenção E2E/);
});

test('período: abrir, ver o mapa de fecho e exportar; fechar com diferença exige justificação (RF §17)', async ({ page }) => {
  await abrirStandardBank(page);
  const periodo = page.getByRole('link', { name: /Abrir período|Período em curso/ });
  const texto = (await periodo.innerText()).trim();
  await periodo.click();

  if (/Abrir período/.test(texto)) {
    await page.waitForURL(/\/periodos\/novo$/);
    await page.locator('input[name="dataInicio"]').fill('2026-09-01');
    await page.locator('input[name="dataFim"]').fill('2026-09-30');
    await page.locator('input[name="saldoInicialBanco"]').fill('0.00');
    await page.locator('input[name="saldoFinalBanco"]').fill('24650.00');
    await page.getByRole('button', { name: /Abrir período/ }).click();
  }
  await page.waitForURL(/\/periodos\/[a-z0-9-]+$/, { timeout: 60_000 });

  await expect(page.getByRole('heading', { name: 'Mapa de fecho' })).toBeVisible();
  await expect(page.locator('#main-content')).toContainText('Bancários por contabilizar');
  await expect(page.locator('#main-content')).toContainText('Saldo reconciliado');

  // A comissão por contabilizar deixa diferença residual: fechar pede justificação.
  const fechar = page.getByRole('button', { name: /Fechar período/ });
  const justificacao = page.getByLabel(/Justificação da diferença residual/);
  if (await justificacao.count()) {
    await expect(fechar).toBeDisabled();
    await justificacao.fill('curta');
    await expect(fechar).toBeDisabled();
    await justificacao.fill('Comissão ainda por contabilizar — lançada em Outubro');
    await expect(fechar).toBeEnabled();
  } else {
    // Sem diferença residual, fecha sem justificação — e o ecrã di-lo.
    await expect(page.locator('#main-content')).toContainText('Reconciliação OK');
    await expect(fechar).toBeEnabled();
  }

  // Exportação: mesma permissão, CSV com o mapa.
  const id = new URL(page.url()).pathname.split('/').pop();
  const resp = await page.request.get(`/api/reconciliacao/periodos/${id}/export?formato=csv`);
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toContain('text/csv');
  expect(await resp.text()).toContain('Diferença residual');
});
