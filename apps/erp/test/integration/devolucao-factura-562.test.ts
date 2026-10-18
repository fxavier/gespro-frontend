/**
 * Oráculo #562 — a devolução fica ligada à factura de origem, com preços e taxas da factura, e o
 * reembolso só sai com nota de crédito.
 *
 * Antes: o ecrã criava a devolução sem `faturaId` e com o preço do catálogo (editável); o serviço
 * não derivava a factura da venda, `processar` não emitia NC (`return null`) e reembolsava
 * `valorTotal` na mesma — dinheiro fora da caixa sem documento fiscal.
 *
 * Contrato (`devolucaoService.criar`/`processar`/`linhasDevolviveis`):
 *   (a) com `vendaId` e sem `faturaId`, a devolução fica com o `faturaId` da venda; o
 *       `valorUnitario` e a `taxaIva` são os da `LinhaFatura` (preço líquido do desconto da
 *       linha); processar com reembolso emite a NC com esse preço e o reembolso é o total da NC;
 *   (b) `valorUnitario` diferente do facturado → `PRECO_DIFERENTE_DO_FACTURADO`; produto que não
 *       está na factura → `PRODUTO_NAO_FACTURADO`;
 *   (c) reembolso sem factura → `REEMBOLSO_SEM_DOCUMENTO`, ao criar e ao processar, sem
 *       `MovimentoCaixa`; sem factura e sem reembolso (só stock) continua permitido;
 *   (d) quantidade acima de facturado − já creditado → `QUANTIDADE_ACIMA_DO_FACTURADO`.
 *
 * Contra Postgres real (Testcontainers), harness de `devolucao-troca-documento.test.ts`.
 * Requer Docker; SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('Devolução ligada à factura, preço da factura e reembolso só com NC (#562)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');

  const sufixo = Date.now();
  const TENANT = `tenant-dev-fat-562-${sufixo}`;
  let produtoA: string;
  let produtoB: string;
  let localizacaoId: string;
  let ctx: Ctx;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let clienteId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  /** Venda POS de `quantidade` × A a 1000 com 10% de desconto + 16% (900 + 144 por unidade), a dinheiro. */
  async function venderA(quantidade: number) {
    return vender([[produtoA, quantidade]]);
  }

  /** Venda POS com uma linha por par [produto, quantidade], cada uma a 1000 − 10% + 16%. */
  async function vender(linhas: Array<[string, number] | [string, number, number]>) {
    // 1000 − desconto% (10% por omissão) + 16%, por unidade.
    const total = linhas.reduce((a, [, q, d = 10]) => a + (q * (100 - d) * 1160) / 100, 0);
    const input = validacoes.CreateVendaSchema.parse({
      origem: 'POS',
      clienteId,
      vendedorId: ctx.userId,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: linhas.map(([produtoId, quantidade, desconto = 10]) => ({
        produtoId, nomeProduto: 'Artigo', quantidade, precoUnitario: 1000, desconto, taxaIva: 0.16,
      })),
      pagamentos: [{ tipo: 'DINHEIRO', valor: total }],
    });
    const row: any = await runCtx(ctx, () => comercial.vendaService.criar(input, ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'pré-condição: venda POS com Factura-Recibo').toBeTruthy();
    const linha = await db.linhaFatura.findFirst({ where: { faturaId: venda.faturaId, tenantId: TENANT } });
    return { venda, linha };
  }

  function criar(input: Record<string, unknown>) {
    const parsed = validacoes.CreateDevolucaoSchema.parse({ clienteId, motivo: 'DEFEITO', ...input });
    return runCtx(ctx, () => comercial.devolucaoService.criar(parsed, ctx));
  }

  const item = (quantidade: number, valorUnitario: number, produtoId = produtoA) => ({
    produtoId,
    nomeProduto: 'Artigo',
    quantidade,
    valorUnitario,
    taxaIva: 0.16,
  });

  async function aprovarEProcessar(id: string, comCaixa: boolean) {
    await runCtx(ctx, () => comercial.devolucaoService.aprovar(id, ctx));
    return runCtx(ctx, () =>
      comercial.devolucaoService.processar(id, ctx, { localizacaoId, ...(comCaixa ? { sessaoCaixaId } : {}) }),
    );
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    comercial = await import('@/server/services/comercial');
    validacoes = await import('@/lib/validations/vendas');
    caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Devolução #562', slug: `dev-fat-562-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const userId = `cdevfat562${sufixo}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `dev-fat-562-${sufixo}@test.mz`, nome: 'Operador', keycloakSub: `kc-dev-fat-562-${sufixo}` },
    });
    ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 50000 }, ctx));
    sessaoCaixaId = sc.id;
    sessaoPOSId = (await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId, status: 'ABERTA' } })).id;

    const cliente = await db.cliente.create({
      data: { tenantId: TENANT, codigo: `CLI-562-${sufixo}`, nome: 'Cliente 562', tipo: 'FISICA', nuit: '400000562', email: 'cli562@test.mz', telefone: '840000562' },
    });
    clienteId = cliente.id;

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    localizacaoId = (
      await db.localizacao.create({ data: { tenantId: TENANT, codigo: `ARM-562-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true } })
    ).id;
    for (const [sku, nome] of [
      [`SKU-562-A-${sufixo}`, 'Artigo A'],
      [`SKU-562-B-${sufixo}`, 'Artigo B'],
    ] as const) {
      const p = await db.produto.create({
        data: { tenantId: TENANT, sku, nome, categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: 1500, precoCompra: 700, margemLucro: 0.3, taxaIva: 0.16 },
      });
      await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: p.id, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });
      if (sku.includes('-A-')) produtoA = p.id;
      else produtoB = p.id;
    }
  });

  it('(a) da venda sem faturaId: fica com a factura da venda, preço e taxa da LinhaFatura; reembolso pela NC com esse preço', async () => {
    const { venda, linha } = await venderA(2);
    const precoFacturado = dec(linha.subtotal).div(dec(linha.quantidade)); // 900, líquido do desconto

    const devolviveis: any = await runCtx(ctx, () => comercial.devolucaoService.linhasDevolviveis(venda.id, ctx));
    expect(devolviveis.faturaId).toBe(venda.faturaId);
    expect(devolviveis.linhas).toHaveLength(1);
    expect(devolviveis.linhas[0]).toMatchObject({ produtoId: produtoA, quantidadeDevolvivel: '2' });
    expect(dec(devolviveis.linhas[0].valorUnitario).toFixed(2)).toBe(precoFacturado.toFixed(2));

    const dev: any = await criar({ vendaId: venda.id, reembolso: true, itens: [item(1, 900)] });
    const gravada = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT }, include: { itens: true } });
    expect(gravada.faturaId, 'a factura deriva da venda').toBe(venda.faturaId);
    expect(dec(gravada.itens[0].valorUnitario).toFixed(2)).toBe('900.00');
    expect(dec(gravada.itens[0].taxaIva).toFixed(2)).toBe(dec(linha.taxaIva).toFixed(2));
    expect(dec(gravada.valorTotal).toFixed(2)).toBe('1044.00');

    await aprovarEProcessar(dev.id, true);

    const depois = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(depois.status).toBe('PROCESSADA');
    const nc = await db.notaCredito.findFirst({ where: { id: depois.notaCreditoId, tenantId: TENANT }, include: { linhas: true } });
    expect(nc, 'processar com reembolso emite NC').toBeTruthy();
    expect(nc.faturaOriginalId).toBe(venda.faturaId);
    expect(dec(nc.linhas[0].precoUnitario).toFixed(2)).toBe(precoFacturado.toFixed(2));
    expect(dec(nc.total).toFixed(2)).toBe('1044.00');
    expect(nc.status, 'reembolso liquida a NC').toBe('LIQUIDADA');
    const reembolsos = await db.movimentoCaixa.findMany({ where: { tenantId: TENANT, tipo: 'DEVOLUCAO', documentoOrigemId: dev.id } });
    expect(reembolsos).toHaveLength(1);
    expect(dec(reembolsos[0].valor).toFixed(2)).toBe(dec(nc.total).toFixed(2));

    const resto: any = await runCtx(ctx, () => comercial.devolucaoService.linhasDevolviveis(venda.id, ctx));
    expect(resto.linhas[0].quantidadeDevolvivel, 'facturado − creditado').toBe('1');
  });

  it('(b) valorUnitario diferente do facturado → PRECO_DIFERENTE_DO_FACTURADO; produto fora da factura → PRODUTO_NAO_FACTURADO', async () => {
    const { venda } = await venderA(1);
    const antes = await db.devolucao.count({ where: { tenantId: TENANT } });

    const preco = await capturarErro(() => criar({ vendaId: venda.id, itens: [item(1, 1000)] }));
    expect(preco?.code).toBe('PRECO_DIFERENTE_DO_FACTURADO');

    const produto = await capturarErro(() => criar({ vendaId: venda.id, itens: [item(1, 900, produtoB)] }));
    expect(produto?.code).toBe('PRODUTO_NAO_FACTURADO');

    expect(await db.devolucao.count({ where: { tenantId: TENANT } })).toBe(antes);
  });

  it('(c) reembolso sem factura → REEMBOLSO_SEM_DOCUMENTO ao criar e ao processar, sem MovimentoCaixa; sem reembolso continua permitido', async () => {
    const recusa = await capturarErro(() => criar({ reembolso: true, itens: [item(1, 150)] }));
    expect(recusa?.code).toBe('REEMBOLSO_SEM_DOCUMENTO');

    // Resíduo anterior à correcção: devolução sem factura com reembolso, já APROVADA.
    const legado = await db.devolucao.create({
      data: {
        tenantId: TENANT,
        numero: `NDV-LEGADO-562-${sufixo}`,
        clienteId,
        motivo: 'DEFEITO',
        status: 'APROVADA',
        reembolso: true,
        valorTotal: 174,
        itens: {
          create: [{ tenantId: TENANT, produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, valorUnitario: 150, taxaIva: 0.16, subtotal: 150, ivaItem: 24, total: 174 }],
        },
      },
    });
    const movAntes = await db.movimentoCaixa.count({ where: { tenantId: TENANT } });
    const erro = await capturarErro(() =>
      runCtx(ctx, () => comercial.devolucaoService.processar(legado.id, ctx, { localizacaoId, sessaoCaixaId })),
    );
    expect(erro?.code).toBe('REEMBOLSO_SEM_DOCUMENTO');
    expect(await db.movimentoCaixa.count({ where: { tenantId: TENANT } })).toBe(movAntes);
    expect((await db.devolucao.findFirst({ where: { id: legado.id } })).status).toBe('APROVADA');

    // Sem factura e sem reembolso: só reentrada de stock (venda anterior ao ADR-0041).
    const soStock: any = await criar({ reembolso: false, itens: [item(1, 150)] });
    await aprovarEProcessar(soStock.id, true);
    const processada = await db.devolucao.findFirst({ where: { id: soStock.id } });
    expect(processada.status).toBe('PROCESSADA');
    expect(processada.notaCreditoId).toBeNull();
    expect(await db.movimentoCaixa.count({ where: { tenantId: TENANT } })).toBe(movAntes);
  });

  it('(d) quantidade acima de facturado − já creditado → QUANTIDADE_ACIMA_DO_FACTURADO', async () => {
    const { venda } = await venderA(2);

    const acima = await capturarErro(() => criar({ vendaId: venda.id, itens: [item(3, 900)] }));
    expect(acima?.code).toBe('QUANTIDADE_ACIMA_DO_FACTURADO');

    const primeira: any = await criar({ vendaId: venda.id, itens: [item(1, 900)] });
    await aprovarEProcessar(primeira.id, false);

    const depoisDaNC = await capturarErro(() => criar({ vendaId: venda.id, itens: [item(2, 900)] }));
    expect(depoisDaNC?.code).toBe('QUANTIDADE_ACIMA_DO_FACTURADO');

    const resto: any = await criar({ vendaId: venda.id, itens: [item(1, 900)] });
    expect(resto.faturaId).toBe(venda.faturaId);
  });

  it('(e) duas devoluções de A×1 criadas antes de qualquer NC (factura A×1 + B×1): a segunda a processar → QUANTIDADE_ACIMA_DO_FACTURADO, sem segunda NC nem stock', async () => {
    const { venda } = await vender([[produtoA, 1], [produtoB, 1]]);
    const d1: any = await criar({ vendaId: venda.id, itens: [item(1, 900)] });
    const d2: any = await criar({ vendaId: venda.id, itens: [item(1, 900)] });
    await aprovarEProcessar(d1.id, false);
    await runCtx(ctx, () => comercial.devolucaoService.aprovar(d2.id, ctx));
    const stockAntes = await db.movimentoStock.count({ where: { tenantId: TENANT, documentoReferenciaId: d2.id } });

    const erro = await capturarErro(() => runCtx(ctx, () => comercial.devolucaoService.processar(d2.id, ctx, { localizacaoId })));
    expect(erro?.code).toBe('QUANTIDADE_ACIMA_DO_FACTURADO');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
    expect(await db.movimentoStock.count({ where: { tenantId: TENANT, documentoReferenciaId: d2.id } })).toBe(stockAntes);
    expect((await db.devolucao.findFirst({ where: { id: d2.id } })).status).toBe('APROVADA');
  });

  it('(f) factura com duas linhas do mesmo produto ao mesmo preço: devolver a soma passa; acima dela é recusado', async () => {
    const { venda } = await vender([[produtoA, 1], [produtoA, 1]]);

    const devolviveis: any = await runCtx(ctx, () => comercial.devolucaoService.linhasDevolviveis(venda.id, ctx));
    expect(devolviveis.linhas).toHaveLength(1);
    expect(devolviveis.linhas[0].quantidadeDevolvivel).toBe('2');

    const acima = await capturarErro(() => criar({ vendaId: venda.id, itens: [item(3, 900)] }));
    expect(acima?.code).toBe('QUANTIDADE_ACIMA_DO_FACTURADO');

    const soma: any = await criar({ vendaId: venda.id, itens: [item(2, 900)] });
    expect(dec(soma.valorTotal).toFixed(2)).toBe('2088.00');
    await aprovarEProcessar(soma.id, false);
    const nc = await db.notaCredito.findFirst({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } });
    expect(dec(nc.total).toFixed(2)).toBe('2088.00');
  });

  it('(g) factura A@900 + A@1000 + B@1000: creditar A@1000 deixa A@900 devolvível e recusa uma segunda A@1000', async () => {
    const { venda } = await vender([[produtoA, 1, 10], [produtoA, 1, 0], [produtoB, 1, 0]]);
    const primeira: any = await criar({ vendaId: venda.id, itens: [item(1, 1000)] });
    await aprovarEProcessar(primeira.id, false);

    const devolviveis: any = await runCtx(ctx, () => comercial.devolucaoService.linhasDevolviveis(venda.id, ctx));
    const deA = Object.fromEntries(
      devolviveis.linhas.filter((l: any) => l.produtoId === produtoA).map((l: any) => [dec(l.valorUnitario).toFixed(2), l.quantidadeDevolvivel]),
    );
    expect(deA).toEqual({ '900.00': '1', '1000.00': '0' });

    const segunda = await capturarErro(() => criar({ vendaId: venda.id, itens: [item(1, 1000)] }));
    expect(segunda?.code).toBe('QUANTIDADE_ACIMA_DO_FACTURADO');

    const a900: any = await criar({ vendaId: venda.id, itens: [item(1, 900)] });
    expect(a900.faturaId).toBe(venda.faturaId);
  });

  it('(h) NC manual sem produto a consumir o valor da factura → processar recusa NC_EXCEDE_FATURA, sem segunda NC', async () => {
    const faturacao = await import('@/server/services/financas/faturacao.service');
    const { venda } = await venderA(1);
    const dev: any = await criar({ vendaId: venda.id, itens: [item(1, 900)] });
    await runCtx(ctx, () =>
      faturacao.emitirNotaCredito(
        {
          faturaOriginalId: venda.faturaId,
          motivo: 'Acerto em Facturação',
          moeda: 'MZN',
          dataEmissao: new Date(),
          linhas: [{ descricao: 'Acerto', quantidade: 1, precoUnitario: 900, desconto: 0, taxaIva: 0.16, subtotal: 900, ivaItem: 144, total: 1044, ordemLinha: 1 }],
        } as any,
        ctx,
      ),
    );

    const erro = await capturarErro(() => aprovarEProcessar(dev.id, false));
    expect(erro?.code).toBe('NC_EXCEDE_FATURA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
    expect((await db.devolucao.findFirst({ where: { id: dev.id } })).status).toBe('APROVADA');
  });
});
