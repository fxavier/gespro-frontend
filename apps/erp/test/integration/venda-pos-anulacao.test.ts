/**
 * Oráculo S7 — anular uma venda POS emite nota de crédito com estorno (ADR-0041 §3, §4, §8; issue #311)
 *
 * Contrato: `vendaService.anular(vendaId, { motivo }, ctx)`, publicado em `IVendaService`. Para uma
 * venda POS CONCLUIDA com Factura-Recibo, numa só transacção:
 *   - NotaCredito pelo núcleo (S1) ligada à factura (`faturaOriginalId`), creditando TODAS as linhas
 *     (totais = totais da factura), `motivo` gravado, `lancamentoId` com as partidas de
 *     `construirLancamentoNotaCredito` (D 711 subtotal, D 44331 IVA, C 411 total);
 *   - devolução pelos meios ORIGINAIS: NC LIQUIDADA, `formaLiquidacao` DEVOLUCAO,
 *     `lancamentoLiquidacaoId` com D 411 total / C <a mesma conta debitada na venda> por pagamento;
 *   - `MovimentoCaixa` DEVOLUCAO = Σ parte em DINHEIRO, na sessão de caixa da venda (ABERTA);
 *     venda só a cartão não mexe na caixa;
 *   - reentrada de stock por item (MovimentoStock ENTRADA; saldo reposto);
 *   - Venda CANCELADA; a Fatura original fica IGUAL (todos os campos persistidos) e o seu
 *     lançamento continua LANCADO.
 *   - Efeito líquido: Σ débito − Σ crédito sobre os lançamentos da factura + NC + liquidação é
 *     ZERO em cada conta tocada (111, 121, 411, 711, 44331).
 * Recusas, sem escrever nada: já CANCELADA → VENDA_JA_ANULADA; não-POS ou sem factura →
 * VENDA_SEM_DOCUMENTO; motivo vazio → MOTIVO_OBRIGATORIO; período de hoje fechado →
 * PERIODO_FECHADO; dinheiro a devolver com a sessão de caixa da venda fechada →
 * SESSAO_CAIXA_FECHADA.
 * Atomicidade: conta 111 inactiva (a liquidação falha depois de a NC estar criada) → nada fica:
 * nem NC, lançamento, caixa nem stock; venda CONCLUIDA; série NOTA_CREDITO intacta.
 *
 * Só vendas PAGAS (DINHEIRO, CARTAO, DINHEIRO+MPESA): a anulação a crédito fica fora (S4).
 *
 * Contra Postgres real (Testcontainers), harness do oráculo S2 (`venda-pos-documento.test.ts`):
 * tenant pelos serviços reais (`bootstrapContabilidade`, `abrirSessao`/`fecharSessao` do caixa,
 * `resolverPeriodo`); catálogo, stock e sessão POS são dados de partida; vendas pelo caminho real
 * `vendaService.criar`. Fechar o período é um `update` de fixture ao `estado`, reposto em `finally`.
 * Vendas sem documento (legado/encomenda) são linhas de fixture. A sessão (auth) é o único duplo.
 * O `ctx` é o do serviço ({ tenantId, userId }) — permissões são da action, não do serviço.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
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

describe.skipIf(skip)('Anular venda POS → nota de crédito com estorno, devolução, caixa e stock — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let resolverPeriodo: (typeof import('@/server/services/financas/contabilidade.service'))['resolverPeriodo'];
  let periodoFiscalDe: (typeof import('@/server/services/financas/contabilidade.service'))['periodoFiscalDe'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-anul-${sufixo}`;
  let seq = 0;

  let produtoId: string;
  let localizacaoId: string;
  /** Operador principal: caixa e sessão POS abertas durante todo o ficheiro. */
  let op: Operador;

  // ── dados de venda ─────────────────────────────────────────────────────────
  // 3 × (1 × 10,03 @16%) + (3 × 33,33 − 10% @16%): subtotal 120,08 · IVA 19,20 · total 139,28
  function itensMisturados() {
    const l10 = { produtoId, nomeProduto: 'Artigo 10,03', quantidade: 1, precoUnitario: 10.03, desconto: 0, taxaIva: 0.16 };
    return [l10, { ...l10 }, { ...l10 }, { produtoId, nomeProduto: 'Artigo 33,33', quantidade: 3, precoUnitario: 33.33, desconto: 10, taxaIva: 0.16 }];
  }
  // 1 × 1000 @16% → 1160
  function itensMil() {
    return [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }];
  }

  // ── utilidades ─────────────────────────────────────────────────────────────
  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function esperarRegra(erro: any, codigo: string) {
    expect(erro, `esperava BusinessRuleError ${codigo}, nada foi lançado`).toBeDefined();
    expect(erro, `esperava BusinessRuleError ${codigo}, veio ${erro?.constructor?.name}: ${erro?.message}`).toBeInstanceOf(
      BusinessRuleError,
    );
    expect(erro.code).toBe(codigo);
  }

  async function novoOperador(): Promise<Operador> {
    seq += 1;
    // Os schemas de vendas exigem cuid em vendedorId: forma `c` + alfanuméricos.
    const userId = `cposanul${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `pos-anul-${sufixo}-${seq}@test.mz`, nome: `Vendedor ${seq}`, keycloakSub: `kc-pos-anul-${sufixo}-${seq}` },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  async function vender(itens: unknown[], pagamentos: unknown[], quem: Operador = op) {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: quem.ctx.userId,
      sessaoPOSId: quem.sessaoPOSId,
      sessaoCaixaId: quem.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens,
      pagamentos,
    });
    const row: any = await runCtx(quem.ctx, () => vendaService.criar(input, quem.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.status).toBe('CONCLUIDA');
    expect(venda?.faturaId, 'pré-condição: venda com Factura-Recibo').toBeTruthy();
    return venda;
  }

  function anular(vendaId: string, motivo: string, quem: Operador = op) {
    expect(typeof (vendaService as any).anular, 'vendaService.anular publicado').toBe('function');
    return runCtx(quem.ctx, () => (vendaService as any).anular(vendaId, { motivo }, quem.ctx));
  }

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

  /** Σ (D − C) por conta. */
  function liquidoPorConta(partidas: Partida[]): Map<string, Prisma.Decimal> {
    const m = new Map<string, Prisma.Decimal>();
    for (const p of partidas) {
      const v = p.tipo === 'DEBITO' ? p.valor : p.valor.negated();
      m.set(p.codigo, (m.get(p.codigo) ?? ZERO).plus(v));
    }
    return m;
  }

  function porConta(partidas: Partida[], tipo: string): Record<string, string> {
    const r: Record<string, Prisma.Decimal> = {};
    for (const p of partidas.filter((x) => x.tipo === tipo)) r[p.codigo] = (r[p.codigo] ?? ZERO).plus(p.valor);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.toFixed(2)]));
  }

  async function proximoNumeroDaSerie(tipo: string): Promise<number> {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo, ativo: true } });
    expect(series.length, `série activa ${tipo}`).toBeGreaterThan(0);
    return series.reduce((a: number, s: any) => a + s.proximoNumero, 0);
  }

  async function saldoStock() {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId, varianteProdutoId: '' } });
    return dec(s.saldo).toString();
  }

  async function contagens() {
    return {
      notasCredito: await db.notaCredito.count({ where: { tenantId: TENANT } }),
      linhasNotaCredito: await db.linhaNotaCredito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      partidas: await db.partidaLancamento.count({ where: { tenantId: TENANT } }),
      movimentosStock: await db.movimentoStock.count({ where: { tenantId: TENANT } }),
      movimentosCaixa: await db.movimentoCaixa.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      vendasCanceladas: await db.venda.count({ where: { tenantId: TENANT, status: 'CANCELADA' } }),
      saldo: await saldoStock(),
      serieNC: await proximoNumeroDaSerie('NOTA_CREDITO'),
    };
  }

  /** Estado persistido da factura e do seu lançamento — tem de ficar intacto. */
  async function fotografiaFatura(faturaId: string) {
    const fatura = await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } });
    const linhas = await db.linhaFatura.findMany({ where: { faturaId, tenantId: TENANT }, orderBy: { id: 'asc' } });
    const lanc = await db.lancamento.findFirst({ where: { id: fatura.lancamentoId, tenantId: TENANT } });
    const partidas = await db.partidaLancamento.findMany({ where: { lancamentoId: fatura.lancamentoId, tenantId: TENANT }, orderBy: { id: 'asc' } });
    return { fatura, linhas, lanc, partidas };
  }

  async function comPeriodoDeHojeFechado<T>(fn: () => Promise<T>): Promise<T> {
    await db.$transaction((tx: any) => resolverPeriodo(tx, new Date(), TENANT), { timeout: 60_000 });
    const p = await db.periodoContabil.findFirst({ where: { tenantId: TENANT, codigo: periodoFiscalDe(new Date()) } });
    expect(p, 'período de hoje').not.toBeNull();
    const original = { estado: p.estado, fechadoEm: p.fechadoEm, fechadoPorId: p.fechadoPorId };
    await db.periodoContabil.update({ where: { id: p.id }, data: { estado: 'FECHADO', fechadoEm: new Date() } });
    try {
      return await fn();
    } finally {
      await db.periodoContabil.update({ where: { id: p.id }, data: original });
    }
  }

  /**
   * Anula e verifica o contrato inteiro. `pagamentos` = os da venda; `dinheiro` = parte em DINHEIRO.
   */
  async function anularEVerificar(venda: any, dinheiro: Prisma.Decimal, nItens: number, quantidadeTotal: number) {
    const motivo = `Cliente desistiu (${venda.numero})`;
    const antes = await contagens();
    const fotoAntes = await fotografiaFatura(venda.faturaId);
    const devolucoesAntes = await db.movimentoCaixa.count({ where: { tenantId: TENANT, tipo: 'DEVOLUCAO' } });
    const entradasAntes = await db.movimentoStock.findMany({ where: { tenantId: TENANT, tipo: 'ENTRADA' }, select: { id: true } });
    const saldoAntes = dec(antes.saldo);

    await anular(venda.id, motivo);

    // ── venda ──
    const vendaDepois = await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } });
    expect(vendaDepois.status).toBe('CANCELADA');
    expect(vendaDepois.faturaId).toBe(venda.faturaId);

    // ── documento original intacto ──
    const fotoDepois = await fotografiaFatura(venda.faturaId);
    expect(fotoDepois).toEqual(fotoAntes);
    expect(fotoDepois.lanc.status).toBe('LANCADO');
    const fatura = fotoDepois.fatura;

    // ── nota de crédito ──
    const ncs = await db.notaCredito.findMany({
      where: { tenantId: TENANT, faturaOriginalId: fatura.id },
      include: { linhas: true, serieDocumento: true },
    });
    expect(ncs, 'exactamente uma NC para a factura').toHaveLength(1);
    const nc = ncs[0];
    expect(nc.serieDocumento.tipo).toBe('NOTA_CREDITO');
    expect(nc.motivo).toBe(motivo);
    expect(dec(nc.subtotal).equals(dec(fatura.subtotal))).toBe(true);
    expect(dec(nc.ivaTotal).equals(dec(fatura.ivaTotal))).toBe(true);
    expect(dec(nc.total).equals(dec(fatura.total))).toBe(true);
    const k = (l: any) => `${l.produtoId}|${dec(l.quantidade).toFixed(2)}|${dec(l.subtotal).toFixed(2)}|${dec(l.ivaItem).toFixed(2)}|${dec(l.total).toFixed(2)}`;
    expect(nc.linhas.map(k).sort(), 'NC credita todas as linhas da factura').toEqual(fotoDepois.linhas.map(k).sort());

    // Lançamento da NC = construirLancamentoNotaCredito.
    expect(nc.lancamentoId, 'NotaCredito.lancamentoId').toBeTruthy();
    const lancNC = await db.lancamento.findFirst({ where: { id: nc.lancamentoId, tenantId: TENANT } });
    expect(lancNC.status).toBe('LANCADO');
    expect(lancNC.documentoOrigemTipo).toBe('NotaCredito');
    expect(lancNC.documentoOrigemId).toBe(nc.id);
    const partidasNC = await partidasDe(nc.lancamentoId);
    const { construirLancamentoNotaCredito } = await import('@/server/services/financas/faturacao.service');
    const esperado = construirLancamentoNotaCredito({
      id: nc.id,
      numero: nc.numero,
      total: dec(nc.total),
      subtotal: dec(nc.subtotal),
      ivaTotal: dec(nc.ivaTotal),
      dataEmissao: nc.dataEmissao,
    });
    const chave = (p: Partida) => `${p.codigo}|${p.tipo}|${p.valor.toFixed(2)}`;
    expect(partidasNC.map(chave).sort()).toEqual(
      esperado.partidas.map((p) => chave({ codigo: p.contaCodigo, tipo: p.tipo, valor: dec(p.valor) })).sort(),
    );
    expect(somar(partidasNC, 'DEBITO', '711').equals(dec(fatura.subtotal))).toBe(true);
    expect(somar(partidasNC, 'DEBITO', '44331').equals(dec(fatura.ivaTotal))).toBe(true);
    expect(somar(partidasNC, 'CREDITO', '411').equals(dec(fatura.total))).toBe(true);

    // ── liquidação por devolução, pelos meios originais ──
    expect(nc.status).toBe('LIQUIDADA');
    expect(nc.formaLiquidacao).toBe('DEVOLUCAO');
    expect(nc.lancamentoLiquidacaoId, 'NotaCredito.lancamentoLiquidacaoId').toBeTruthy();
    const lancLiq = await db.lancamento.findFirst({ where: { id: nc.lancamentoLiquidacaoId, tenantId: TENANT } });
    expect(lancLiq.status).toBe('LANCADO');
    const partidasLiq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(porConta(partidasLiq, 'DEBITO'), 'liquidação: só D 411 pelo total').toEqual({ '411': dec(fatura.total).toFixed(2) });
    const partidasFatura = await partidasDe(fatura.lancamentoId);
    expect(porConta(partidasLiq, 'CREDITO'), 'liquidação: C nas mesmas contas e valores debitados na venda').toEqual(
      porConta(partidasFatura, 'DEBITO'),
    );

    // ── efeito líquido zero por conta ──
    const liquido = liquidoPorConta([...partidasFatura, ...partidasNC, ...partidasLiq]);
    for (const [conta, v] of liquido) {
      expect(v.toFixed(2), `efeito líquido na conta ${conta}`).toBe('0.00');
    }
    for (const conta of ['411', '711', '44331']) expect(liquido.has(conta), `conta ${conta} tocada`).toBe(true);

    // ── caixa ──
    const devolucoes = await db.movimentoCaixa.findMany({ where: { tenantId: TENANT, tipo: 'DEVOLUCAO' } });
    const depois = await contagens();
    if (dinheiro.greaterThan(0)) {
      expect(devolucoes.length).toBe(devolucoesAntes + 1);
      const nova = devolucoes.sort((a: any, b: any) => +b.createdAt - +a.createdAt)[0];
      expect(nova.sessaoCaixaId, 'DEVOLUCAO na sessão de caixa da venda').toBe(venda.sessaoCaixaId);
      expect(dec(nova.valor).toFixed(2)).toBe(dinheiro.toFixed(2));
      expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa + 1);
    } else {
      expect(devolucoes.length).toBe(devolucoesAntes);
      expect(depois.movimentosCaixa, 'venda sem dinheiro não mexe na caixa').toBe(antes.movimentosCaixa);
    }

    // ── stock ──
    const idsAntes = new Set(entradasAntes.map((m: any) => m.id));
    const novasEntradas = (await db.movimentoStock.findMany({ where: { tenantId: TENANT, tipo: 'ENTRADA' } })).filter(
      (m: any) => !idsAntes.has(m.id),
    );
    expect(novasEntradas, 'uma entrada de stock por item').toHaveLength(nItens);
    expect(novasEntradas.every((m: any) => m.produtoId === produtoId)).toBe(true);
    expect(novasEntradas.reduce((a: Prisma.Decimal, m: any) => a.plus(dec(m.quantidade)), ZERO).toFixed(2)).toBe(
      dec(quantidadeTotal).toFixed(2),
    );
    expect(dec(depois.saldo).equals(saldoAntes.plus(quantidadeTotal)), 'saldo reposto').toBe(true);

    // ── contagens: uma NC, dois lançamentos (NC + liquidação), série NC +1, nenhuma factura nova ──
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.lancamentos).toBe(antes.lancamentos + 2);
    expect(depois.serieNC).toBe(antes.serieNC + 1);
    expect(depois.faturas).toBe(antes.faturas);
    expect(depois.movimentosStock).toBe(antes.movimentosStock + nItens);

    return { nc, fatura };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ resolverPeriodo, periodoFiscalDe } = await import('@/server/services/financas/contabilidade.service'));
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS Anulação', slug: `pos-anul-${sufixo}`, nuit: `3${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-ANUL-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-ANUL-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    op = await novoOperador();
  });

  // -------------------------------------------------------------------------
  // Caminho feliz
  // -------------------------------------------------------------------------

  it('vendaService.anular está publicado no serviço de vendas', () => {
    expect(typeof (vendaService as any).anular).toBe('function');
  });

  it('venda a dinheiro (4 linhas, 139,28): NC total liquidada D 411 / C 111, DEVOLUCAO 139,28 na caixa da venda, 4 entradas de stock, venda CANCELADA, factura intacta, efeito líquido zero', async () => {
    const venda = await vender(itensMisturados(), [{ tipo: 'DINHEIRO', valor: 139.28, troco: 10.72 }]);
    const { nc } = await anularEVerificar(venda, dec('139.28'), 4, 6);
    expect(dec(nc.total).toFixed(2)).toBe('139.28');
    const liq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(somar(liq, 'CREDITO', '111').toFixed(2)).toBe('139.28');
  });

  it('venda a cartão (1160): NC liquidada D 411 / C 121, nenhum movimento de caixa', async () => {
    const venda = await vender(itensMil(), [{ tipo: 'CARTAO', valor: 1160 }]);
    const { nc } = await anularEVerificar(venda, ZERO, 1, 1);
    const liq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(somar(liq, 'CREDITO', '121').toFixed(2)).toBe('1160.00');
    expect(somar(liq, 'CREDITO', '111').toFixed(2)).toBe('0.00');
  });

  it('venda mista DINHEIRO 300 + MPESA 860: liquidação C 111 = 300 e C 121 = 860; DEVOLUCAO de 300 apenas', async () => {
    const venda = await vender(itensMil(), [
      { tipo: 'DINHEIRO', valor: 300 },
      { tipo: 'MPESA', valor: 860, referencia: 'MP-311' },
    ]);
    const { nc } = await anularEVerificar(venda, dec('300'), 1, 1);
    const liq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(somar(liq, 'DEBITO', '411').toFixed(2)).toBe('1160.00');
    expect(somar(liq, 'CREDITO', '111').toFixed(2)).toBe('300.00');
    expect(somar(liq, 'CREDITO', '121').toFixed(2)).toBe('860.00');
  });

  // -------------------------------------------------------------------------
  // Recusas — nada escrito
  // -------------------------------------------------------------------------

  it('anular uma venda já CANCELADA → VENDA_JA_ANULADA, nada escrito', async () => {
    const venda = await vender(itensMil(), [{ tipo: 'DINHEIRO', valor: 1160 }]);
    await anular(venda.id, 'Primeira anulação');
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    esperarRegra(await capturarErro(() => anular(venda.id, 'Segunda anulação')), 'VENDA_JA_ANULADA');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
  });

  it('venda POS sem factura (legado) → VENDA_SEM_DOCUMENTO, nada escrito, venda intacta', async () => {
    const legado = await db.venda.create({
      data: {
        tenantId: TENANT,
        numero: `LEGADO-POS-${sufixo}`,
        origem: 'POS',
        status: 'CONCLUIDA',
        vendedorId: op.ctx.userId,
        sessaoCaixaId: op.sessaoCaixaId,
        subtotal: 1000,
        ivaTotal: 160,
        total: 1160,
      },
    });
    const antes = await contagens();

    esperarRegra(await capturarErro(() => anular(legado.id, 'Anular legado')), 'VENDA_SEM_DOCUMENTO');

    expect(await contagens()).toEqual(antes);
    expect((await db.venda.findFirst({ where: { id: legado.id } })).status).toBe('CONCLUIDA');
  });

  it('venda não-POS (encomenda) → VENDA_SEM_DOCUMENTO, nada escrito', async () => {
    const encomenda = await db.venda.create({
      data: {
        tenantId: TENANT,
        numero: `ENC-${sufixo}`,
        origem: 'ENCOMENDA',
        status: 'CONCLUIDA',
        vendedorId: op.ctx.userId,
        subtotal: 1000,
        ivaTotal: 160,
        total: 1160,
      },
    });
    const antes = await contagens();

    esperarRegra(await capturarErro(() => anular(encomenda.id, 'Anular encomenda')), 'VENDA_SEM_DOCUMENTO');

    expect(await contagens()).toEqual(antes);
    expect((await db.venda.findFirst({ where: { id: encomenda.id } })).status).toBe('CONCLUIDA');
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
  ])('motivo %s → MOTIVO_OBRIGATORIO, nada escrito, venda CONCLUIDA', async (_n, motivo) => {
    const venda = await vender(itensMil(), [{ tipo: 'CARTAO', valor: 1160 }]);
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    esperarRegra(await capturarErro(() => anular(venda.id, motivo)), 'MOTIVO_OBRIGATORIO');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CONCLUIDA');
  });

  it('período de hoje fechado → PERIODO_FECHADO, nada escrito, série NC intacta', async () => {
    const venda = await vender(itensMil(), [{ tipo: 'DINHEIRO', valor: 1160 }]);
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    const erro = await comPeriodoDeHojeFechado(() => capturarErro(() => anular(venda.id, 'Anular em período fechado')));

    esperarRegra(erro, 'PERIODO_FECHADO');
    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CONCLUIDA');
  });

  it('venda a dinheiro com a sessão de caixa da venda já fechada → SESSAO_CAIXA_FECHADA, nada escrito', async () => {
    const outro = await novoOperador();
    const venda = await vender(itensMil(), [{ tipo: 'DINHEIRO', valor: 1160 }], outro);
    await runCtx(outro.ctx, () => caixa.fecharSessao({ sessaoCaixaId: outro.sessaoCaixaId, fundoFinal: 2160 }, outro.ctx));
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    esperarRegra(await capturarErro(() => anular(venda.id, 'Anular com caixa fechada', outro)), 'SESSAO_CAIXA_FECHADA');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CONCLUIDA');
  });

  // -------------------------------------------------------------------------
  // Atomicidade
  // -------------------------------------------------------------------------

  it('falha injectada na devolução (conta 111 inactiva, depois da NC) reverte tudo: sem NC, lançamento, caixa nem stock; venda CONCLUIDA; série NC intacta', async () => {
    expect(typeof (vendaService as any).anular, 'vendaService.anular publicado').toBe('function');
    const venda = await vender(itensMil(), [{ tipo: 'DINHEIRO', valor: 1160 }]);
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);
    const conta111 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '111' } });
    expect(conta111).not.toBeNull();
    await db.contaPGC.update({ where: { id: conta111.id }, data: { ativo: false } });

    let erro: any;
    try {
      erro = await capturarErro(() => anular(venda.id, 'Anular com 111 inactiva'));
    } finally {
      await db.contaPGC.update({ where: { id: conta111.id }, data: { ativo: true } });
    }

    expect(erro, 'a anulação tinha de falhar com a conta 111 inactiva').toBeDefined();
    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(0);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CONCLUIDA');

    // Controlo positivo: com a 111 reposta, a mesma venda anula-se — a falha era a injectada.
    await anular(venda.id, 'Anular depois de repor a 111');
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CANCELADA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
  });

  it('invariante do tenant: toda a NC tem lançamento, toda a NC liquidada tem lançamento de liquidação, toda a venda POS CANCELADA tem NC', async () => {
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, lancamentoId: null } })).toBe(0);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, status: 'LIQUIDADA', lancamentoLiquidacaoId: null } })).toBe(0);
    const canceladas = await db.venda.findMany({ where: { tenantId: TENANT, origem: 'POS', status: 'CANCELADA' } });
    expect(canceladas.length).toBeGreaterThan(0);
    for (const v of canceladas) {
      expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: v.faturaId } }), `NC da venda ${v.numero}`).toBe(1);
    }
  });
});
