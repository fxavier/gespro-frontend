/**
 * E2E — issue #148 (ticket 7, #256): liquidar e cancelar nota de crédito,
 * cancelar proforma e cotação.
 *
 * Conduz só a UI (admin do seed). Cada teste cria pela UI o que precisa — a
 * factura, a NC sobre ela, a proforma, a cotação — e só transita documentos
 * que ele próprio criou.
 *
 * Cria e transita documentos por corrida — corre contra a base ISOLADA
 * (`gespro_e2e77`), NUNCA contra `gespro`: o método é o do `17-iva-isento`, um
 * `next dev` da worktree numa porta livre com `DATABASE_URL` apontado à base
 * isolada, e o Playwright com `BASE_URL` para essa porta:
 *
 *   DATABASE_URL=…/gespro_e2e77 DIRECT_URL=…/gespro_e2e77 npx next dev -p 3012
 *   BASE_URL=http://localhost:3012 npx playwright test e2e/21-nc-proforma-cotacao.spec.ts
 *
 * Pressupostos da base isolada (seed demo): cliente «Maria …», conta bancária
 * CORRENTE activa (Millennium bim) com conta contabilística, período corrente
 * aberto e sem apuramento de IVA.
 *
 * Não coberto aqui, e porquê: «sem `caixa:operar` nem `financas:banca:escrita`
 * mas com `faturacao:nc:liquidar` ⇒ a Devolução não aparece». Nenhum papel do
 * seed tem essa combinação (ADMIN/GESTOR/FINANCEIRO têm as três; OPERADOR e
 * LEITURA não têm `faturacao:nc:liquidar`), por isso não há utilizador para o
 * conduzir sem fabricar dados de RBAC.
 */

import { test, expect } from '@playwright/test';
import {
  diaMaputo,
  hojeFormatado,
  paraNumero,
  valorAoLado,
  esperarValor,
  marca,
  submeterECapturar,
  abrir,
  esperarEstado,
  emitirFatura,
  emitirNotaCredito,
  abrirNCPelaLista,
  obterClienteId,
} from './helpers/faturacao-ui';

// ─── testes ───────────────────────────────────────────────────────────────────

