/**
 * Oráculo S2 (iteração 2, achado M1) — o POS ainda NÃO vende a crédito (ADR-0041; issues #306, #308)
 *
 * Até a S4 (#308) implementar o crédito (Factura, não Factura-Recibo; D 411; limite do
 * cliente), uma venda POS com QUALQUER pagamento CREDITO tem de ser recusada por
 * `vendaService.criar` com BusinessRuleError `PAGAMENTO_CREDITO_NAO_SUPORTADO` — e nada
 * pode ficar escrito: nem Venda, nem itens/pagamentos, nem Fatura/linhas, nem lançamento,
 * nem stock, nem caixa; as séries VENDA, FATURA_RECIBO e FATURA não avançam.
 *
 * Sem esta guarda, o caminho público (`criarVenda`) emitia uma Factura-Recibo PAGA por uma
 * venda que ninguém pagou — documento fiscal falso, irreversível.
 *
 * ESTE FICHEIRO É PROVISÓRIO: a S4 substitui-o pelo oráculo do crédito.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('Venda POS com pagamento CREDITO é recusada até à S4 — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-credito-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `cposcred${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let clienteId: string;

  // 1 × 1000 @16% → total 1160
  const itensMil = () => [
    { produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
  ];

  function inputVenda(pagamentos: unknown[], extra: Record<string, unknown> = {}) {
    return CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: itensMil(),
      pagamentos,
      ...extra,
    });
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function contagens() {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
    return {
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
      itensVenda: await db.itemVenda.count({ where: { tenantId: TENANT } }),
      pagamentosVenda: await db.pagamentoVenda.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      linhasFatura: await db.linhaFatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      saldo: String(s.saldo),
      creditoCliente: String((await db.cliente.findFirst({ where: { id: clienteId } })).creditoUtilizadoMT ?? '0'),
      serieVenda: await proximoNumeroDaSerie('VENDA'),
      serieFR: await proximoNumeroDaSerie('FATURA_RECIBO'),
      serieFatura: await proximoNumeroDaSerie('FATURA'),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS crédito', slug: `pos-credito-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pos-credito-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-credito-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-CRED-${sufixo}`,
        nome: 'Artigo de balcão',
        categoriaId: categoria.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 700,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    produtoId = produto.id;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-POS-CRED-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 1_000, saldoReservado: 0 },
    });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente a Crédito',
        tipo: 'JURIDICA',
        nuit: '400000308',
        email: `cliente-pos-cred-${sufixo}@test.mz`,
        telefone: '840000308',
        codigo: `CLI-POS-CRED-${sufixo}`,
        limiteCreditoMT: 100_000,
      },
    });
    clienteId = cliente.id;

    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  it('controlo: a mesma venda paga a DINHEIRO passa (o harness não recusa por outra razão)', async () => {
    const row: any = await noCtx(() => vendaService.criar(inputVenda([{ tipo: 'DINHEIRO', valor: 1160 }]), ctx));
    expect(row.id).toBeTruthy();
  });

  it.each([
    ['só CREDITO, cliente identificado', [{ tipo: 'CREDITO', valor: 1160 }], true],
    ['só CREDITO, venda anónima', [{ tipo: 'CREDITO', valor: 1160 }], false],
    ['misto DINHEIRO 160 + CREDITO 1000', [{ tipo: 'DINHEIRO', valor: 160 }, { tipo: 'CREDITO', valor: 1000 }], true],
  ])('%s → PAGAMENTO_CREDITO_NAO_SUPORTADO e nada é escrito (nem número gasto)', async (_nome, pagamentos, comCliente) => {
    const antes = await contagens();

    const erro = await capturarErro(() =>
      noCtx(() => vendaService.criar(inputVenda(pagamentos, comCliente ? { clienteId } : {}), ctx)),
    );

    expect(erro, 'a venda a crédito tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('PAGAMENTO_CREDITO_NAO_SUPORTADO');
    expect(await contagens()).toEqual(antes);
  });

  it('nenhuma Factura-Recibo do tenant tem um pagamento CREDITO na venda de origem', async () => {
    const vendasComCredito = await db.venda.findMany({
      where: { tenantId: TENANT, pagamentos: { some: { tipo: 'CREDITO' } } },
      select: { id: true },
    });
    expect(vendasComCredito).toHaveLength(0);
  });
});
