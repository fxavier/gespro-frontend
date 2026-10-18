/**
 * Oráculo E2E devolucoes-ecras-130 — criar (pelo ecrã), aprovar, rejeitar e processar devoluções
 * e criar trocas a partir da UI (#130, revisto pela #562).
 *
 * As actions `aprovarDevolucao`, `rejeitarDevolucao`, `processarDevolucao` (NC + liquidação +
 * stock) e `criarTroca` (NC + Factura-Recibo) existiam sem ecrã: o detalhe de
 * `/vendas/devolucoes/[id]` só mostrava o estado, e uma devolução criada pela UI ficava PENDENTE
 * para sempre. `/vendas/trocas` mandava «Nova Troca» para a listagem de devoluções.
 *
 * #562: as devoluções eram escritas aqui por SQL já com `faturaId`, o que escondia que o ecrã
 * nunca a enviava (reembolso sem NC, preço do catálogo). Agora nascem em `/vendas/devolucoes/nova`:
 *   - sem venda escolhida, «Reembolso ao cliente» está desactivado (sem factura não há NC);
 *   - ao escolher a venda, os itens vêm da sua factura («Factura de origem: <número>»), com preço e
 *     taxa só de leitura (não há campo «Valor Unit. (MT)»); o operador tira as linhas que não
 *     devolve («Não devolver …») e escolhe a quantidade;
 *   - a devolução gravada tem o `faturaId` da venda e o preço da linha da factura;
 *   - a processada com reembolso emite a NC com o preço da linha da factura e o reembolso sai pela
 *     NC: `MovimentoCaixa` DEVOLUCAO = total da NC, NC LIQUIDADA.
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
 * Dados (prefixo único `devolucoes-ecras-130`): no tenant `demo`, uma venda do seed com cliente
 * identificado e factura, e nela uma linha (produto único na factura, preço = preço de venda, sem
 * desconto, ≥ 3 unidades por creditar). Cada teste cria pelo ecrã uma devolução de 1 unidade
 * dessa linha, com `observacoes` = marca + corrida. Cada corrida deixa no `demo` (append-only, não
 * se apaga): três devoluções (PROCESSADA, REJEITADA, PROCESSADA pela troca), duas NC (uma LIQUIDADA
 * pelo reembolso, com o seu lançamento e um `MovimentoCaixa` DEVOLUCAO na sessão de caixa aberta
 * do admin — aberta pelo ecrã se não houver, e deixada aberta), uma troca com a sua venda e
 * Factura-Recibo e uma entrada de stock por cada processamento/troca no Armazém Principal (LOC-001).
 *
 * Correr (não corre no nó do verificador):
 *   BASE_URL=http://localhost:3000 npx playwright test e2e/48-devolucoes-ecras-130.spec.ts --project=e2e
 * Depois: git checkout -- apps/erp/playwright/.auth/admin.json
 *
 * Escrito pelo verificador do nó B:devolucoes-ecras-130; revisto na #562 por ordem do orquestrador
 * (criação pelo ecrã em vez de SQL).
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { Client } from 'pg';

const MARCA = 'devolucoes-ecras-130';
const CORRIDA = randomBytes(4).toString('hex');
const ESTADO_EM_BRUTO = /\b(PENDENTE|APROVADA|PROCESSADA|REJEITADA)\b/;
const ADMIN = 'admin@demo.mz';

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

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Linha = {
  tenantId: string;
  vendaNumero: string;
  faturaId: string;
  faturaNumero: string;
  cliente: string;
  produtoId: string;
  descricao: string;
  sku: string;
  preco: string;
  taxa: string;
};

type Devolucao = { id: string; numero: string; caminho: string };

const dados: { linha?: Linha } = {};

async function escolherLinha(c: Client): Promise<Linha> {
  const t = await c.query<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug = 'demo' LIMIT 1`);
  if (!t.rows[0]) throw new Error('STOP: tenant demo não encontrado');
  const tenantId = t.rows[0].id;
  // Venda facturada de um cliente identificado (procura-se no ecrã pelo cliente e pelo número);
  // linha com preço = preço de venda (o substituto de igual valor sai do preço de venda), produto
  // único na factura e ≥ 3 unidades por creditar (três devoluções de 1 unidade por corrida). Sem
  // devoluções pendentes na factura, que gastariam o crédito antes destas.
  const creditado = `COALESCE((SELECT SUM(nc.total) FROM "NotaCredito" nc
                                WHERE nc."faturaOriginalId" = f.id AND nc.status <> 'CANCELADA'), 0)`;
  const r = await c.query<Linha>(
    `SELECT f."tenantId", v.numero AS "vendaNumero", f.id AS "faturaId", f.numero AS "faturaNumero",
            cl.nome AS cliente, l."produtoId", l.descricao, p.sku,
            l."precoUnitario"::text AS preco, l."taxaIva"::text AS taxa
       FROM "Venda" v
       JOIN "Fatura" f ON f.id = v."faturaId" AND f."tenantId" = v."tenantId"
       JOIN "Cliente" cl ON cl.id = v."clienteId" AND cl.id = f."clienteId"
       JOIN "LinhaFatura" l ON l."faturaId" = f.id
       JOIN "Produto" p ON p.id = l."produtoId" AND p."tenantId" = f."tenantId"
      WHERE v."tenantId" = $1
        AND v.status IN ('CONCLUIDA', 'FATURADA')
        AND cl.codigo <> 'CF-000000' AND cl."deletedAt" IS NULL AND cl.status = 'ATIVO'
        AND f.status IN ('EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA')
        AND l.desconto = 0
        AND l."precoUnitario" = p."precoVenda" AND l."taxaIva" = p."taxaIva"
        AND p."deletedAt" IS NULL AND p.ativo = true
        AND (SELECT COUNT(*) FROM "LinhaFatura" o WHERE o."faturaId" = f.id AND o."produtoId" = l."produtoId") = 1
        AND l.quantidade - COALESCE((SELECT SUM(ln.quantidade) FROM "LinhaNotaCredito" ln
                                       JOIN "NotaCredito" nc ON nc.id = ln."notaCreditoId"
                                      WHERE nc."faturaOriginalId" = f.id AND nc.status <> 'CANCELADA'
                                        AND ln."produtoId" = l."produtoId"), 0) >= 3
        AND f.total - ${creditado} >= 3 * l."precoUnitario" * (1 + l."taxaIva")
        AND NOT EXISTS (SELECT 1 FROM "Devolucao" d
                         WHERE d."faturaId" = f.id AND d.status IN ('PENDENTE', 'APROVADA'))
      ORDER BY v."dataVenda" DESC
      LIMIT 1`,
    [tenantId],
  );
  if (!r.rows[0]) throw new Error('STOP: nenhuma venda facturada do demo serve (pnpm db:seed)');
  return r.rows[0];
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
  if (pesquisa) await popover.locator('input').first().fill(pesquisa);
  const opcao = popover.getByRole('option', { name: texto });
  await expect(opcao).toBeVisible({ timeout: 15_000 });
  await opcao.click();
  await expect(page.getByRole('combobox', { name: rotulo })).toHaveText(texto);
}

/** A sessão de caixa ABERTA do admin (para o reembolso); abre-a pelo ecrã se não houver. */
async function garantirCaixaAberta(page: Page): Promise<string> {
  const aberta = () =>
    withPg(async (c) => {
      const r = await c.query<{ id: string }>(
        `SELECT s.id FROM "SessaoCaixa" s
           JOIN "User" u ON u.id = s."responsavelId" AND u."tenantId" = s."tenantId"
          WHERE u.email = $1 AND s.status = 'ABERTA'`,
        [ADMIN],
      );
      return r.rows[0]?.id ?? null;
    });
  let id = await aberta();
  if (!id) {
    await page.goto('/caixa/abertura');
    await expect(page.getByRole('heading', { name: 'Abertura de Caixa' })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    const caixas = page.locator('[role="checkbox"]');
    const n = await caixas.count();
    for (let i = 0; i < n; i++) await caixas.nth(i).click();
    await page.getByRole('button', { name: 'Prosseguir' }).click();
    await expect(page.getByText('Dados da Abertura')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel(/Fundo Inicial/i).fill('1000');
    await page.getByRole('button', { name: 'Confirmar Abertura' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/caixa') && !u.pathname.includes('/abertura'), {
      timeout: 30_000,
    });
    id = await aberta();
  }
  expect(id, `a sessão de caixa de ${ADMIN} tem de estar ABERTA`).toBeTruthy();
  return id!;
}

/**
 * Nova devolução pelo ecrã (#562): cliente → venda → itens da factura; fica só a linha escolhida,
 * com 1 unidade. Devolve a devolução gravada (lida pela marca da corrida).
 */
async function criarPeloEcra(page: Page, l: Linha, tag: string, reembolso: boolean): Promise<Devolucao> {
  const marca = `${MARCA} ${CORRIDA} ${tag}`;
  await page.goto('/vendas/devolucoes/nova');
  await expect(page.getByRole('heading', { name: 'Nova Devolução' })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  // Sem venda (logo sem factura) não há reembolso.
  await expect(page.getByLabel('Reembolso ao cliente')).toBeDisabled();

  await escolherNoCombobox(page, 'Cliente *', new RegExp(escapar(l.cliente)), l.cliente);
  await escolherNoCombobox(page, 'Venda (opcional)', new RegExp(escapar(l.vendaNumero)), l.vendaNumero);
  await expect(page.getByText(`Factura de origem: ${l.faturaNumero}`)).toBeVisible({ timeout: 15_000 });
  // Preço e taxa vêm da factura: não há campo de preço para editar.
  await expect(page.getByLabel('Valor Unit. (MT)')).toHaveCount(0);

  // Fica só a linha escolhida.
  for (;;) {
    const tirar = page.getByRole('button', { name: /^Não devolver / });
    const n = await tirar.count();
    let tirou = false;
    for (let i = 0; i < n; i++) {
      if ((await tirar.nth(i).getAttribute('aria-label')) !== `Não devolver ${l.descricao}`) {
        await tirar.nth(i).click();
        tirou = true;
        break;
      }
    }
    if (!tirou) break;
  }
  await expect(page.getByText(l.descricao, { exact: true })).toHaveCount(1);
  await page.locator('#itens-0-quantidade').fill('1');
  if (reembolso) await page.getByLabel('Reembolso ao cliente').check();
  await page.locator('#observacoes').fill(marca);

  await page.getByRole('button', { name: 'Registar Devolução' }).click();
  await page.waitForURL((u) => u.pathname === '/vendas/devolucoes', { timeout: 60_000 });

  const r = await withPg((c) =>
    c.query<{ id: string; numero: string; faturaId: string | null; reembolso: boolean; valorUnitario: string; taxaIva: string }>(
      `SELECT d.id, d.numero, d."faturaId", d.reembolso, i."valorUnitario"::text AS "valorUnitario", i."taxaIva"::text AS "taxaIva"
         FROM "Devolucao" d JOIN "ItemDevolucao" i ON i."devolucaoId" = d.id
        WHERE d."tenantId" = $1 AND d.observacoes = $2`,
      [l.tenantId, marca],
    ),
  );
  expect(r.rows, 'uma devolução com um item, criada pelo ecrã').toHaveLength(1);
  const d = r.rows[0];
  expect(d.faturaId, 'a devolução fica ligada à factura da venda').toBe(l.faturaId);
  expect(Number(d.valorUnitario), 'preço da linha da factura').toBe(Number(l.preco));
  expect(Number(d.taxaIva), 'taxa da linha da factura').toBe(Number(l.taxa));
  expect(d.reembolso).toBe(reembolso);
  return { id: d.id, numero: d.numero, caminho: `/vendas/devolucoes/${d.id}` };
}

test.describe(`/vendas/devolucoes e /vendas/trocas — ciclo de vida pela UI (#130, #562, ${MARCA})`, () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    dados.linha = await withPg(escolherLinha);
  });

  test('devolucoes-ecras-130: criar pelo ecrã com reembolso → aprovar (AlertDialog) → processar (rota, localização obrigatória) → NC com o preço da factura paga o reembolso', async ({ page }) => {
    test.setTimeout(240_000);
    const l = dados.linha!;
    await garantirCaixaAberta(page);
    const d = await criarPeloEcra(page, l, 'processar', true);
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

    // #562: a NC tem o preço da linha da factura e o reembolso sai por ela (total da NC, NC liquidada).
    const doc = await withPg((c) =>
      c.query(
        `SELECT nc."faturaOriginalId", nc.status::text AS status, nc.total::text AS total,
                ln."precoUnitario"::text AS preco, ln."produtoId"
           FROM "NotaCredito" nc JOIN "LinhaNotaCredito" ln ON ln."notaCreditoId" = nc.id
          WHERE nc.id = $1`,
        [depois.notaCreditoId],
      ),
    );
    expect(doc.rows, 'NC de uma linha').toHaveLength(1);
    expect(doc.rows[0].faturaOriginalId).toBe(l.faturaId);
    expect(doc.rows[0].produtoId).toBe(l.produtoId);
    expect(Number(doc.rows[0].preco), 'NC com o preço da linha da factura').toBe(Number(l.preco));
    expect(doc.rows[0].status, 'o reembolso liquida a NC').toBe('LIQUIDADA');
    const reembolso = await withPg((c) =>
      c.query(
        `SELECT valor::text AS valor FROM "MovimentoCaixa" WHERE tipo = 'DEVOLUCAO' AND "documentoOrigemId" = $1`,
        [d.id],
      ),
    );
    expect(reembolso.rows, 'um reembolso na caixa').toHaveLength(1);
    expect(Number(reembolso.rows[0].valor), 'o reembolso é o total da NC').toBe(Number(doc.rows[0].total));
  });

  test('devolucoes-ecras-130: pendente → rejeitar (AlertDialog) → sem acções e sem «Aprovada em»', async ({ page }) => {
    test.setTimeout(180_000);
    const d = await criarPeloEcra(page, dados.linha!, 'rejeitar', false);
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
    test.setTimeout(240_000);
    const l = dados.linha!;
    const d = await criarPeloEcra(page, l, 'trocar', false);

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
