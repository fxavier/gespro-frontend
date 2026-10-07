/**
 * E2E #318 — factura a crédito acima do limite de crédito: emite e avisa em toast.
 *
 * Oráculo escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato da UI:
 *   - /faturacao/nova emite a factura mesmo quando o crédito em aberto do cliente passa a
 *     exceder o limite de crédito (a emissão não é bloqueada);
 *   - o resultado da Server Action traz `avisos`, e a UI mostra-os num toast (sonner) que fala
 *     do «limite de crédito».
 *
 * Cliente: «Maria Santos» (CLI-0003 do seed, ATIVO, limite 50 000 MT). Uma linha de
 * 1 × 50 000 a 16% (58 000) excede o limite sozinha, seja qual for a dívida que o tenant
 * `demo` já tenha.
 *
 * DEIXA DOCUMENTOS no tenant `demo` a cada corrida: uma factura EMITIDA de 58 000,00 e o
 * lançamento dela (D 411 / C 711 / C 44331). Mesmos pressupostos do `40-fatura-pagamento`:
 * corre de preferência contra a base isolada.
 */
import { test, expect } from '@playwright/test';
import { abrir, escolherCliente, diaMaputo, submeterECapturar } from './helpers/faturacao-ui';

const marca = () => `credito-utilizado-318 ${Date.now().toString(36)}`;

test.describe('/faturacao/nova — aviso de limite de crédito (#318)', () => {
  test('factura que leva o cliente acima do limite: emitida, com toast a avisar do limite de crédito', async ({ page }) => {
    test.setTimeout(180_000);
    const m = marca();
    await abrir(page, '/faturacao/nova', 'Nova Fatura');

    await escolherCliente(page, 'Maria Santos');
    await page.getByLabel('Data de Vencimento').fill(diaMaputo(30));
    await page.getByLabel('Descrição da linha 1').fill(m);
    await page.getByLabel('Preço unitário linha 1').fill('50000');
    await expect(page.getByRole('combobox', { name: /IVA/i }).first()).toHaveText(/^16%/);

    const { id, numero, corpo } = await submeterECapturar(
      page,
      page.getByRole('button', { name: 'Emitir Fatura' }),
      m,
    );

    // Não bloqueia: o documento foi emitido.
    expect(id, `a emissão acima do limite não pode ser recusada: ${corpo.slice(0, 400)}`).not.toBeNull();
    expect(numero).not.toBeNull();
    // O resultado da action leva o aviso.
    expect(corpo, 'o resultado da action traz `avisos`').toContain('avisos');
    expect(corpo).toMatch(/limite de cr[ée]dito/i);

    // A UI mostra-o num toast.
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /limite de cr[ée]dito/i }).first(),
      'toast com o aviso do limite de crédito',
    ).toBeVisible({ timeout: 30_000 });
  });
});
