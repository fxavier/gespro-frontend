/**
 * Oráculo #241 — `serieNotaCreditoId` em devolução/troca deixa de ser bandeira.
 *
 * Desde #93 a série da NC é a activa do tipo/ano (`numerarDocumento`); a escolha de série é
 * ignorada. Contrato:
 *  1. `devolucaoService.processar(id, ctx, { localizacaoId })` de uma devolução APROVADA com
 *     factura, SEM série de NC → PROCESSADA, com NC EMITIDA da série NOTA_CREDITO activa (que
 *     avança 1), pelo total devolvido. O guard `SERIE_NC_OBRIGATORIA` desaparece.
 *  2. `trocaService.criar` sem série → troca criada, devolução PROCESSADA com NC.
 *  3. O travão de e-mail (`exigirEmailConfirmadoParaEmitir`) passa a depender só de haver
 *     emissão (factura e ainda sem NC), não da presença da série: e-mail por confirmar +
 *     devolução com factura, sem série → EMAIL_POR_CONFIRMAR_EMISSAO e nada escrito (antes:
 *     SERIE_NC_OBRIGATORIA). Sem factura não há emissão nem travão: processa com e-mail por
 *     confirmar.
 *  4. Um chamador antigo que ainda envie um valor qualquer no campo não muda nada: a NC sai da
 *     série activa.
 *
 * Contra Postgres real (Testcontainers), harness de devolucao-troca-documento-2.test.ts.
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({ emailVerificado: true }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: h.emailVerificado } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };

describe.skipIf(skip)('#241 — devolução/troca emitem NC sem série pedida a quem chama — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');

  const sufixo = Date.now();
  const TENANT = `tenant-serie-nc-241-${sufixo}`;
  let seq = 0;

  let produtoA: string;
  let localizacaoId: string;
  let serieNCActivaId: string;
  let clienteId: string;
  let op: Operador;

  beforeEach(() => {
    h.emailVerificado = true;
  });

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function novoOperador(): Promise<Operador> {
    seq += 1;
    const userId = `cserienc241${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `serie-nc-241-${sufixo}-${seq}@test.mz`, nome: `Operador ${seq}`, keycloakSub: `kc-serie-nc-241-${sufixo}-${seq}` },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 5000 } as any, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  /** Venda POS de 1 × A a 1000 + 16%, paga em DINHEIRO (Factura-Recibo). */
  async function venderA() {
    const input = validacoes.CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: op.ctx.userId,
      sessaoPOSId: op.sessaoPOSId,
      sessaoCaixaId: op.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 1160 }],
    });
    const row: any = await runCtx(op.ctx, () => comercial.vendaService.criar(input, op.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'pré-condição: venda POS com Factura-Recibo').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    return { venda, fatura };
  }

  async function devolucaoAprovada(origem: { venda?: any; fatura?: any } = {}) {
    const input = validacoes.CreateDevolucaoSchema.parse({
      clienteId: origem.fatura?.clienteId ?? clienteId,
      vendaId: origem.venda?.id,
      faturaId: origem.fatura?.id,
      motivo: 'DEFEITO',
      reembolso: false,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, valorUnitario: 1000, taxaIva: 0.16 }],
    });
    const dev: any = await runCtx(op.ctx, () => comercial.devolucaoService.criar(input, op.ctx));
    await runCtx(op.ctx, () => comercial.devolucaoService.aprovar(dev.id, op.ctx));
    const gravada = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(gravada.status).toBe('APROVADA');
    expect(gravada.notaCreditoId).toBeNull();
    return gravada;
  }

  /** Chamada SEM série de NC — a forma que o contrato novo impõe. */
  function processarSemSerie(devolucaoId: string, extra: Record<string, unknown> = {}) {
    return runCtx(op.ctx, () =>
      (comercial.devolucaoService as any).processar(devolucaoId, op.ctx, { localizacaoId, ...extra }),
    );
  }

  async function proximoNumeroSerieNC(): Promise<number> {
    const s = await db.serieDocumento.findFirst({ where: { id: serieNCActivaId, tenantId: TENANT } });
    return s.proximoNumero;
  }

  async function contagens() {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      trocas: await db.troca.count({ where: { tenantId: TENANT } }),
      serieNC: await proximoNumeroSerieNC(),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    comercial = await import('@/server/services/comercial');
    validacoes = await import('@/lib/validations/vendas');
    caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Série NC #241', slug: `serie-nc-241-${sufixo}`, nuit: `6${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-241-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    const p = await db.produto.create({
      data: { tenantId: TENANT, sku: `SKU-241-A-${sufixo}`, nome: 'Artigo A', categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: 1000, precoCompra: 700, margemLucro: 0.3, taxaIva: 0.16 },
    });
    produtoA = p.id;
    await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: produtoA, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });

    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo: 'NOTA_CREDITO', ativo: true } });
    expect(series, 'uma série NOTA_CREDITO activa no bootstrap').toHaveLength(1);
    serieNCActivaId = series[0].id;

    const cf = await db.cliente.findFirst({ where: { tenantId: TENANT } });
    expect(cf, 'Consumidor Final do bootstrap').not.toBeNull();
    clienteId = cf.id;

    op = await novoOperador();
  });

  it('processar devolução com factura SEM série → PROCESSADA, NC EMITIDA da série NOTA_CREDITO activa pelo total, série avança 1', async () => {
    const { venda, fatura } = await venderA();
    const dev = await devolucaoAprovada({ venda, fatura });
    const serieAntes = await proximoNumeroSerieNC();

    const erro = await capturarErro(() => processarSemSerie(dev.id));
    expect(erro?.code, `não pode exigir série: ${erro?.message}`).toBeUndefined();
    expect(erro).toBeUndefined();

    const d = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId, 'NC emitida sem série pedida').toBeTruthy();
    const nc = await db.notaCredito.findFirst({ where: { id: d.notaCreditoId, tenantId: TENANT } });
    expect(nc.faturaOriginalId).toBe(fatura.id);
    expect(nc.serieDocumentoId, 'série da NC = a activa do tipo').toBe(serieNCActivaId);
    expect(nc.status).toBe('EMITIDA');
    expect(dec(nc.total).toFixed(2)).toBe('1160.00');
    expect(nc.lancamentoId, 'NC com lançamento').toBeTruthy();
    expect(await proximoNumeroSerieNC()).toBe(serieAntes + 1);
  });

  it('chamador antigo que ainda envie um valor no campo: ignorado, a NC sai da série activa', async () => {
    const { venda, fatura } = await venderA();
    const dev = await devolucaoAprovada({ venda, fatura });

    await processarSemSerie(dev.id, { serieNotaCreditoId: 'ckzserieinexistente000000' });

    const d = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(d.status).toBe('PROCESSADA');
    const nc = await db.notaCredito.findFirst({ where: { id: d.notaCreditoId, tenantId: TENANT } });
    expect(nc.serieDocumentoId).toBe(serieNCActivaId);
  });

  it('troca SEM série → troca criada, devolução PROCESSADA com NC da série activa', async () => {
    const { venda, fatura } = await venderA();
    const dev = await devolucaoAprovada({ venda, fatura });
    const antes = await contagens();

    const parsed = validacoes.CreateTrocaSchema.parse({
      devolucaoId: dev.id,
      novoItem: { produtoId: produtoA, nomeProduto: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
      pagamentos: [],
      localizacaoId,
    });
    expect(parsed).not.toHaveProperty('serieNotaCreditoId');
    const erro = await capturarErro(() => runCtx(op.ctx, () => comercial.trocaService.criar(parsed, op.ctx)));
    expect(erro?.code, `não pode exigir série: ${erro?.message}`).toBeUndefined();
    expect(erro).toBeUndefined();

    const d = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(d.status).toBe('PROCESSADA');
    const nc = await db.notaCredito.findFirst({ where: { id: d.notaCreditoId, tenantId: TENANT } });
    expect(nc.serieDocumentoId).toBe(serieNCActivaId);
    const depois = await contagens();
    expect(depois.trocas).toBe(antes.trocas + 1);
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.serieNC).toBe(antes.serieNC + 1);
  });

  it('e-mail por confirmar + devolução com factura, sem série → EMAIL_POR_CONFIRMAR_EMISSAO (não SERIE_NC_OBRIGATORIA) e nada escrito', async () => {
    const { venda, fatura } = await venderA();
    const dev = await devolucaoAprovada({ venda, fatura });
    const antes = await contagens();

    h.emailVerificado = false;
    const erro = await capturarErro(() => processarSemSerie(dev.id));
    h.emailVerificado = true;

    expect(erro, 'tem de recusar').toBeDefined();
    expect(erro.code).toBe('EMAIL_POR_CONFIRMAR_EMISSAO');
    const d = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(d.status).toBe('APROVADA');
    expect(d.notaCreditoId).toBeNull();
    expect(await contagens()).toEqual(antes);
  });

  it('e-mail por confirmar + devolução SEM factura → processa (não há emissão, não há travão), sem NC', async () => {
    const dev = await devolucaoAprovada();
    const antes = await contagens();

    h.emailVerificado = false;
    const erro = await capturarErro(() => processarSemSerie(dev.id));
    h.emailVerificado = true;

    expect(erro?.code, `sem factura não emite nada: ${erro?.message}`).toBeUndefined();
    const d = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId).toBeNull();
    const depois = await contagens();
    expect(depois.notasCredito).toBe(antes.notasCredito);
    expect(depois.serieNC).toBe(antes.serieNC);
    expect(depois.movimentosStock, 'stock devolvido reentra').toBe(antes.movimentosStock + 1);
  });
});
