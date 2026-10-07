/**
 * E2E #86 / #266 — «Factura a creditar» só oferece facturas com saldo creditável, e mostra-o.
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato da UI:
 *   - /faturacao/nota-credito/nova: a opção de uma factura parcialmente creditada mostra o
 *     SALDO creditável (1160 − 116 = 1 044,00); uma factura creditada por inteiro deixa de
 *     aparecer na pesquisa pelo número;
 *   - /vendas/notas-credito/nova deixa a lista local (`listarFaturas` EMITIDA, take 100) e
 *     passa à MESMA combobox remota: «Factura a creditar», pesquisa «Pesquisar pelo número…»
 *     feita no servidor (cada termo vai num pedido de Server Action), rótulo com o saldo, e
 *     a factura creditada por inteiro também não aparece lá.
 *
 * DEIXA DOCUMENTOS no tenant `demo` a cada corrida (facturas de 1 160,00 e NC sobre elas, com
 * os lançamentos). Corre de preferência contra a base isolada (ver `23-nc-escolher-fatura`).
 */
import { test, expect, type Page } from '@playwright/test';
import {
  abrir,
  emitirFatura,
  emitirNotaCredito,
  escaparRegex,
  escolherFaturaACreditar,
  submeterECapturar,
} from './helpers/faturacao-ui';

const PREFIXO = 'nc-saldo-creditavel-86';
const marca = (r: string) => `${PREFIXO} ${r} ${Date.now().toString(36)}`;

/** «1 044,00» com qualquer separador de milhares (espaço, NBSP, NNBSP ou ponto). */
const valor = (inteiro: string, dec = '00') =>
  new RegExp(`${inteiro.slice(0, -3)}[\\s.\\u00a0\\u202f]?${inteiro.slice(-3)},${dec}`);

/** NC de 1 × `preco` a 16% pela UI de faturação. */
async function emitirNCValor(page: Page, faturaNumero: string, preco: number): Promise<string> {
  const m = marca('NC');
  await abrir(page, '/faturacao/nota-credito/nova', 'Nova Nota de Crédito');
  await escolherFaturaACreditar(page, faturaNumero);
  await page.getByLabel('Motivo *').fill(`Crédito — ${m}`);
  await page.getByLabel('Descrição da linha 1').fill(m);
  await page.getByLabel('Preço unitário linha 1').fill(String(preco));
  const { numero, corpo } = await submeterECapturar(
    page,
    page.getByRole('button', { name: 'Emitir Nota de Crédito' }),
    m,
  );
  expect(numero, `a emissão da NC não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
  await page.waitForURL(/\/faturacao\/nota-credito$/, { timeout: 60_000 });
  return numero!;
}

/** Abre a combobox «Factura a creditar», pesquisa `termo` e devolve as opções da factura `numero`. */
async function pesquisar(page: Page, termo: string, numero: string) {
  const combobox = page.getByRole('combobox', { name: /Factura a creditar/ });
  await expect(combobox).toBeVisible();
  await combobox.click();
  const pesquisa = page.getByPlaceholder('Pesquisar pelo número…');
  await expect(pesquisa).toBeVisible();
  // Espera pela RESPOSTA do servidor a este termo antes de afirmar sobre as opções: sem
  // isto, um «0 opções» podia ser lido antes de a resposta chegar e passar sem provar nada.
  const resposta = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      !!r.request().headers()['next-action'] &&
      (r.request().postData() ?? '').includes(termo),
    { timeout: 15_000 },
  );
  await pesquisa.fill(termo);
  await resposta;
  return page.getByRole('option').filter({ hasText: new RegExp(`^\\s*${escaparRegex(numero)}`) });
}

test.describe('/faturacao/nota-credito/nova — saldo creditável (#86, #266)', () => {
  test('parcial mostra o saldo; creditada por inteiro desaparece da pesquisa', async ({ page }) => {
    test.setTimeout(300_000);
    const fatura = await emitirFatura(page); // 1160
    await emitirNotaCredito(page, fatura.numero); // 116

    await abrir(page, '/faturacao/nota-credito/nova', 'Nova Nota de Crédito');
    const opcao = await pesquisar(page, fatura.numero.slice(-6), fatura.numero);
    await expect(opcao, 'a factura parcialmente creditada tem de aparecer').toHaveCount(1, { timeout: 15_000 });
    await expect(opcao, 'o rótulo mostra o saldo creditável 1 044,00').toContainText(valor('1044'));

    // Fecha o saldo: 900 × 1,16 = 1044.
    await emitirNCValor(page, fatura.numero, 900);

    await abrir(page, '/faturacao/nota-credito/nova', 'Nova Nota de Crédito');
    const depois = await pesquisar(page, fatura.numero.slice(-6), fatura.numero);
    await expect(depois, 'a factura creditada por inteiro não pode voltar a ser oferecida').toHaveCount(0, {
      timeout: 15_000,
    });
  });
});

test.describe('/vendas/notas-credito/nova — a mesma combobox remota (#86)', () => {
  test('pesquisa no servidor pelo número, com o saldo no rótulo; sem a creditada por inteiro', async ({ page }) => {
    test.setTimeout(300_000);
    const livre = await emitirFatura(page); // 1160, sem NC
    const creditada = await emitirFatura(page);
    await emitirNCValor(page, creditada.numero, 1000); // 1160 — creditada por inteiro

    await abrir(page, '/vendas/notas-credito/nova', 'Nova Nota de Crédito');

    // A pesquisa vai ao servidor: `pesquisar` só devolve depois da resposta da Server Action
    // que leva o termo — uma lista local (o `Combobox` antigo) nunca a pede, e rebenta aqui.
    const opcao = await pesquisar(page, livre.numero.slice(-6), livre.numero);
    await expect(opcao, `a factura ${livre.numero} tem de aparecer`).toHaveCount(1, { timeout: 15_000 });
    await expect(opcao, 'o rótulo mostra o saldo creditável 1 160,00').toContainText(valor('1160'));

    await opcao.click();
    await expect(page.getByRole('combobox', { name: /Factura a creditar/ })).toHaveText(
      new RegExp(escaparRegex(livre.numero)),
    );

    // A creditada por inteiro não é oferecida.
    await page.goto('/vendas/notas-credito/nova');
    await page.waitForLoadState('networkidle');
    const semSaldo = await pesquisar(page, creditada.numero.slice(-6), creditada.numero);
    await expect(semSaldo).toHaveCount(0, { timeout: 15_000 });
  });
});
