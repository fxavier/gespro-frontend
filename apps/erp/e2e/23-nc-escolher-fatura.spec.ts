/**
 * E2E — issue #258: a factura a creditar escolhe-se pelo NÚMERO.
 *
 * Antes, `/faturacao/nota-credito/nova` pedia o id (CUID) da factura num campo
 * de texto — ninguém o sabe de cor. Agora é uma `ComboboxRemoto` «Factura a
 * creditar», com as facturas creditáveis mais recentes e pesquisa no servidor
 * pelo número, insensível a maiúsculas.
 *
 * Cria documentos por corrida — corre contra a base ISOLADA (`gespro_e2e77`),
 * NUNCA contra `gespro` (método do `21-nc-proforma-cotacao`):
 *
 *   DATABASE_URL=…/gespro_e2e77 DIRECT_URL=…/gespro_e2e77 npx next dev -p 3012
 *   BASE_URL=http://localhost:3012 npx playwright test e2e/23-nc-escolher-fatura.spec.ts
 */

import { test, expect } from '@playwright/test';
import {
  abrir,
  emitirFatura,
  emitirNotaCredito,
  abrirNCPelaLista,
  escaparRegex,
  hojeFormatado,
} from './helpers/faturacao-ui';

test.describe('/faturacao/nota-credito/nova — escolher a factura pelo número (#258)', () => {
  test('a factura escolhe-se numa combobox com pesquisa pelo número, e a NC fica ligada a ela', async ({ page }) => {
    test.setTimeout(240_000);
    const fatura = await emitirFatura(page);

    await abrir(page, '/faturacao/nota-credito/nova', 'Nova Nota de Crédito');

    // O campo de colar o id desapareceu, e o aviso de «integração futura» também.
    await expect(page.getByRole('textbox', { name: /ID da Factura/i })).toHaveCount(0);
    await expect(page.getByLabel(/ID da Factura/i)).toHaveCount(0);
    await expect(page.getByText('Pesquisa de facturas disponível após integração comercial.')).toHaveCount(0);

    const combobox = page.getByRole('combobox', { name: /Factura a creditar/ });
    await expect(combobox).toBeVisible();
    await expect(combobox).toHaveText(/Seleccionar factura/);

    await combobox.click();
    const pesquisa = page.getByPlaceholder('Pesquisar pelo número…');
    await expect(pesquisa).toBeVisible();

    // A lista abre com as mais recentes — a factura acabada de emitir está lá.
    const opcoesDeFactura = page.getByRole('option').filter({ hasText: /\/\d{4}\/\d+/ });
    await expect(opcoesDeFactura.first()).toBeVisible({ timeout: 15_000 });

    // Número que não existe ⇒ o servidor não devolve nenhuma factura. Como a
    // lista tinha opções, chegar a zero prova que a pesquisa foi ao servidor.
    await pesquisa.fill('ZZZ/9999/999999');
    await expect(opcoesDeFactura).toHaveCount(0, { timeout: 15_000 });

    // Parte do número em minúsculas (prefixo sem a 1.ª letra + ano + dígitos
    // finais) ⇒ a factura aparece: pesquisa por substring, insensível a maiúsculas.
    const parteMinusculas = fatura.numero.slice(1).toLowerCase();
    expect(parteMinusculas, 'o número tem de ter letras para provar a insensibilidade').not.toBe(
      fatura.numero.slice(1),
    );
    await pesquisa.fill(parteMinusculas);
    const opcao = page
      .getByRole('option')
      .filter({ hasText: new RegExp(`^\\s*${escaparRegex(fatura.numero)}`) });
    await expect(opcao, `a factura ${fatura.numero} não aparece ao pesquisar «${parteMinusculas}»`).toHaveCount(1, {
      timeout: 15_000,
    });
    // O rótulo diz número · data de emissão · total — não o id.
    await expect(opcao).toContainText(hojeFormatado());
    await expect(opcao).not.toContainText(fatura.id);

    await opcao.click();
    await expect(combobox).toHaveText(new RegExp(escaparRegex(fatura.numero)));

    // Emite pela via normal (o helper volta a escolher pela combobox) e confirma
    // que a NC ficou ligada à factura escolhida.
    const nc = await emitirNotaCredito(page, fatura.numero);
    await abrirNCPelaLista(page, nc);
    await expect(page.getByRole('link', { name: fatura.numero, exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
