/**
 * Oráculo E2E devolucoes-ecras-130 — aprovar, rejeitar e processar devoluções e criar trocas a
 * partir da UI (#130).
 *
 * As actions `aprovarDevolucao`, `rejeitarDevolucao`, `processarDevolucao` (NC + liquidação +
 * stock) e `criarTroca` (NC + Factura-Recibo) existiam sem ecrã: o detalhe de
 * `/vendas/devolucoes/[id]` só mostrava o estado, e uma devolução criada pela UI ficava PENDENTE
 * para sempre. `/vendas/trocas` mandava «Nova Troca» para a listagem de devoluções.
 *
 * Contrato da UI (sem modais — AlertDialog só para confirmar; recolher dados é rota):
 *   - PENDENTE: botões «Aprovar» e «Rejeitar» no detalhe. Cada um abre um AlertDialog
 *     (role=alertdialog) cujo botão de confirmação se chama «Aprovar» / «Rejeitar». Nada de
 *     «Processar» nem «Criar Troca» enquanto PENDENTE.
 *   - APROVADA: ligação «Processar» → rota própria `/vendas/devolucoes/[id]/processar`, com o
 *     título «Processar Devolução <número>», a escolha da localização de entrada do stock
 *     («Localização *», obrigatória — submeter sem ela não sai da rota e mostra o erro) e o botão
 *     «Processar Devolução». A série da nota de crédito não se escolhe à mão (a numeração é a da
 *     série activa, #93): a página não pede «Série» ao utilizador. Volta ao detalhe com «Processada».
 *   - APROVADA com factura: ligação «Criar Troca» → rota `/vendas/trocas/nova` (com a devolução
 *     já escolhida e o seu número à vista; título «Nova Troca»). Lá: «Produto *» (pesquisa no
 *     servidor; escolher o produto preenche o preço com o preço de venda, molde de
 *     `nova-encomenda-form`), «Localização *» e o botão «Criar Troca». Substituto de igual valor →
 *     diferença 0, sem pagamentos nem sessão de caixa. Acaba em `/vendas/trocas`, com a troca nova
 *     (TRC/aaaa/nnnnnn) na lista.
 *   - `/vendas/trocas` tem a ligação «Nova Troca» para `/vendas/trocas/nova` (não para a listagem
 *     de devoluções).
 *   - PROCESSADA / REJEITADA: sem «Aprovar», «Rejeitar», «Processar» nem «Criar Troca».
 *     Uma REJEITADA nunca diz «Aprovada em» (o histórico não pode chamar aprovação a uma rejeição).
 *   - O estado aparece pelo StatusBadge: Pendente / Aprovada / Processada / Rejeitada.
 *
 * Dados (prefixo único `devolucoes-ecras-130`): no tenant `demo`, três devoluções de 1 unidade de
 * uma linha de uma factura do seed (preço da linha = preço de venda do produto, sem desconto,
 * com crédito por abater), escritas por SQL com o número tirado da série NOTA_DEVOLUCAO activa
 * (que fica avançada — nunca inventado) e `observacoes` = a marca. Cada corrida deixa no `demo`:
 * duas NC (append-only, não se apagam), uma troca com a sua venda e Factura-Recibo, uma devolução
 * REJEITADA e uma entrada de stock por cada processamento/troca no Armazém Principal (LOC-001).
 *
 * ESTADO ESPERADO antes da implementação: RED — os botões e as rotas não existem.
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/48-devolucoes-ecras-130.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:devolucoes-ecras-130; um agente de implementação que o
 * altere é BLOCKER.
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const MARCA = 'devolucoes-ecras-130';
const ESTADO_EM_BRUTO = /\b(PENDENTE|APROVADA|PROCESSADA|REJEITADA)\b/;

/** Id no formato cuid (as actions validam `z.string().cuid()`). */
const novoId = () => `c${randomBytes(12).toString('hex')}`;

