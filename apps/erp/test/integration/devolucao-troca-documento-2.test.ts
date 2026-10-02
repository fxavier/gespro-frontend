/**
 * Oráculo S8 iter. 2 — o que a revisão encontrou por provar (ADR-0041 §8, issue #312):
 * «Troca — como a NC paga a nova Factura-Recibo» e «Devolução — reembolso».
 *
 *  1. Troca com substituto MAIS BARATO (devolvido 1160, substituto 580, pagamentos []), numa só tx:
 *     NC LIQUIDADA por COMPENSACAO com `lancamentoLiquidacaoId`; FR PAGA 580 com D 411 580; o
 *     excedente (580) devolve-se em numerário: o lançamento de liquidação tem D 411 580 / C 111 580
 *     e há um `MovimentoCaixa` DEVOLUCAO 580 na sessão indicada. Efeito líquido de todos os
 *     lançamentos da troca (Σ D − C): 411 = 0, 111 = −580, 711 = +500, 44331 = +80 (a receita e o
 *     IVA anulados pela NC excedem os da FR em 500/80 — o débito líquido em 711/44331 é a
 *     contrapartida do dinheiro que sai). Σ PagamentoVenda da venda de substituição = total −
 *     compensado = 0. Atomicidade: conta 111 inactiva (falha no lançamento de liquidação) → nada fica.
 *  2. NC_EXCEDE_FATURA: factura creditada por inteiro (devolução processada) → nova NC pela via
 *     pública (emitirNotaCredito) ou por segunda devolução processada → recusa, série NC intacta.
 *     Parcial + parcial que soma exactamente o total é PERMITIDO; um cêntimo acima é recusado.
 *  3. vendaService.anular da venda de substituição de uma troca → BusinessRuleError VENDA_DE_TROCA,
 *     nada escrito.
 *  4. Recusas da troca, cada uma sem escrever nada: CREDITO nos pagamentos → TROCA_SEM_CREDITO;
 *     pagamentos ≠ diferença → PAGAMENTOS_NAO_BATEM_TOTAL; dinheiro (a receber ou a devolver) sem
 *     sessão de caixa → SESSAO_CAIXA_NECESSARIA.
 *
 * Contra Postgres real (Testcontainers), harness de devolucao-troca-documento.test.ts.
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));
const ZERO = new Prisma.Decimal(0);

type Ctx = { tenantId: string; userId: string };
type Operador = { ctx: Ctx; sessaoCaixaId: string; sessaoPOSId: string };
type Partida = { codigo: string; tipo: string; valor: Prisma.Decimal };

describe.skipIf(skip)('Devolução/troca → NC, iteração 2 (compensação, excedente, NC_EXCEDE_FATURA, VENDA_DE_TROCA, recusas) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let faturacao: typeof import('@/server/services/financas/faturacao.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-dev-troca2-${sufixo}`;
  let seq = 0;

  let produtoA: string;
  let produtoB: string;
  let localizacaoId: string;
  let op: Operador;
  let serieNCId: string;

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
    const userId = `cdevtrocb${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `dev-troca2-${sufixo}-${seq}@test.mz`, nome: `Operador ${seq}`, keycloakSub: `kc-dev-troca2-${sufixo}-${seq}` },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 5000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  /** Venda POS de `quantidade` × A a 1000 + 16%, paga em DINHEIRO. */
  async function venderA(quantidade: number, quem: Operador = op) {
    const total = 1160 * quantidade;
    const input = validacoes.CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: quem.ctx.userId,
      sessaoPOSId: quem.sessaoPOSId,
      sessaoCaixaId: quem.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'DINHEIRO', valor: total }],
    });
    const row: any = await runCtx(quem.ctx, () => comercial.vendaService.criar(input, quem.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'pré-condição: venda POS com Factura-Recibo').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    expect(fatura.lancamentoId, 'pré-condição: factura com lançamento').toBeTruthy();
    return { venda, fatura };
  }

  async function devolucaoAprovada(venda: any, fatura: any, quantidade: number, reembolso: boolean, quem: Operador = op) {
    const input = validacoes.CreateDevolucaoSchema.parse({
      clienteId: fatura.clienteId,
      vendaId: venda.id,
      faturaId: fatura.id,
      motivo: 'DEFEITO',
      reembolso,
      itens: [{ produtoId: produtoA, nomeProduto: 'Artigo A', quantidade, valorUnitario: 1000, taxaIva: 0.16 }],
    });
    const dev: any = await runCtx(quem.ctx, () => comercial.devolucaoService.criar(input, quem.ctx));
    await runCtx(quem.ctx, () => comercial.devolucaoService.aprovar(dev.id, quem.ctx));
    const gravada = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(gravada.status).toBe('APROVADA');
    expect(gravada.notaCreditoId).toBeNull();
    return gravada;
  }

  function processar(devolucaoId: string, opcoes: { sessaoCaixaId?: string }, quem: Operador = op) {
    return runCtx(quem.ctx, () =>
      comercial.devolucaoService.processar(devolucaoId, quem.ctx, { localizacaoId, serieNotaCreditoId: serieNCId, ...opcoes }),
    );
  }

  function trocar(input: Record<string, unknown>, quem: Operador = op) {
    const parsed = validacoes.CreateTrocaSchema.parse({ localizacaoId, serieNotaCreditoId: serieNCId, ...input });
    return runCtx(quem.ctx, () => comercial.trocaService.criar(parsed, quem.ctx));
  }

  /** NC pela via pública de Facturação: uma linha de A com os valores dados. */
  function emitirNC(faturaId: string, linha: { precoUnitario: number; subtotal: number; ivaItem: number; total: number; taxaIva: number }) {
    return runCtx(op.ctx, () =>
      faturacao.emitirNotaCredito(
        {
          faturaOriginalId: faturaId,
          motivo: 'Correcção em Facturação',
          moeda: 'MZN',
          dataEmissao: new Date(),
          linhas: [{ produtoId: produtoA, descricao: 'Artigo A', quantidade: 1, desconto: 0, ordemLinha: 1, ...linha }],
        } as any,
        op.ctx,
      ),
    );
  }

  const linhaUmA = { precoUnitario: 1000, subtotal: 1000, ivaItem: 160, total: 1160, taxaIva: 0.16 };

  async function partidasDe(lancamentoId: string): Promise<Partida[]> {
    const partidas = await db.partidaLancamento.findMany({
      where: { lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return partidas.map((p: any) => ({ codigo: p.conta.codigo as string, tipo: p.tipo as string, valor: dec(p.valor) }));
  }

  function somar(partidas: Partida[], tipo: string, codigo?: string) {
    return partidas
      .filter((p) => p.tipo === tipo && (codigo === undefined || p.codigo === codigo))
      .reduce((a, p) => a.plus(p.valor), ZERO);
  }

  function liquidoPorConta(partidas: Partida[]): Record<string, string> {
    const m = new Map<string, Prisma.Decimal>();
    for (const p of partidas) m.set(p.codigo, (m.get(p.codigo) ?? ZERO).plus(p.tipo === 'DEBITO' ? p.valor : p.valor.negated()));
    return Object.fromEntries([...m].filter(([, v]) => !v.isZero()).map(([k, v]) => [k, v.toFixed(2)]));
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function saldo(produtoId: string) {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
    return dec(s.saldo).toString();
  }

  async function contagens() {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      ncLiquidadas: await db.notaCredito.count({ where: { tenantId: TENANT, status: 'LIQUIDADA' } }),
      linhasNotaCredito: await db.linhaNotaCredito.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
      vendasCanceladas: await db.venda.count({ where: { tenantId: TENANT, status: 'CANCELADA' } }),
      pagamentosVenda: await db.pagamentoVenda.count({ where: { tenantId: TENANT } }),
      trocas: await db.troca.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      saldoA: await saldo(produtoA),
      saldoB: await saldo(produtoB),
      serieNC: await proximoNumeroDaSerie('NOTA_CREDITO'),
      serieFR: await proximoNumeroDaSerie('FATURA_RECIBO'),
      serieVenda: await proximoNumeroDaSerie('VENDA'),
    };
  }

  async function idsLancamentos(): Promise<Set<string>> {
    return new Set((await db.lancamento.findMany({ where: { tenantId: TENANT }, select: { id: true } })).map((l: any) => l.id));
  }

  async function partidasDosNovos(antes: Set<string>): Promise<Partida[]> {
    const novos = (await db.lancamento.findMany({ where: { tenantId: TENANT }, select: { id: true } })).filter((l: any) => !antes.has(l.id));
    const todas: Partida[] = [];
    for (const l of novos) todas.push(...(await partidasDe(l.id)));
    return todas;
  }

  async function estadoDevolucao(id: string) {
    const d = await db.devolucao.findFirst({ where: { id, tenantId: TENANT } });
    return { status: d.status, notaCreditoId: d.notaCreditoId, processadoEm: d.processadoEm };
  }

  const itemB = (precoUnitario: number) => ({ produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario, desconto: 0, taxaIva: 0.16 });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    comercial = await import('@/server/services/comercial');
    validacoes = await import('@/lib/validations/vendas');
    caixa = await import('@/server/services/financas/caixa.service');
    faturacao = await import('@/server/services/financas/faturacao.service');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Devolução/Troca 2', slug: `dev-troca2-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-DT2-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    for (const [sku, nome, preco] of [
      [`SKU-DT2-A-${sufixo}`, 'Artigo A', 1000],
      [`SKU-DT2-B-${sufixo}`, 'Artigo B', 500],
    ] as const) {
      const p = await db.produto.create({
        data: { tenantId: TENANT, sku, nome, categoriaId: categoria.id, unidadeMedida: 'UN', precoVenda: preco, precoCompra: preco * 0.7, margemLucro: 0.3, taxaIva: 0.16 },
      });
      await db.saldoStock.create({ data: { tenantId: TENANT, produtoId: p.id, varianteProdutoId: '', localizacaoId, saldo: 1000, saldoReservado: 0 } });
      if (sku.includes('-A-')) produtoA = p.id;
      else produtoB = p.id;
    }

    const serieNC = await db.serieDocumento.findFirst({ where: { tenantId: TENANT, tipo: 'NOTA_CREDITO', ativo: true } });
    expect(serieNC, 'série NOTA_CREDITO activa no bootstrap').not.toBeNull();
    serieNCId = serieNC.id;

    op = await novoOperador();
  });

  // =========================================================================
  // 1. Troca com substituto mais barato — excedente devolvido em numerário
  // =========================================================================

  it('troca A(1160) → B(580), pagamentos []: NC LIQUIDADA/COMPENSACAO com lançamento de liquidação D 411 / C 111 580; FR PAGA 580 com D 411 580; DEVOLUCAO 580 na caixa; líquido 411 = 0, 111 = −580, 711 = +500, 44331 = +80; Σ PagamentoVenda = 0', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const lancAntes = await idsLancamentos();
    const movsAntes = new Set((await db.movimentoCaixa.findMany({ where: { tenantId: TENANT }, select: { id: true } })).map((m: any) => m.id));

    const r: any = await trocar({ devolucaoId: dev.id, novoItem: itemB(500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [] });

    // ── NC dos bens devolvidos: liquidada por compensação, com lançamento da parte em numerário ──
    const ncs = await db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } });
    expect(ncs, 'uma NC dos bens devolvidos').toHaveLength(1);
    const nc = ncs[0];
    expect(dec(nc.total).toFixed(2)).toBe('1160.00');
    expect(nc.lancamentoId, 'NC com lançamento de emissão').toBeTruthy();
    expect(nc.status).toBe('LIQUIDADA');
    expect(nc.formaLiquidacao).toBe('COMPENSACAO');
    expect(nc.lancamentoLiquidacaoId, 'NC com lançamento de liquidação (excedente em numerário)').toBeTruthy();
    const lancLiq = await db.lancamento.findFirst({ where: { id: nc.lancamentoLiquidacaoId, tenantId: TENANT } });
    expect(lancLiq.status).toBe('LANCADO');
    const pLiq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(somar(pLiq, 'DEBITO', '411').toFixed(2), 'liquidação: D 411 580').toBe('580.00');
    expect(somar(pLiq, 'CREDITO', '111').toFixed(2), 'liquidação: C 111 580').toBe('580.00');
    const d = await estadoDevolucao(dev.id);
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId).toBe(nc.id);

    // ── Venda de substituição + FR PAGA 580, D 411 pelo compensado ──
    const troca = await db.troca.findFirst({ where: { id: r.id, tenantId: TENANT } });
    const vendaSub = await db.venda.findFirst({ where: { id: troca.vendaSubstituicaoId, tenantId: TENANT }, include: { pagamentos: true } });
    expect(dec(vendaSub.total).toFixed(2)).toBe('580.00');
    expect(vendaSub.faturaId).toBeTruthy();
    const fr = await db.fatura.findFirst({ where: { id: vendaSub.faturaId, tenantId: TENANT }, include: { serieDocumento: true } });
    expect(fr.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(fr.status).toBe('PAGA');
    expect(dec(fr.total).toFixed(2)).toBe('580.00');
    expect(dec(fr.totalPago).toFixed(2)).toBe('580.00');
    expect(fr.lancamentoId).toBeTruthy();
    const pFR = await partidasDe(fr.lancamentoId);
    expect(somar(pFR, 'DEBITO', '411').toFixed(2), 'FR: D 411 pelo crédito compensado').toBe('580.00');
    expect(somar(pFR, 'DEBITO').toFixed(2)).toBe('580.00');
    expect(somar(pFR, 'CREDITO', '711').toFixed(2)).toBe('500.00');
    expect(somar(pFR, 'CREDITO', '44331').toFixed(2)).toBe('80.00');

    // Σ PagamentoVenda = total − compensado = 580 − 580 = 0.
    const somaPag = vendaSub.pagamentos.reduce((a: Prisma.Decimal, p: any) => a.plus(dec(p.valor)), ZERO);
    expect(somaPag.toFixed(2), 'Σ PagamentoVenda da venda de substituição').toBe('0.00');

    // ── Caixa: um único movimento novo, DEVOLUCAO 580 na sessão indicada ──
    const movsNovos = (await db.movimentoCaixa.findMany({ where: { tenantId: TENANT } })).filter((m: any) => !movsAntes.has(m.id));
    expect(movsNovos, 'um movimento de caixa novo').toHaveLength(1);
    expect(movsNovos[0].tipo).toBe('DEVOLUCAO');
    expect(movsNovos[0].sessaoCaixaId).toBe(op.sessaoCaixaId);
    expect(dec(movsNovos[0].valor).toFixed(2)).toBe('580.00');

    // ── Efeito líquido de todos os lançamentos criados pela troca ──
    expect(liquidoPorConta(await partidasDosNovos(lancAntes)), 'efeito líquido por conta (Σ D − C)').toEqual({
      '111': '-580.00',
      '711': '500.00',
      '44331': '80.00',
    });

    // ── Contagens ──
    const depois = await contagens();
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(depois.vendas).toBe(antes.vendas + 1);
    expect(depois.trocas).toBe(antes.trocas + 1);
    expect(depois.serieNC).toBe(antes.serieNC + 1);
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    expect(depois.saldoA).toBe(dec(antes.saldoA).plus(1).toString());
    expect(depois.saldoB).toBe(dec(antes.saldoB).minus(1).toString());
  });

  it('troca mais barata é uma só transacção: conta 111 inactiva (falha no lançamento de liquidação D 411 / C 111) → nada fica; com a 111 reposta a mesma troca passa', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const devAntes = await estadoDevolucao(dev.id);
    const input = { devolucaoId: dev.id, novoItem: itemB(500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [] };

    const conta111 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '111' } });
    expect(conta111).not.toBeNull();
    await db.contaPGC.update({ where: { id: conta111.id }, data: { ativo: false } });
    let erro: any;
    try {
      erro = await capturarErro(() => trocar(input));
    } finally {
      await db.contaPGC.update({ where: { id: conta111.id }, data: { ativo: true } });
    }

    expect(erro, 'a troca tinha de falhar: a liquidação credita a 111 pelo excedente').toBeDefined();
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } }), 'NC órfã').toBe(0);
    expect(await contagens()).toEqual(antes);
    expect(await estadoDevolucao(dev.id)).toEqual(devAntes);

    await trocar(input);
    expect((await estadoDevolucao(dev.id)).status).toBe('PROCESSADA');
  });

  // =========================================================================
  // 2. NC_EXCEDE_FATURA
  // =========================================================================

  it('factura creditada por inteiro (devolução processada) → nova NC por emitirNotaCredito recusa NC_EXCEDE_FATURA; série NC intacta, nada escrito', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    await processar(dev.id, {});
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } })).toBe(1);
    const antes = await contagens();

    const erro = await capturarErro(() => emitirNC(fatura.id, linhaUmA));

    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('NC_EXCEDE_FATURA');
    expect(await contagens()).toEqual(antes);
  });

  it('factura creditada por inteiro → segunda devolução processada recusa NC_EXCEDE_FATURA; série NC intacta, devolução continua APROVADA sem NC, stock intacto', async () => {
    const { venda, fatura } = await venderA(1);
    const dev1 = await devolucaoAprovada(venda, fatura, 1, false);
    await processar(dev1.id, {});
    const dev2 = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const dev2Antes = await estadoDevolucao(dev2.id);

    const erro = await capturarErro(() => processar(dev2.id, {}));

    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('NC_EXCEDE_FATURA');
    expect(await contagens()).toEqual(antes);
    expect(await estadoDevolucao(dev2.id)).toEqual(dev2Antes);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } })).toBe(1);
  });

  it('parcial + parcial: factura 2320 → NC 1160 passa; NC 1160,01 recusa (um cêntimo acima); NC 1160 (soma exacta = total) passa; NC 0,01 recusa', async () => {
    const { fatura } = await venderA(2);
    expect(dec(fatura.total).toFixed(2)).toBe('2320.00');

    await emitirNC(fatura.id, linhaUmA);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } })).toBe(1);

    let antes = await contagens();
    const erroCentimo = await capturarErro(() =>
      emitirNC(fatura.id, { precoUnitario: 1000.01, subtotal: 1000.01, ivaItem: 160, total: 1160.01, taxaIva: 0.16 }),
    );
    expect(erroCentimo, '1160 + 1160,01 > 2320').toBeInstanceOf(BusinessRuleError);
    expect(erroCentimo.code).toBe('NC_EXCEDE_FATURA');
    expect(await contagens()).toEqual(antes);

    const segunda: any = await emitirNC(fatura.id, linhaUmA);
    expect(dec(segunda.total).toFixed(2)).toBe('1160.00');
    const ncs = await db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } });
    expect(ncs).toHaveLength(2);
    expect(ncs.reduce((a: Prisma.Decimal, n: any) => a.plus(dec(n.total)), ZERO).toFixed(2), 'Σ NC = total da factura').toBe('2320.00');

    antes = await contagens();
    const erroUmCentimo = await capturarErro(() =>
      emitirNC(fatura.id, { precoUnitario: 0.01, subtotal: 0.01, ivaItem: 0, total: 0.01, taxaIva: 0 }),
    );
    expect(erroUmCentimo, 'factura já creditada por inteiro: mais 0,01 excede').toBeInstanceOf(BusinessRuleError);
    expect(erroUmCentimo.code).toBe('NC_EXCEDE_FATURA');
    expect(await contagens()).toEqual(antes);
  });

  // =========================================================================
  // 3. A venda de troca não se anula pelo POS
  // =========================================================================

  it('vendaService.anular da venda de substituição de uma troca → VENDA_DE_TROCA; nada escrito, venda e FR inalteradas', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const r: any = await trocar({
      devolucaoId: dev.id,
      novoItem: itemB(1500),
      sessaoCaixaId: op.sessaoCaixaId,
      pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }],
    });
    const troca = await db.troca.findFirst({ where: { id: r.id, tenantId: TENANT } });
    const vendaSubAntes = await db.venda.findFirst({ where: { id: troca.vendaSubstituicaoId, tenantId: TENANT } });
    const frAntes = await db.fatura.findFirst({ where: { id: vendaSubAntes.faturaId, tenantId: TENANT } });
    const antes = await contagens();

    const erro = await capturarErro(() =>
      runCtx(op.ctx, () => comercial.vendaService.anular(vendaSubAntes.id, { motivo: 'Cliente desistiu' }, op.ctx)),
    );

    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('VENDA_DE_TROCA');
    expect(await contagens()).toEqual(antes);
    expect(await db.venda.findFirst({ where: { id: vendaSubAntes.id, tenantId: TENANT } })).toEqual(vendaSubAntes);
    expect(await db.fatura.findFirst({ where: { id: frAntes.id, tenantId: TENANT } })).toEqual(frAntes);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: frAntes.id } })).toBe(0);
  });

  // =========================================================================
  // 4. Recusas da troca — nenhuma escreve nada
  // =========================================================================

  it('recusas da troca: CREDITO → TROCA_SEM_CREDITO; pagamentos ≠ diferença → PAGAMENTOS_NAO_BATEM_TOTAL; dinheiro sem sessão → SESSAO_CAIXA_NECESSARIA; cada uma sem escrever nada; controlo positivo no fim', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const devAntes = await estadoDevolucao(dev.id);

    const casos: Array<{ nome: string; codigo: string; input: Record<string, unknown> }> = [
      {
        nome: 'diferença 580 a CREDITO',
        codigo: 'TROCA_SEM_CREDITO',
        input: { novoItem: itemB(1500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [{ tipo: 'CREDITO', valor: 580 }] },
      },
      {
        nome: 'diferença 580, pagos 500',
        codigo: 'PAGAMENTOS_NAO_BATEM_TOTAL',
        input: { novoItem: itemB(1500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [{ tipo: 'DINHEIRO', valor: 500 }] },
      },
      {
        nome: 'diferença 580, pagamentos []',
        codigo: 'PAGAMENTOS_NAO_BATEM_TOTAL',
        input: { novoItem: itemB(1500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [] },
      },
      {
        nome: 'substituto mais barato (diferença 0), pagos 580',
        codigo: 'PAGAMENTOS_NAO_BATEM_TOTAL',
        input: { novoItem: itemB(500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }] },
      },
      {
        nome: 'diferença 580 em DINHEIRO sem sessão de caixa',
        codigo: 'SESSAO_CAIXA_NECESSARIA',
        input: { novoItem: itemB(1500), pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }] },
      },
      {
        nome: 'excedente 580 a devolver em numerário sem sessão de caixa',
        codigo: 'SESSAO_CAIXA_NECESSARIA',
        input: { novoItem: itemB(500), pagamentos: [] },
      },
    ];

    for (const c of casos) {
      const erro = await capturarErro(() => trocar({ devolucaoId: dev.id, ...c.input }));
      expect(erro, c.nome).toBeInstanceOf(BusinessRuleError);
      expect(erro.code, c.nome).toBe(c.codigo);
      expect(await contagens(), `${c.nome}: nada escrito`).toEqual(antes);
      expect(await estadoDevolucao(dev.id), `${c.nome}: devolução intacta`).toEqual(devAntes);
      expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } }), `${c.nome}: NC órfã`).toBe(0);
    }

    // Controlo positivo: a mesma devolução troca-se com o input correcto.
    await trocar({ devolucaoId: dev.id, novoItem: itemB(1500), sessaoCaixaId: op.sessaoCaixaId, pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }] });
    expect((await estadoDevolucao(dev.id)).status).toBe('PROCESSADA');
  });
});