test.describe('/faturacao/nota-credito — liquidar e cancelar (#148)', () => {
  test('liquidar por compensação: NC LIQUIDADA com forma e data, e o saldo da factura desce pelo total da NC', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fatura = await emitirFatura(page);
    const nc = await emitirNotaCredito(page, fatura.id);
    const detalhe = await abrirNCPelaLista(page, nc);
    await esperarEstado(page, 'Emitida');

    await page.getByRole('link', { name: 'Liquidar', exact: true }).click();
    await page.waitForURL(new RegExp(`${detalhe}/liquidar$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Liquidar ${nc}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    // Saldo mostrado: factura de 1160 sem pagamentos.
    await esperarValor(page.getByTestId('nc-saldo-fatura'), 1160, 'saldo em aberto da factura mostrado');
    const compensacao = page.getByRole('radio', { name: /Compensação na factura/ });
    await expect(compensacao).toBeChecked();

    await page.getByRole('button', { name: /^Liquidar / }).click();
    await page.waitForURL(new RegExp(`${detalhe}$`), { timeout: 60_000 });

    await esperarEstado(page, 'Liquidada');
    const bloco = page.getByTestId('nc-liquidacao');
    await expect(bloco).toBeVisible({ timeout: 20_000 });
    await expect(bloco).toContainText('Compensação na factura original');
    await expect(bloco).toContainText(hojeFormatado());
    await expect(bloco.getByRole('link', { name: 'Ver lançamento', exact: true })).toHaveCount(0);

    // A factura original, pela ligação do detalhe da NC: pago 116, pendente 1044.
    await page.getByRole('link', { name: fatura.numero }).click();
    await page.waitForURL(new RegExp(`/faturacao/${fatura.id}$`), { timeout: 30_000 });
    await esperarValor(valorAoLado(page, 'Total Pago').first(), 116, 'Total Pago da factura depois da compensação');
    await esperarValor(valorAoLado(page, 'Pendente').first(), 1044, 'Pendente da factura depois da compensação');
  });

  test('cancelar: motivo curto não submete; com motivo, NC CANCELADA, motivo visível e o lançamento original ESTORNADO', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fatura = await emitirFatura(page);
    const nc = await emitirNotaCredito(page, fatura.id);
    const detalhe = await abrirNCPelaLista(page, nc);

    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await page.waitForURL(new RegExp(`${detalhe}/cancelar$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Cancelar ${nc}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('cancelar-aviso')).toContainText('estornado');

    // Motivo com 2 caracteres ⇒ erro no campo, e nenhuma Server Action pedida.
    let accoesPedidas = 0;
    const contar = (req: import('@playwright/test').Request) => {
      if (req.method() === 'POST' && req.headers()['next-action']) accoesPedidas++;
    };
    page.on('request', contar);
    const motivo = page.getByLabel('Motivo', { exact: true });
    await motivo.fill('ab');
    await page.getByRole('button', { name: 'Cancelar nota de crédito' }).click();
    await expect(page.getByText('Indique o motivo (mínimo 3 caracteres)')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    page.off('request', contar);
    expect(accoesPedidas, 'um motivo inválido não pode chegar ao servidor').toBe(0);
    await expect(page).toHaveURL(new RegExp(`${detalhe}/cancelar$`));

    const textoMotivo = `Emitida por engano — ${marca('cancelar NC')}`;
    await motivo.fill(textoMotivo);
    await page.getByRole('button', { name: 'Cancelar nota de crédito' }).click();
    await page.waitForURL(new RegExp(`${detalhe}$`), { timeout: 60_000 });

    await esperarEstado(page, 'Cancelada');
    const bloco = page.getByTestId('nc-cancelamento');
    await expect(bloco).toBeVisible({ timeout: 20_000 });
    await expect(bloco).toContainText(textoMotivo);
    const ligacaoEstorno = bloco.getByRole('link', { name: 'Ver estorno', exact: true });
    await expect(ligacaoEstorno).toBeVisible();
    const hrefEstorno = await ligacaoEstorno.getAttribute('href');
    expect(hrefEstorno).toMatch(/^\/contabilidade\/lancamentos\/[^/]+$/);

    // Sem acções: uma NC cancelada não se liquida nem se cancela outra vez.
    await expect(page.getByRole('link', { name: 'Liquidar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cancelar', exact: true })).toHaveCount(0);

    // O lançamento da emissão, aberto pela ligação: ESTORNADO.
    const hrefEmissao = await page.getByRole('link', { name: 'Ver lançamento', exact: true }).getAttribute('href');
    expect(hrefEmissao).toMatch(/^\/contabilidade\/lancamentos\/[^/]+$/);
    expect(hrefEmissao).not.toBe(hrefEstorno);
    await page.getByRole('link', { name: 'Ver lançamento', exact: true }).click();
    await page.waitForURL(new RegExp(`${hrefEmissao}$`), { timeout: 30_000 });
    await esperarEstado(page, 'Estornado');

    // E o estorno existe e está lançado.
    await page.goto(hrefEstorno!);
    await esperarEstado(page, 'Lançado');
  });

  test('liquidar por devolução em transferência bancária: NC LIQUIDADA com ligação ao lançamento', async ({ page }) => {
    test.setTimeout(240_000);
    const fatura = await emitirFatura(page);
    const nc = await emitirNotaCredito(page, fatura.id);
    const detalhe = await abrirNCPelaLista(page, nc);

    await page.goto(`${detalhe}/liquidar`);
    await expect(page.getByRole('heading', { name: `Liquidar ${nc}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    await page.getByRole('radio', { name: /Devolução ao cliente/ }).click();
    const formaPagamento = page.getByRole('combobox', { name: 'Forma de pagamento' });
    await expect(formaPagamento).toBeVisible();
    await formaPagamento.click();
    await page.getByRole('option', { name: 'Transferência bancária' }).click();
    await expect(formaPagamento).toHaveText('Transferência bancária');

    const conta = page.getByRole('combobox', { name: 'Conta bancária' });
    await conta.click();
    await page.getByRole('option', { name: /Millennium bim/ }).click();
    await expect(conta).toHaveText(/Millennium bim/);

    await page.getByRole('button', { name: /^Liquidar / }).click();
    await page.waitForURL(new RegExp(`${detalhe}$`), { timeout: 60_000 });

    await esperarEstado(page, 'Liquidada');
    const bloco = page.getByTestId('nc-liquidacao');
    await expect(bloco).toContainText('Devolução ao cliente');
    await expect(bloco).toContainText(hojeFormatado());
    const ligacao = bloco.getByRole('link', { name: 'Ver lançamento', exact: true });
    await expect(ligacao).toBeVisible();
    const href = await ligacao.getAttribute('href');
    expect(href).toMatch(/^\/contabilidade\/lancamentos\/[^/]+$/);

    await ligacao.click();
    await page.waitForURL(new RegExp(`${href}$`), { timeout: 30_000 });
    await esperarEstado(page, 'Lançado');
    // 411 Clientes a débito pelo total da NC.
    await expect(page.locator('#main-content')).toContainText('411');

    // A devolução não mexe no saldo da factura: continua 1160 por pagar.
    await page.goto(`/faturacao/${fatura.id}`);
    await esperarValor(valorAoLado(page, 'Pendente').first(), 1160, 'Pendente da factura depois da devolução');
  });
});

test.describe('/faturacao/proforma e /faturacao/cotacoes — cancelar (#148)', () => {
  test('cancelar uma proforma (menu ⋯ da lista): CANCELADA com motivo, observações intactas', async ({ page }) => {
    test.setTimeout(180_000);
    const clienteId = await obterClienteId(page);
    const m = marca('proforma');
    const observacoes = `Observação original — ${m}`;

    await abrir(page, '/faturacao/proforma/nova', 'Nova Fatura Proforma');
    await page.getByLabel(/ID do Cliente/).fill(clienteId);
    await page.getByLabel(/Data de Validade/).fill(diaMaputo(30));
    await page.getByLabel('Descrição da linha 1').fill(m);
    await page.getByLabel('Preço unitário linha 1').fill('500');
    await page.getByPlaceholder('Observações adicionais (opcional)…').fill(observacoes);
    const { id, numero, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Criar Proforma' }), m);
    expect(id, `a criação da proforma não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
    await page.waitForURL(/\/faturacao\/proforma$/, { timeout: 60_000 });

    // Menu ⋯ da linha → Cancelar.
    await abrir(page, '/faturacao/proforma', /Proforma/);
    const linha = page.locator('tbody tr', { hasText: numero! });
    await expect(linha).toBeVisible({ timeout: 20_000 });
    await linha.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Cancelar', exact: true }).click();
    await page.waitForURL(new RegExp(`/faturacao/proforma/${id}/cancelar$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Cancelar ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const motivo = `O cliente desistiu — ${m}`;
    await page.getByLabel('Motivo', { exact: true }).fill(motivo);
    await page.getByRole('button', { name: 'Cancelar proforma' }).click();
    await page.waitForURL(new RegExp(`/faturacao/proforma/${id}$`), { timeout: 60_000 });

    await esperarEstado(page, 'Cancelada');
    await page.getByRole('tab', { name: 'Detalhes' }).click();
    const painel = page.getByRole('tabpanel');
    await expect(painel).toContainText('Motivo do cancelamento');
    await expect(painel).toContainText(motivo);
    await expect(painel).toContainText(observacoes);
    await expect(page.getByRole('link', { name: 'Cancelar', exact: true })).toHaveCount(0);
  });

  test('cancelar uma cotação em RASCUNHO (barra do detalhe): CANCELADA com motivo, observações intactas', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const clienteId = await obterClienteId(page);
    const m = marca('cotação');
    const observacoes = `Observação original — ${m}`;

    await abrir(page, '/faturacao/cotacoes/nova', 'Nova Cotação');
    await page.getByLabel(/ID do Cliente/).fill(clienteId);
    await page.getByLabel(/Data de Validade/).fill(diaMaputo(30));
    await page.getByLabel('Descrição da linha 1').fill(m);
    await page.getByLabel('Preço unitário linha 1').fill('500');
    await page.getByPlaceholder('Observações adicionais (opcional)…').fill(observacoes);
    const { id, numero, corpo } = await submeterECapturar(page, page.getByRole('button', { name: 'Criar Cotação' }), m);
    expect(id, `a criação da cotação não devolveu o documento: ${corpo.slice(0, 400)}`).not.toBeNull();
    await page.waitForURL(/\/faturacao\/cotacoes$/, { timeout: 60_000 });

    await abrir(page, `/faturacao/cotacoes/${id}`, new RegExp(numero!));
    await esperarEstado(page, 'Rascunho');
    await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
    await page.waitForURL(new RegExp(`/faturacao/cotacoes/${id}/cancelar$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Cancelar ${numero}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const motivo = `Pedido retirado — ${m}`;
    await page.getByLabel('Motivo', { exact: true }).fill(motivo);
    await page.getByRole('button', { name: 'Cancelar cotação' }).click();
    await page.waitForURL(new RegExp(`/faturacao/cotacoes/${id}$`), { timeout: 60_000 });

    await esperarEstado(page, 'Cancelada');
    await page.getByRole('tab', { name: 'Detalhes' }).click();
    const painel = page.getByRole('tabpanel');
    await expect(painel).toContainText('Motivo do cancelamento');
    await expect(painel).toContainText(motivo);
    await expect(painel).toContainText(observacoes);
    await expect(page.getByRole('link', { name: 'Cancelar', exact: true })).toHaveCount(0);
  });
});