function dbUrl(): string {
  try {
    process.loadEnvFile(path.join(process.cwd(), '.env'));
  } catch {
    // já carregado ou inexistente
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não está definida — verifique apps/erp/.env');
  return url;
}

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: dbUrl() });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

function formatarNumero(template: string, prefixo: string, ano: number, numero: number): string {
  return template
    .replace('{prefixo}', prefixo)
    .replace('{ano}', String(ano))
    .replace(/\{numero(?::(\d+))?\}/, (_, w) => String(numero).padStart(w ? parseInt(w, 10) : 1, '0'));
}

type Linha = {
  tenantId: string;
  faturaId: string;
  clienteId: string;
  produtoId: string;
  nome: string;
  sku: string;
  preco: string;
  taxa: string;
};

type Devolucao = { id: string; numero: string; caminho: string };

const dados: { linha?: Linha; aProcessar?: Devolucao; aRejeitar?: Devolucao; aTrocar?: Devolucao } = {};

async function escolherLinha(c: Client): Promise<Linha> {
  const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
  if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  const tenantId = t.rows[0].id;
  // Linha de factura do seed com preço = preço de venda (o substituto de igual valor sai do preço
  // de venda) e com crédito por abater para três unidades (NC de 1 unidade × 2 corridas e folga).
  const r = await c.query<Linha>(
    `SELECT f.id AS "faturaId", f."clienteId", l."produtoId", p.nome, p.sku,
            l."precoUnitario"::text AS preco, l."taxaIva"::text AS taxa, f."tenantId"
       FROM "LinhaFatura" l
       JOIN "Fatura" f ON f.id = l."faturaId"
       JOIN "Produto" p ON p.id = l."produtoId" AND p."tenantId" = f."tenantId"
      WHERE f."tenantId" = $1
        AND f.status IN ('EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA')
        AND l.desconto = 0 AND l.quantidade >= 1
        AND l."precoUnitario" = p."precoVenda" AND l."taxaIva" = p."taxaIva"
        AND p."deletedAt" IS NULL AND p.ativo = true
        AND f.total - COALESCE((SELECT SUM(nc.total) FROM "NotaCredito" nc
                                 WHERE nc."faturaOriginalId" = f.id AND nc.status <> 'CANCELADA'), 0)
            >= 3 * l."precoUnitario" * (1 + l."taxaIva")
      ORDER BY f."createdAt" DESC
      LIMIT 1`,
    [tenantId],
  );
  if (!r.rows[0]) throw new Error('STOP: nenhuma linha de factura do demo serve (pnpm db:seed)');
  return r.rows[0];
}

/** Devolução PENDENTE de 1 unidade da linha, numerada pela série NOTA_DEVOLUCAO activa. */
async function inserirDevolucao(c: Client, l: Linha): Promise<Devolucao> {
  const serie = await c.query<{ numero: number; prefixo: string; ano: number; formatoNumero: string }>(
    `UPDATE "SerieDocumento" SET "proximoNumero" = "proximoNumero" + 1
      WHERE id = (SELECT id FROM "SerieDocumento"
                   WHERE "tenantId" = $1 AND tipo::text = 'NOTA_DEVOLUCAO' AND ativo = true
                     AND ano = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Maputo'))::int
                   ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE)
      RETURNING "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"`,
    [l.tenantId],
  );
  if (!serie.rows[0]) throw new Error('STOP: série NOTA_DEVOLUCAO activa do ano não encontrada no demo');
  const s = serie.rows[0];
  const numero = formatarNumero(s.formatoNumero, s.prefixo, s.ano, Number(s.numero));
  const id = novoId();
  const preco = Number(l.preco);
  const taxa = Number(l.taxa);
  const subtotal = preco.toFixed(2);
  const iva = (preco * taxa).toFixed(2);
  const total = (Number(subtotal) + Number(iva)).toFixed(2);

  await c.query(
    `INSERT INTO "Devolucao" (id, "tenantId", numero, "clienteId", "faturaId", motivo, status,
       "valorTotal", reembolso, observacoes, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'DEFEITO', 'PENDENTE', $6, false, $7, now(), now())`,
    [id, l.tenantId, numero, l.clienteId, l.faturaId, total, MARCA],
  );
  await c.query(
    `INSERT INTO "ItemDevolucao" (id, "tenantId", "devolucaoId", "produtoId", "nomeProduto", sku,
       quantidade, "valorUnitario", "taxaIva", subtotal, "ivaItem", total, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10, $11, now())`,
    [novoId(), l.tenantId, id, l.produtoId, l.nome, l.sku, l.preco, l.taxa, subtotal, iva, total],
  );
  return { id, numero, caminho: `/vendas/devolucoes/${id}` };
}

