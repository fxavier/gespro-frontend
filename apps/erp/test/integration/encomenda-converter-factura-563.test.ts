/**
 * Oráculo #563 — converter uma encomenda em venda emite o documento fiscal pela via do POS
 * (ADR-0041): `emitirDocumentoEmTx`, nunca um lançamento solto com origem na Venda.
 *
 * Contrato:
 *   1. Converter a crédito cria exactamente UMA `Fatura` (série FATURA) com `vendaId` = a venda;
 *      `Venda.faturaId` aponta para ela e `Fatura.lancamentoId` está preenchido (D 411 / C 711 /
 *      C 44331 pelo total). Nenhum `Lancamento` com `documentoOrigemTipo 'Venda'` aparece.
 *   2. Converter pago por inteiro (meio que não é CREDITO) emite Factura-Recibo, PAGA.
 *   3. Pagamentos cuja soma não dá o total → `PAGAMENTOS_NAO_BATEM_TOTAL`, e nada é escrito:
 *      a encomenda continua CONFIRMADA com as reservas ATIVAS, sem venda nem factura.
 *   4. E-mail por confirmar → `EMAIL_POR_CONFIRMAR_EMISSAO`, e nada é escrito.
 *   5. A crédito contra o Consumidor Final → `CLIENTE_OBRIGATORIO_CREDITO`, e nada é escrito.
 *
 * `auth()` é fronteira: duplo mutável (vi.hoisted), e-mail confirmado por omissão.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: { user: { emailVerificado: true } } as unknown,
}));

vi.mock('@/lib/auth', () => ({ auth: async () => h.sessao }));

const QTD = 2;

describe.skipIf(skip)('encomenda: converter em venda emite o documento fiscal (#563)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let encomendaService: any;
  let CreateEncomendaSchema: (typeof import('@/lib/validations/vendas'))['CreateEncomendaSchema'];
  let bootstrap: unknown;

  const sufixo = Date.now();
  const TENANT = `tenant-enc-fat-563-${sufixo}`;
  const USER = `cuencfat563${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;

  const fx = (v: unknown) => Number(String(v)).toFixed(2);

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  /** Encomenda CONFIRMADA pelo caminho real: QTD × 1000, IVA 16% → total 2320,00. */
  async function encomendaConfirmada(cli = clienteId) {
    const input = CreateEncomendaSchema.parse({
      clienteId: cli,
      itens: [{ produtoId, nomeProduto: 'Artigo', quantidade: QTD, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
    });
    const row: any = await runCtx(ctx, () => encomendaService.criar(input, ctx));
    await runCtx(ctx, () =>
      encomendaService.transitar({ encomendaId: row.id, paraStatus: 'CONFIRMADA', localizacaoId }, ctx),
    );
    const enc = await db.encomenda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(enc.status, 'fixture: encomenda confirmada').toBe('CONFIRMADA');
    expect(fx(enc.total), 'fixture: 2 × 1000 + 16%').toBe('2320.00');
    return enc;
  }

  function converter(id: string, pagamentos: Array<{ tipo: string; valor: number }>) {
    return runCtx(ctx, () => encomendaService.converterEmVenda(id, pagamentos, ctx, {}));
  }

  async function lancamentosComOrigemVenda() {
    return db.lancamento.count({ where: { tenantId: TENANT, documentoOrigemTipo: 'Venda' } });
  }

  async function resumoPartidas(lancamentoId: string) {
    const partidas = await db.partidaLancamento.findMany({ where: { lancamentoId } });
    const contas = await db.contaPGC.findMany({
      where: { tenantId: TENANT, id: { in: partidas.map((p: any) => p.contaId) } },
      select: { id: true, codigo: true },
    });
    const codigoDe = new Map(contas.map((c: any) => [c.id, c.codigo]));
    return partidas.map((p: any) => `${p.tipo}|${codigoDe.get(p.contaId)}|${fx(p.valor)}`).sort();
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ encomendaService } = (await import('@/server/services/comercial')) as any);
    ({ CreateEncomendaSchema } = await import('@/lib/validations/vendas'));
    ({ bootstrapContabilidade: bootstrap } = await import('@/server/provisioning/tenant-bootstrap'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant encomenda factura #563', slug: `enc-fat-563-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.user.create({
      data: {
        id: USER,
        tenantId: TENANT,
        email: `enc-fat-563-${sufixo}@test.mz`,
        nome: 'Vendedor 563',
        keycloakSub: `kc-enc-fat-563-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => (bootstrap as any)(tx, TENANT), { timeout: 60_000 });

    const cat = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-ENC-FAT-563-${sufixo}`,
        nome: 'Artigo 563',
        categoriaId: cat.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 500,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-ENC-FAT-563-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId: produto.id, varianteProdutoId: '', localizacaoId: loc.id, saldo: 10_000, saldoReservado: 0 },
    });
    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente 563',
        tipo: 'JURIDICA',
        nuit: '400005631',
        email: `cli-enc-fat-563-${sufixo}@test.mz`,
        telefone: '840005631',
        codigo: `CLI-ENC-FAT-563-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 1_000_000,
      },
    });
    produtoId = produto.id;
    localizacaoId = loc.id;
    clienteId = cliente.id;
  }, 120_000);

  it('1: converter a crédito cria UMA Factura ligada à venda, com lançamento de emissão, e nenhum lançamento de origem Venda', async () => {
    const enc = await encomendaConfirmada();
    const origemVendaAntes = await lancamentosComOrigemVenda();

    const r: any = await converter(enc.id, [{ tipo: 'CREDITO', valor: 2320 }]);

    const faturas = await db.fatura.findMany({
      where: { tenantId: TENANT, vendaId: r.vendaId },
      include: { serieDocumento: { select: { tipo: true } } },
    });
    expect(faturas, 'uma factura pela venda').toHaveLength(1);
    const fatura = faturas[0];
    expect(fatura.serieDocumento.tipo).toBe('FATURA');
    expect(fatura.status).toBe('EMITIDA');
    expect(fx(fatura.total)).toBe('2320.00');
    expect(fatura.lancamentoId, 'Fatura.lancamentoId preenchido').toBeTruthy();

    const venda = await db.venda.findFirst({ where: { id: r.vendaId, tenantId: TENANT } });
    expect(venda.faturaId, 'Venda.faturaId aponta para a factura').toBe(fatura.id);

    expect(await resumoPartidas(fatura.lancamentoId)).toEqual([
      'CREDITO|44331|320.00',
      'CREDITO|711|2000.00',
      'DEBITO|411|2320.00',
    ]);
    expect(await lancamentosComOrigemVenda(), 'nenhum lançamento novo com origem Venda').toBe(origemVendaAntes);
  });

  it('2: converter pago por inteiro emite Factura-Recibo PAGA', async () => {
    const enc = await encomendaConfirmada();

    const r: any = await converter(enc.id, [{ tipo: 'TRANSFERENCIA', valor: 2320 }]);

    const faturas = await db.fatura.findMany({
      where: { tenantId: TENANT, vendaId: r.vendaId },
      include: { serieDocumento: { select: { tipo: true } } },
    });
    expect(faturas).toHaveLength(1);
    expect(faturas[0].serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(faturas[0].status).toBe('PAGA');
    expect(faturas[0].lancamentoId).toBeTruthy();
    const venda = await db.venda.findFirst({ where: { id: r.vendaId, tenantId: TENANT } });
    expect(venda.faturaId).toBe(faturas[0].id);
  });

  it('3: pagamentos que não somam o total → PAGAMENTOS_NAO_BATEM_TOTAL e nada é escrito', async () => {
    const enc = await encomendaConfirmada();
    const vendasAntes = await db.venda.count({ where: { tenantId: TENANT } });
    const faturasAntes = await db.fatura.count({ where: { tenantId: TENANT } });
    const lancsAntes = await db.lancamento.count({ where: { tenantId: TENANT } });

    const erro = await capturarErro(() => converter(enc.id, [{ tipo: 'CREDITO', valor: 2000 }]));
    expect(erro, 'conversão com pagamentos desalinhados tinha de ser recusada').toBeDefined();
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'PAGAMENTOS_NAO_BATEM_TOTAL' });

    const depois = await db.encomenda.findFirst({ where: { id: enc.id, tenantId: TENANT } });
    expect(depois.status).toBe('CONFIRMADA');
    expect(depois.vendaId).toBeNull();
    const reservas = await db.reservaStock.findMany({ where: { tenantId: TENANT, documentoReferenciaId: enc.id } });
    expect(reservas.map((x: any) => x.status)).toEqual(['ATIVA']);
    expect(await db.venda.count({ where: { tenantId: TENANT } })).toBe(vendasAntes);
    expect(await db.fatura.count({ where: { tenantId: TENANT } })).toBe(faturasAntes);
    expect(await db.lancamento.count({ where: { tenantId: TENANT } })).toBe(lancsAntes);
  });

  async function contagens() {
    return {
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
    };
  }

  async function esperarNadaEscrito(encId: string, antes: Awaited<ReturnType<typeof contagens>>) {
    const depois = await db.encomenda.findFirst({ where: { id: encId, tenantId: TENANT } });
    expect(depois.status).toBe('CONFIRMADA');
    expect(depois.vendaId).toBeNull();
    const reservas = await db.reservaStock.findMany({ where: { tenantId: TENANT, documentoReferenciaId: encId } });
    expect(reservas.map((x: any) => x.status)).toEqual(['ATIVA']);
    expect(await contagens()).toEqual(antes);
  }

  afterEach(() => {
    h.sessao = { user: { emailVerificado: true } };
  });

  it('4: e-mail por confirmar → EMAIL_POR_CONFIRMAR_EMISSAO e nada é escrito', async () => {
    const enc = await encomendaConfirmada();
    const antes = await contagens();
    h.sessao = { user: { emailVerificado: false } };

    const erro = await capturarErro(() => converter(enc.id, [{ tipo: 'CREDITO', valor: 2320 }]));
    expect(erro).toMatchObject({ code: 'EMAIL_POR_CONFIRMAR_EMISSAO' });

    await esperarNadaEscrito(enc.id, antes);
  });

  it('5: a crédito contra o Consumidor Final → CLIENTE_OBRIGATORIO_CREDITO e nada é escrito', async () => {
    const cf = await db.cliente.findFirst({ where: { tenantId: TENANT, codigo: 'CF-000000' } });
    expect(cf, 'fixture: Consumidor Final do bootstrap').toBeTruthy();
    const enc = await encomendaConfirmada(cf.id);
    const antes = await contagens();

    const erro = await capturarErro(() => converter(enc.id, [{ tipo: 'CREDITO', valor: 2320 }]));
    expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'CLIENTE_OBRIGATORIO_CREDITO' });

    await esperarNadaEscrito(enc.id, antes);
  });
});
