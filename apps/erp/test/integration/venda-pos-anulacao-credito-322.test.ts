/**
 * Oráculo #322 — anular uma venda POS a crédito ou mista (ADR-0041 §8; follow-up de #311)
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (decisão do orquestrador): `vendaService.anular(vendaId, { motivo }, ctx)` deixa de
 * recusar a venda POS FATURADA (Factura série FATURA, D 411 pela parte a crédito) com
 * VENDA_A_CREDITO_NAO_ANULAVEL. Numa só transacção:
 *   - UMA nota de crédito TOTAL sobre a factura da venda (`faturaOriginalId`), creditando todas
 *     as linhas, `motivo` gravado, `lancamentoId` = `construirLancamentoNotaCredito`
 *     (D 711 subtotal, D 44331 IVA, C 411 total);
 *   - a parte a CRÉDITO liquida-se por COMPENSACAO contra a factura: `Fatura.totalPago` sobe a
 *     parte a crédito (= total) e a factura fica PAGA (saldo em aberto zero) — a regra de estado
 *     do `liquidarNotaCredito`/COMPENSACAO. A compensação não tem lançamento próprio;
 *   - a parte PAGA devolve-se pelos meios originais como na venda paga: um lançamento
 *     D 411 (parte paga) / C nas mesmas contas e valores que a factura debitou fora da 411, em
 *     `NotaCredito.lancamentoLiquidacaoId`; só crédito ⇒ sem lançamento de liquidação
 *     (`lancamentoLiquidacaoId` nulo);
 *   - NC LIQUIDADA, `formaLiquidacao` COMPENSACAO (há parte compensada — convenção do
 *     `liquidarNotaCreditoEmTx`);
 *   - `MovimentoCaixa` DEVOLUCAO = parte em DINHEIRO, na sessão de caixa da venda; sem dinheiro
 *     não mexe na caixa;
 *   - reentrada de stock por item; venda CANCELADA com histórico FATURADA → CANCELADA que cita
 *     a NC e o motivo; nenhuma comissão da venda fica PENDENTE;
 *   - as linhas e o lançamento da factura ficam intactos (só `totalPago`/`status`/`dataPagamento`
 *     mudam, pela compensação);
 *   - efeito líquido ZERO por conta sobre factura + NC + liquidação.
 *
 * Decisões conservadoras deste oráculo (tratadas como contrato):
 *   - Se, depois da venda, a factura já recebeu pagamentos fora do POS (o saldo em aberto é
 *     inferior à parte a crédito), a anulação RECUSA com `NC_COMPENSACAO_EXCEDE_SALDO` e não
 *     escreve nada — não se inventa por que meio devolver o que foi recebido em Facturação.
 *   - Recusas e atomicidade iguais às da venda paga: VENDA_JA_ANULADA, PERIODO_FECHADO,
 *     SESSAO_CAIXA_FECHADA (parte em dinheiro com a caixa da venda fechada), falha injectada
 *     depois da NC (conta 111 inactiva) ⇒ nada fica, nem a compensação na factura.
 *
 * Harness: o de `venda-pos-anulacao.test.ts` / `venda-pos-credito.test.ts` — tenant pelos
 * serviços reais (`bootstrapContabilidade`, caixa, `resolverPeriodo`), vendas pelo caminho real
 * `vendaService.criar`, recebimento posterior pelo `registarPagamento` real. A sessão (auth) é
 * o único duplo.
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
type Pagamento = { tipo: string; valor: number; troco?: number; referencia?: string };

describe.skipIf(skip)('#322 — anular venda POS a crédito/mista: NC total + compensação + devolução da parte paga + stock — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let resolverPeriodo: (typeof import('@/server/services/financas/contabilidade.service'))['resolverPeriodo'];
  let periodoFiscalDe: (typeof import('@/server/services/financas/contabilidade.service'))['periodoFiscalDe'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-anul-cred-${sufixo}`;
  let seq = 0;

  let produtoId: string;
  let localizacaoId: string;
  let clienteId: string;
  let op: Operador;

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
    const userId = `cposanulcred${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId: TENANT,
        email: `pos-anul-cred-${sufixo}-${seq}@test.mz`,
        nome: `Vendedor ${seq}`,
        keycloakSub: `kc-pos-anul-cred-${sufixo}-${seq}`,
      },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  /** Venda POS a crédito/mista pelo caminho real; pré-condição: FATURADA com Factura (série FATURA). */
  async function venderACredito(itens: unknown[], pagamentos: Pagamento[], quem: Operador = op) {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: quem.ctx.userId,
      sessaoPOSId: quem.sessaoPOSId,
      sessaoCaixaId: quem.sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      clienteId,
      itens,
      pagamentos,
    });
    const row: any = await runCtx(quem.ctx, () => vendaService.criar(input, quem.ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.status, 'pré-condição: venda a crédito FATURADA').toBe('FATURADA');
    expect(venda?.faturaId, 'pré-condição: venda com Factura').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT }, include: { serieDocumento: true } });
    expect(fatura.serieDocumento.tipo, 'pré-condição: série FATURA').toBe('FATURA');
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

  function liquidoPorConta(partidas: Partida[]): Map<string, Prisma.Decimal> {
    const m = new Map<string, Prisma.Decimal>();
    for (const p of partidas) {
      const v = p.tipo === 'DEBITO' ? p.valor : p.valor.negated();
      m.set(p.codigo, (m.get(p.codigo) ?? ZERO).plus(v));
    }
    return m;
  }

  function porConta(partidas: Partida[], tipo: string, excluir: string[] = []): Record<string, string> {
    const r: Record<string, Prisma.Decimal> = {};
    for (const p of partidas.filter((x) => x.tipo === tipo && !excluir.includes(x.codigo))) {
      r[p.codigo] = (r[p.codigo] ?? ZERO).plus(p.valor);
    }
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
      faturasPagas: await db.fatura.count({ where: { tenantId: TENANT, status: 'PAGA' } }),
      vendasCanceladas: await db.venda.count({ where: { tenantId: TENANT, status: 'CANCELADA' } }),
      historicos: await db.historicoEstadoVenda.count({ where: { tenantId: TENANT } }),
      saldo: await saldoStock(),
      serieNC: await proximoNumeroDaSerie('NOTA_CREDITO'),
    };
  }

  /** Factura inteira (linha persistida), linhas e lançamento com partidas. */
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
   * Anula e verifica o contrato inteiro. `pagos` = parte paga por meio (sem o CREDITO);
   * `dinheiro` = parte em DINHEIRO (líquida de troco).
   */
  async function anularEVerificar(
    venda: any,
    opts: { parteCredito: Prisma.Decimal; partePaga: Prisma.Decimal; dinheiro: Prisma.Decimal; nItens: number; quantidade: number },
  ) {
    const motivo = `Cliente devolveu tudo (${venda.numero})`;
    const antes = await contagens();
    const fotoAntes = await fotografiaFatura(venda.faturaId);
    const devolucoesAntes = await db.movimentoCaixa.count({ where: { tenantId: TENANT, tipo: 'DEVOLUCAO' } });
    const entradasAntes = await db.movimentoStock.findMany({ where: { tenantId: TENANT, tipo: 'ENTRADA' }, select: { id: true } });
    const saldoAntes = dec(antes.saldo);

    // Pré-condição: a factura tem a parte a crédito em aberto.
    const fAntes = fotoAntes.fatura;
    expect(dec(fAntes.total).minus(dec(fAntes.totalPago)).toFixed(2), 'pré-condição: saldo em aberto = parte a crédito').toBe(
      opts.parteCredito.toFixed(2),
    );

    await anular(venda.id, motivo);

    // ── venda ──
    const vendaDepois = await db.venda.findFirst({ where: { id: venda.id, tenantId: TENANT } });
    expect(vendaDepois.status).toBe('CANCELADA');
    expect(vendaDepois.faturaId).toBe(venda.faturaId);
    const hist = await db.historicoEstadoVenda.findMany({ where: { tenantId: TENANT, vendaId: venda.id }, orderBy: { createdAt: 'asc' } });
    const ultimo = hist[hist.length - 1];
    expect(ultimo.estadoAntes).toBe('FATURADA');
    expect(ultimo.estadoDepois).toBe('CANCELADA');
    expect(await db.comissao.count({ where: { tenantId: TENANT, vendaId: venda.id, status: 'PENDENTE' } }), 'comissão PENDENTE da venda').toBe(0);

    // ── factura: documento intacto; só a compensação mexe no recebido ──
    const fotoDepois = await fotografiaFatura(venda.faturaId);
    expect(fotoDepois.linhas, 'linhas da factura intactas').toEqual(fotoAntes.linhas);
    expect(fotoDepois.lanc, 'lançamento da factura intacto').toEqual(fotoAntes.lanc);
    expect(fotoDepois.partidas, 'partidas da factura intactas').toEqual(fotoAntes.partidas);
    expect(fotoDepois.lanc.status).toBe('LANCADO');
    const fatura = fotoDepois.fatura;
    for (const campo of ['numero', 'subtotal', 'ivaTotal', 'total', 'clienteId', 'nuitCliente', 'lancamentoId', 'dataEmissao', 'serieDocumentoId', 'vendaId']) {
      expect(fatura[campo], `Fatura.${campo} intacto`).toEqual(fAntes[campo]);
    }
    expect(dec(fatura.totalPago).toFixed(2), 'compensação: totalPago = total').toBe(dec(fatura.total).toFixed(2));
    expect(fatura.status, 'compensação: factura saldada').toBe('PAGA');

    // ── nota de crédito total ──
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
    expect(ultimo.motivo, 'histórico cita a NC').toContain(nc.numero);
    expect(ultimo.motivo, 'histórico cita o motivo').toContain(motivo);

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
    expect(somar(partidasNC, 'CREDITO', '411').equals(dec(fatura.total))).toBe(true);

    // ── liquidação: compensação da parte a crédito + devolução da parte paga ──
    expect(nc.status).toBe('LIQUIDADA');
    expect(nc.formaLiquidacao).toBe('COMPENSACAO');
    expect(nc.dataLiquidacao, 'NotaCredito.dataLiquidacao').toBeTruthy();
    const partidasFatura = await partidasDe(fatura.lancamentoId);
    let partidasLiq: Partida[] = [];
    if (opts.partePaga.greaterThan(0)) {
      expect(nc.lancamentoLiquidacaoId, 'parte paga ⇒ lançamento de liquidação').toBeTruthy();
      const lancLiq = await db.lancamento.findFirst({ where: { id: nc.lancamentoLiquidacaoId, tenantId: TENANT } });
      expect(lancLiq.status).toBe('LANCADO');
      partidasLiq = await partidasDe(nc.lancamentoLiquidacaoId);
      expect(porConta(partidasLiq, 'DEBITO'), 'liquidação: só D 411 pela parte paga').toEqual({ '411': opts.partePaga.toFixed(2) });
      expect(porConta(partidasLiq, 'CREDITO'), 'liquidação: C nas contas e valores que a factura debitou fora da 411').toEqual(
        porConta(partidasFatura, 'DEBITO', ['411']),
      );
    } else {
      expect(nc.lancamentoLiquidacaoId, 'só crédito ⇒ compensação sem lançamento').toBeNull();
    }

    // ── efeito líquido zero por conta ──
    const liquido = liquidoPorConta([...partidasFatura, ...partidasNC, ...partidasLiq]);
    for (const [conta, v] of liquido) {
      expect(v.toFixed(2), `efeito líquido na conta ${conta}`).toBe('0.00');
    }
    for (const conta of ['411', '711', '44331']) expect(liquido.has(conta), `conta ${conta} tocada`).toBe(true);

    // ── caixa ──
    const depois = await contagens();
    const devolucoes = await db.movimentoCaixa.findMany({ where: { tenantId: TENANT, tipo: 'DEVOLUCAO' } });
    if (opts.dinheiro.greaterThan(0)) {
      expect(devolucoes.length).toBe(devolucoesAntes + 1);
      const nova = devolucoes.sort((a: any, b: any) => +b.createdAt - +a.createdAt)[0];
      expect(nova.sessaoCaixaId, 'DEVOLUCAO na sessão de caixa da venda').toBe(venda.sessaoCaixaId);
      expect(dec(nova.valor).toFixed(2)).toBe(opts.dinheiro.toFixed(2));
      expect(depois.movimentosCaixa).toBe(antes.movimentosCaixa + 1);
    } else {
      expect(devolucoes.length).toBe(devolucoesAntes);
      expect(depois.movimentosCaixa, 'sem dinheiro não mexe na caixa').toBe(antes.movimentosCaixa);
    }

    // ── stock ──
    const idsAntes = new Set(entradasAntes.map((m: any) => m.id));
    const novasEntradas = (await db.movimentoStock.findMany({ where: { tenantId: TENANT, tipo: 'ENTRADA' } })).filter(
      (m: any) => !idsAntes.has(m.id),
    );
    expect(novasEntradas, 'uma entrada de stock por item').toHaveLength(opts.nItens);
    expect(novasEntradas.every((m: any) => m.produtoId === produtoId)).toBe(true);
    expect(novasEntradas.reduce((a: Prisma.Decimal, m: any) => a.plus(dec(m.quantidade)), ZERO).toFixed(2)).toBe(
      dec(opts.quantidade).toFixed(2),
    );
    expect(dec(depois.saldo).equals(saldoAntes.plus(opts.quantidade)), 'saldo reposto').toBe(true);

    // ── contagens ──
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.serieNC).toBe(antes.serieNC + 1);
    expect(depois.faturas, 'nenhuma factura nova').toBe(antes.faturas);
    expect(depois.lancamentos, 'NC (+ liquidação da parte paga)').toBe(antes.lancamentos + (opts.partePaga.greaterThan(0) ? 2 : 1));
    expect(depois.movimentosStock).toBe(antes.movimentosStock + opts.nItens);
    expect(depois.vendasCanceladas).toBe(antes.vendasCanceladas + 1);

    // ── saldo do cliente: nada fica em aberto desta venda ──
    const abertas = await db.fatura.findMany({
      where: { tenantId: TENANT, clienteId, id: fatura.id, status: { in: ['EMITIDA', 'PARCIALMENTE_PAGA', 'VENCIDA'] } },
    });
    expect(abertas, 'a factura da venda anulada não fica em dívida').toHaveLength(0);

    return { nc, fatura };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    caixa = await import('@/server/services/financas/caixa.service');
    fat = await import('@/server/services/financas/faturacao.service');
    ({ resolverPeriodo, periodoFiscalDe } = await import('@/server/services/financas/contabilidade.service'));
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS Anulação a Crédito', slug: `pos-anul-cred-${sufixo}`, nuit: `5${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-ANUL-CRED-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-ANUL-CRED-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });

    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente a Crédito #322',
        tipo: 'JURIDICA',
        nuit: '400000322',
        email: `cliente-pos-anul-cred-${sufixo}@test.mz`,
        telefone: '840000322',
        codigo: `CLI-POS-ANUL-CRED-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 10_000_000,
      },
    });
    clienteId = cliente.id;

    op = await novoOperador();
  });

  // -------------------------------------------------------------------------
  // Caminho feliz
  // -------------------------------------------------------------------------

  it('só crédito (1160): NC total compensada na factura (PAGA, sem lançamento de liquidação), sem caixa, stock reposto, venda CANCELADA, efeito líquido zero', async () => {
    const venda = await venderACredito(itensMil(), [{ tipo: 'CREDITO', valor: 1160 }]);
    await anularEVerificar(venda, { parteCredito: dec(1160), partePaga: ZERO, dinheiro: ZERO, nItens: 1, quantidade: 1 });
  });

  it('só crédito, 4 linhas com cêntimos (139,28): NC credita todas as linhas, 4 entradas de stock', async () => {
    const venda = await venderACredito(itensMisturados(), [{ tipo: 'CREDITO', valor: 139.28 }]);
    const { nc } = await anularEVerificar(venda, { parteCredito: dec('139.28'), partePaga: ZERO, dinheiro: ZERO, nItens: 4, quantidade: 6 });
    expect(dec(nc.total).toFixed(2)).toBe('139.28');
  });

  it('mista DINHEIRO 160 + CREDITO 1000: compensa 1000, devolve 160 (D 411 / C 111) com DEVOLUCAO de 160 na caixa da venda', async () => {
    const venda = await venderACredito(itensMil(), [
      { tipo: 'DINHEIRO', valor: 160 },
      { tipo: 'CREDITO', valor: 1000 },
    ]);
    const { nc } = await anularEVerificar(venda, { parteCredito: dec(1000), partePaga: dec(160), dinheiro: dec(160), nItens: 1, quantidade: 1 });
    const liq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(somar(liq, 'DEBITO', '411').toFixed(2)).toBe('160.00');
    expect(somar(liq, 'CREDITO', '111').toFixed(2)).toBe('160.00');
  });

  it('mista MPESA 200 + CREDITO 960: compensa 960, devolve 200 pela conta do meio (C 121), nenhum movimento de caixa', async () => {
    const venda = await venderACredito(itensMil(), [
      { tipo: 'MPESA', valor: 200, referencia: 'MP-322' },
      { tipo: 'CREDITO', valor: 960 },
    ]);
    const { nc } = await anularEVerificar(venda, { parteCredito: dec(960), partePaga: dec(200), dinheiro: ZERO, nItens: 1, quantidade: 1 });
    const liq = await partidasDe(nc.lancamentoLiquidacaoId);
    expect(somar(liq, 'CREDITO', '121').toFixed(2)).toBe('200.00');
    expect(somar(liq, 'CREDITO', '111').toFixed(2)).toBe('0.00');
  });

  // -------------------------------------------------------------------------
  // Recusas — nada escrito
  // -------------------------------------------------------------------------

  it('anular duas vezes uma venda a crédito → VENDA_JA_ANULADA, nada escrito', async () => {
    const venda = await venderACredito(itensMil(), [{ tipo: 'CREDITO', valor: 1160 }]);
    await anular(venda.id, 'Primeira anulação');
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    esperarRegra(await capturarErro(() => anular(venda.id, 'Segunda anulação')), 'VENDA_JA_ANULADA');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
  });

  it('factura já recebeu parte da dívida em Facturação (saldo < parte a crédito) → NC_COMPENSACAO_EXCEDE_SALDO, nada escrito, venda FATURADA', async () => {
    const venda = await venderACredito(itensMil(), [{ tipo: 'CREDITO', valor: 1160 }]);
    const ctxComPermissao = { ...op.ctx, permissions: new Set(['caixa:operar']) };
    await runCtx(op.ctx, () =>
      fat.registarPagamento({ faturaId: venda.faturaId, valor: 500, dataPagamento: new Date(), formaPagamento: 'NUMERARIO' as const }, ctxComPermissao),
    );
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);
    expect(foto.fatura.status, 'pré-condição: factura parcialmente paga').toBe('PARCIALMENTE_PAGA');

    esperarRegra(await capturarErro(() => anular(venda.id, 'Anular com recebimento posterior')), 'NC_COMPENSACAO_EXCEDE_SALDO');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('FATURADA');
  });

  it('período de hoje fechado → PERIODO_FECHADO, nada escrito (nem a compensação), série NC intacta', async () => {
    const venda = await venderACredito(itensMil(), [{ tipo: 'CREDITO', valor: 1160 }]);
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    const erro = await comPeriodoDeHojeFechado(() => capturarErro(() => anular(venda.id, 'Anular em período fechado')));

    esperarRegra(erro, 'PERIODO_FECHADO');
    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('FATURADA');
  });

  it('mista com dinheiro e a sessão de caixa da venda já fechada → SESSAO_CAIXA_FECHADA, nada escrito', async () => {
    const outro = await novoOperador();
    const venda = await venderACredito(
      itensMil(),
      [
        { tipo: 'DINHEIRO', valor: 160 },
        { tipo: 'CREDITO', valor: 1000 },
      ],
      outro,
    );
    await runCtx(outro.ctx, () => caixa.fecharSessao({ sessaoCaixaId: outro.sessaoCaixaId, fundoFinal: 1160 }, outro.ctx));
    const antes = await contagens();
    const foto = await fotografiaFatura(venda.faturaId);

    esperarRegra(await capturarErro(() => anular(venda.id, 'Anular com caixa fechada', outro)), 'SESSAO_CAIXA_FECHADA');

    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('FATURADA');
  });

  // -------------------------------------------------------------------------
  // Atomicidade
  // -------------------------------------------------------------------------

  it('mista: falha injectada na devolução (conta 111 inactiva, depois da NC) reverte tudo — sem NC, lançamento, caixa, stock nem compensação; venda FATURADA', async () => {
    const venda = await venderACredito(itensMil(), [
      { tipo: 'DINHEIRO', valor: 160 },
      { tipo: 'CREDITO', valor: 1000 },
    ]);
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
    expect(erro?.code, 'falha pela conta inactiva, não pela recusa antiga').not.toBe('VENDA_A_CREDITO_NAO_ANULAVEL');
    expect(await contagens()).toEqual(antes);
    expect(await fotografiaFatura(venda.faturaId)).toEqual(foto);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(0);
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('FATURADA');

    // Controlo positivo: com a 111 reposta, a mesma venda anula-se.
    await anular(venda.id, 'Anular depois de repor a 111');
    expect((await db.venda.findFirst({ where: { id: venda.id } })).status).toBe('CANCELADA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: venda.faturaId } })).toBe(1);
  });

  it('invariante do tenant: toda a NC tem lançamento; toda a venda POS CANCELADA tem exactamente uma NC LIQUIDADA; nenhuma factura de venda cancelada fica em dívida', async () => {
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, lancamentoId: null } })).toBe(0);
    const canceladas = await db.venda.findMany({ where: { tenantId: TENANT, origem: 'POS', status: 'CANCELADA' } });
    expect(canceladas.length).toBeGreaterThan(0);
    for (const v of canceladas) {
      const ncs = await db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId: v.faturaId } });
      expect(ncs, `NC da venda ${v.numero}`).toHaveLength(1);
      expect(ncs[0].status).toBe('LIQUIDADA');
      const f = await db.fatura.findFirst({ where: { id: v.faturaId, tenantId: TENANT } });
      expect(f.status, `factura da venda ${v.numero}`).toBe('PAGA');
    }
  });
});