async function estado(id: string) {
  return withPg(async (c) => {
    const r = await c.query(
      `SELECT status::text AS status, "notaCreditoId" FROM "Devolucao" WHERE id = $1`,
      [id],
    );
    return r.rows[0] as { status: string; notaCreditoId: string | null };
  });
}

async function abrirDetalhe(page: Page, d: Devolucao) {
  await page.goto(d.caminho);
  await expect(page.getByRole('heading', { name: `Devolução ${d.numero}` })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

async function semAccoes(page: Page) {
  await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rejeitar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Processar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Criar Troca', exact: true })).toHaveCount(0);
}

async function aprovar(page: Page) {
  await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect(page.getByText('Aprovada', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
}

async function escolherNoCombobox(page: Page, rotulo: string, texto: RegExp, pesquisa?: string) {
  await page.getByRole('combobox', { name: rotulo }).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]').last();
  if (pesquisa) await popover.getByPlaceholder(/Pesquisar/).fill(pesquisa);
  const opcao = popover.getByRole('option', { name: texto });
  await expect(opcao).toBeVisible({ timeout: 15_000 });
  await opcao.click();
  await expect(page.getByRole('combobox', { name: rotulo })).toHaveText(texto);
}

test.describe(`/vendas/devolucoes e /vendas/trocas — ciclo de vida pela UI (#130, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await withPg(async (c) => {
      const linha = await escolherLinha(c);
      dados.linha = linha;
      dados.aProcessar = await inserirDevolucao(c, linha);
      dados.aRejeitar = await inserirDevolucao(c, linha);
      dados.aTrocar = await inserirDevolucao(c, linha);
    });
  });

  test('devolucoes-ecras-130: pendente → aprovar (AlertDialog) → processar (rota, localização obrigatória)', async ({ page }) => {
    test.setTimeout(180_000);
    const d = dados.aProcessar!;
    await abrirDetalhe(page, d);

    // PENDENTE: aprova-se ou rejeita-se; não se processa nem se troca.
    await expect(page.getByText('Pendente', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejeitar', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Processar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Criar Troca', exact: true })).toHaveCount(0);

    // Voltar atrás no AlertDialog não aprova.
    await page.getByRole('button', { name: 'Aprovar', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: /Voltar|Cancelar|Não/ }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect((await estado(d.id)).status).toBe('PENDENTE');

    await aprovar(page);
    expect(new URL(page.url()).pathname).toBe(d.caminho);
    expect((await estado(d.id)).status).toBe('APROVADA');
    await page.reload();
    await expect(page.getByText('Aprovada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rejeitar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Criar Troca', exact: true })).toBeVisible();

    // Processar é rota própria; a localização é obrigatória e o erro fica à vista.
    await page.getByRole('link', { name: 'Processar', exact: true }).click();
    await page.waitForURL(`**${d.caminho}/processar`, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: `Processar Devolução ${d.numero}` })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel(/^Série/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Processar Devolução' }).click();
    await expect(page.locator('[aria-invalid="true"], [role="alert"]').first()).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe(`${d.caminho}/processar`);
    expect((await estado(d.id)).status).toBe('APROVADA');

    await escolherNoCombobox(page, 'Localização *', /Armazém Principal/);
    await page.getByRole('button', { name: 'Processar Devolução' }).click();
    await page.waitForURL((url) => url.pathname === d.caminho, { timeout: 60_000 });
    await expect(page.getByText('Processada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const depois = await estado(d.id);
    expect(depois.status).toBe('PROCESSADA');
    expect(depois.notaCreditoId, 'processar com factura emite a nota de crédito').toBeTruthy();
    const mov = await withPg((c) =>
      c.query(
        `SELECT m.quantidade::text AS q, l.codigo FROM "MovimentoStock" m
           JOIN "Localizacao" l ON l.id = m."localizacaoDestinoId"
          WHERE m."documentoReferenciaId" = $1`,
        [d.id],
      ),
    );
    expect(mov.rows, 'uma entrada de stock no Armazém Principal').toHaveLength(1);
    expect(Number(mov.rows[0].q)).toBe(1);
    expect(mov.rows[0].codigo).toBe('LOC-001');

    await page.reload();
    await expect(page.getByText('Processada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
    await semAccoes(page);
  });

  test('devolucoes-ecras-130: pendente → rejeitar (AlertDialog) → sem acções e sem «Aprovada em»', async ({ page }) => {
    test.setTimeout(120_000);
    const d = dados.aRejeitar!;
    await abrirDetalhe(page, d);

    await page.getByRole('button', { name: 'Rejeitar', exact: true }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Rejeitar', exact: true }).click();

    await expect(page.getByText('Rejeitada', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    expect((await estado(d.id)).status).toBe('REJEITADA');

    await page.reload();
    await expect(page.getByRole('heading', { name: `Devolução ${d.numero}` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Rejeitada', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(ESTADO_EM_BRUTO)).toHaveCount(0);
    await expect(page.getByText(/Aprovada em/)).toHaveCount(0);
    await semAccoes(page);
    expect((await estado(d.id)).notaCreditoId).toBeNull();
  });

  test('devolucoes-ecras-130: aprovada com factura → «Criar Troca» → rota de nova troca → troca criada', async ({ page }) => {
    test.setTimeout(180_000);
    const d = dados.aTrocar!;
    const l = dados.linha!;

    // A listagem de trocas leva à rota de nova troca.
    await page.goto('/vendas/trocas');
    const novaTroca = page.getByRole('link', { name: /Nova Troca/ });
    await expect(novaTroca).toBeVisible({ timeout: 30_000 });
    await expect(novaTroca).toHaveAttribute('href', /^\/vendas\/trocas\/nova(\?|$)/);

    await abrirDetalhe(page, d);
    await aprovar(page);
    await page.reload();
    await expect(page.getByText('Aprovada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('link', { name: 'Criar Troca', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/vendas/trocas/nova', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Nova Troca' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(d.numero).first(), 'a devolução de origem está à vista').toBeVisible();

    await escolherNoCombobox(page, 'Produto *', new RegExp(l.sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), l.sku);
    await escolherNoCombobox(page, 'Localização *', /Armazém Principal/);
    await page.getByRole('button', { name: 'Criar Troca' }).click();

    await page.waitForURL((url) => url.pathname === '/vendas/trocas', { timeout: 60_000 });
    const troca = await withPg((c) =>
      c.query(
        `SELECT numero, diferenca::text AS diferenca, "vendaSubstituicaoId" FROM "Troca" WHERE "devolucaoId" = $1`,
        [d.id],
      ),
    );
    expect(troca.rows, 'uma troca ligada à devolução').toHaveLength(1);
    expect(troca.rows[0].numero).toMatch(/^TRC\/\d{4}\/\d{6}$/);
    expect(Number(troca.rows[0].diferenca), 'substituto de igual valor').toBe(0);
    await expect(page.getByText(troca.rows[0].numero).first()).toBeVisible({ timeout: 30_000 });

    const depois = await estado(d.id);
    expect(depois.status).toBe('PROCESSADA');
    expect(depois.notaCreditoId).toBeTruthy();

    await abrirDetalhe(page, d);
    await expect(page.getByText('Processada', { exact: true }).first()).toBeVisible();
    await semAccoes(page);
  });
});
