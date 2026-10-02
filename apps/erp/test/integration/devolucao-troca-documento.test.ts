/**
 * Oráculo S8 — devolução e troca emitem NC (e nova Factura-Recibo) pelo núcleo em transacção
 * (ADR-0041 §3, §8; issue #312)
 *
 * Ponto de partida: venda POS paga em DINHEIRO pelo caminho real `vendaService.criar` (S2), com
 * Factura-Recibo e lançamento.
 *
 * `devolucaoService.processar(id, ctx, { localizacaoId, sessaoCaixaId, serieNotaCreditoId })`
 * (assinatura inalterada), numa só transacção:
 *   - NotaCredito pelo núcleo (`emitirNotaCreditoEmTx`) ligada à factura da venda, com
 *     `lancamentoId` cujas partidas são as de `construirLancamentoNotaCredito`;
 *   - reentrada de stock; com reembolso, `MovimentoCaixa` DEVOLUCAO pelo valor devolvido;
 *   - devolução PROCESSADA com `notaCreditoId`.
 *   Atomicidade: reembolso para uma sessão de caixa FECHADA → nada fica: nem NC nem lançamento,
 *   série NOTA_CREDITO intacta, devolução APROVADA com `notaCreditoId` null, stock intacto.
 *   Idempotência: re-processar não emite segunda NC; uma devolução que já traga `notaCreditoId`
 *   (resíduo do desenho antigo) reutiliza-a.
 *
 * `trocaService.criar(input, ctx)` (assinatura inalterada), numa só transacção:
 *   - NC dos bens devolvidos (como acima);
 *   - nova Venda de substituição com Factura-Recibo (série FATURA_RECIBO, PAGA, totalPago = total,
 *     ligada nos dois sentidos via `Venda.faturaId`/`Fatura.vendaId`) e lançamento com a forma de
 *     `construirLancamentoVendaPOS` (D meios / C 711 subtotal / C 44331 IVA);
 *   - stock: entrada do devolvido, saída do substituto; diferença paga em dinheiro na caixa.
 *   O efeito contabilístico líquido de TODOS os lançamentos criados pela troca é o da diferença:
 *   411 a zero (o cliente não fica a dever nem a haver), 111 = diferença em dinheiro,
 *   711/44331 = diferença de receita/IVA. Não se fixa se a compensação NC↔FR passa por um
 *   pagamento CREDITO (D 411) na FR ou por liquidação da NC — só o efeito.
 *   Atomicidade: sessão de caixa fechada (falha depois da NC) ou conta 111 inactiva (falha no
 *   lançamento da FR) → nada fica: nem NC, nem Venda, nem Fatura, nem Troca; séries intactas.
 *
 * Invariante do tenant no fim: nenhuma Venda de troca sem `faturaId`; nenhuma Fatura/NC sem
 * `lancamentoId`.
 *
 * Contra Postgres real (Testcontainers), harness dos oráculos S2/S7. A sessão (auth) é o único duplo.
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

describe.skipIf(skip)('Devolução e troca → NC (e nova Factura-Recibo) atómicas — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let comercial: typeof import('@/server/services/comercial');
  let validacoes: typeof import('@/lib/validations/vendas');
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let faturacao: typeof import('@/server/services/financas/faturacao.service');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-dev-troca-${sufixo}`;
  let seq = 0;

  /** Artigo A (vendido e devolvido) e artigo B (substituto na troca). */
  let produtoA: string;
  let produtoB: string;
  let localizacaoId: string;
  let op: Operador;
  let serieNCId: string;

  // ── utilidades ─────────────────────────────────────────────────────────────
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
    const userId = `cdevtroca${sufixo}u${seq}`;
    await db.user.create({
      data: { id: userId, tenantId: TENANT, email: `dev-troca-${sufixo}-${seq}@test.mz`, nome: `Operador ${seq}`, keycloakSub: `kc-dev-troca-${sufixo}-${seq}` },
    });
    const ctx = { tenantId: TENANT, userId };
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 5000 }, ctx));
    const sp = await db.sessaoPOS.create({ data: { tenantId: TENANT, vendedorId: userId, sessaoCaixaId: sc.id, status: 'ABERTA' } });
    return { ctx, sessaoCaixaId: sc.id, sessaoPOSId: sp.id };
  }

  async function fecharCaixa(quem: Operador) {
    await runCtx(quem.ctx, () => caixa.fecharSessao({ sessaoCaixaId: quem.sessaoCaixaId, fundoFinal: 0 }, quem.ctx));
  }

  /** Venda POS de `quantidade` × A a 1000 + 16%, paga em DINHEIRO; devolve a venda com factura. */
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
    expect(venda?.faturaId, 'pré-condição: venda POS com Factura-Recibo (S2)').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    expect(fatura.lancamentoId, 'pré-condição: factura com lançamento').toBeTruthy();
    return { venda, fatura };
  }

  /** Devolução APROVADA de `quantidade` × A, contra a factura da venda. */
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
      comercial.devolucaoService.processar(devolucaoId, quem.ctx, {
        localizacaoId,
        serieNotaCreditoId: serieNCId,
        ...opcoes,
      }),
    );
  }

  function trocar(input: Record<string, unknown>, quem: Operador = op) {
    const parsed = validacoes.CreateTrocaSchema.parse({ localizacaoId, serieNotaCreditoId: serieNCId, ...input });
    return runCtx(quem.ctx, () => comercial.trocaService.criar(parsed, quem.ctx));
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

  /** Σ (D − C) por conta, a 2 casas; contas a zero omitidas. */
  function liquidoPorConta(partidas: Partida[]): Record<string, string> {
    const m = new Map<string, Prisma.Decimal>();
    for (const p of partidas) m.set(p.codigo, (m.get(p.codigo) ?? ZERO).plus(p.tipo === 'DEBITO' ? p.valor : p.valor.negated()));
    return Object.fromEntries([...m].filter(([, v]) => !v.isZero()).map(([k, v]) => [k, v.toFixed(2)]));
  }

  const chave = (p: Partida) => `${p.codigo}|${p.tipo}|${p.valor.toFixed(2)}`;

  async function esperarLancamentoNC(nc: any) {
    expect(nc.lancamentoId, 'NotaCredito.lancamentoId').toBeTruthy();
    const lanc = await db.lancamento.findFirst({ where: { id: nc.lancamentoId, tenantId: TENANT } });
    expect(lanc.status).toBe('LANCADO');
    expect(lanc.documentoOrigemTipo).toBe('NotaCredito');
    expect(lanc.documentoOrigemId).toBe(nc.id);
    const esperado = faturacao.construirLancamentoNotaCredito({
      id: nc.id,
      numero: nc.numero,
      total: dec(nc.total),
      subtotal: dec(nc.subtotal),
      ivaTotal: dec(nc.ivaTotal),
      dataEmissao: nc.dataEmissao,
    });
    expect((await partidasDe(nc.lancamentoId)).map(chave).sort()).toEqual(
      esperado.partidas.map((p) => chave({ codigo: p.contaCodigo, tipo: p.tipo, valor: dec(p.valor) })).sort(),
    );
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
      linhasNotaCredito: await db.linhaNotaCredito.count({ where: { tenantId: TENANT } }),
      faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
      vendas: await db.venda.count({ where: { tenantId: TENANT } }),
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
      data: { id: TENANT, nome: 'Tenant Devolução/Troca', slug: `dev-troca-${sufixo}`, nuit: `4${String(sufixo).slice(-8)}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-DT-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    for (const [sku, nome, preco] of [
      [`SKU-DT-A-${sufixo}`, 'Artigo A', 1000],
      [`SKU-DT-B-${sufixo}`, 'Artigo B', 1500],
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
  // Devolução — processar
  // =========================================================================

  it('processar (devolve 1 de 2, reembolso em dinheiro): NC 1160 ligada à factura com lançamento = construirLancamentoNotaCredito, PROCESSADA com notaCreditoId, stock +1, DEVOLUCAO 1160 na caixa', async () => {
    const { venda, fatura } = await venderA(2);
    const dev = await devolucaoAprovada(venda, fatura, 1, true);
    const antes = await contagens();
    const fotoFatura = await db.fatura.findFirst({ where: { id: fatura.id } });

    await processar(dev.id, { sessaoCaixaId: op.sessaoCaixaId });

    const depoisDev = await db.devolucao.findFirst({ where: { id: dev.id, tenantId: TENANT } });
    expect(depoisDev.status).toBe('PROCESSADA');
    expect(depoisDev.notaCreditoId, 'Devolucao.notaCreditoId').toBeTruthy();

    const ncs = await db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId: fatura.id }, include: { linhas: true, serieDocumento: true } });
    expect(ncs, 'uma NC para a factura').toHaveLength(1);
    const nc = ncs[0];
    expect(nc.id).toBe(depoisDev.notaCreditoId);
    expect(nc.serieDocumento.tipo).toBe('NOTA_CREDITO');
    expect(dec(nc.subtotal).toFixed(2)).toBe('1000.00');
    expect(dec(nc.ivaTotal).toFixed(2)).toBe('160.00');
    expect(dec(nc.total).toFixed(2)).toBe('1160.00');
    expect(nc.linhas).toHaveLength(1);
    expect(nc.linhas[0].produtoId).toBe(produtoA);
    await esperarLancamentoNC(nc);

    const reembolsos = await db.movimentoCaixa.findMany({ where: { tenantId: TENANT, tipo: 'DEVOLUCAO', documentoOrigemId: dev.id } });
    expect(reembolsos).toHaveLength(1);
    expect(reembolsos[0].sessaoCaixaId).toBe(op.sessaoCaixaId);
    expect(dec(reembolsos[0].valor).toFixed(2)).toBe('1160.00');

    const depois = await contagens();
    expect(depois.saldoA).toBe(dec(antes.saldoA).plus(1).toString());
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.serieNC).toBe(antes.serieNC + 1);
    expect(depois.faturas).toBe(antes.faturas);
    // Factura original intacta (append-only).
    expect(await db.fatura.findFirst({ where: { id: fatura.id } })).toEqual(fotoFatura);
  });

  it('processar duas vezes: a segunda recusa (TRANSICAO_INVALIDA) e não emite segunda NC', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    await processar(dev.id, {});
    const antes = await contagens();

    const erro = await capturarErro(() => processar(dev.id, {}));
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('TRANSICAO_INVALIDA');

    expect(await contagens()).toEqual(antes);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } })).toBe(1);
  });

  it('devolução APROVADA que já traz notaCreditoId (resíduo do desenho antigo) reutiliza-a: nenhuma NC nova, série intacta, PROCESSADA com a mesma NC', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const ncAntiga: any = await runCtx(op.ctx, () =>
      faturacao.emitirNotaCredito(
        {
          faturaOriginalId: fatura.id,
          motivo: 'NC emitida antes de uma falha (desenho antigo)',
          moeda: 'MZN',
          dataEmissao: new Date(),
          linhas: [{ produtoId: produtoA, descricao: 'Artigo A', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16, ordemLinha: 1, subtotal: 1000, ivaItem: 160, total: 1160 }],
        } as any,
        op.ctx,
      ),
    );
    await db.devolucao.update({ where: { id: dev.id }, data: { notaCreditoId: ncAntiga.id } });
    const antes = await contagens();

    await processar(dev.id, {});

    const depois = await contagens();
    expect(depois.notasCredito).toBe(antes.notasCredito);
    expect(depois.serieNC).toBe(antes.serieNC);
    const d = await estadoDevolucao(dev.id);
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId).toBe(ncAntiga.id);
  });

  it('atomicidade: reembolso para sessão de caixa FECHADA → nada fica (sem NC órfã, série NC intacta, devolução APROVADA sem notaCreditoId, stock intacto)', async () => {
    const outro = await novoOperador();
    const { venda, fatura } = await venderA(1, outro);
    const dev = await devolucaoAprovada(venda, fatura, 1, true, outro);
    await fecharCaixa(outro);
    const antes = await contagens();
    const devAntes = await estadoDevolucao(dev.id);

    const erro = await capturarErro(() => processar(dev.id, { sessaoCaixaId: outro.sessaoCaixaId }, outro));

    expect(erro, 'processar tinha de falhar com a caixa fechada').toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('SESSAO_CAIXA_FECHADA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } }), 'NC órfã').toBe(0);
    expect(await contagens()).toEqual(antes);
    expect(await estadoDevolucao(dev.id)).toEqual(devAntes);

    // Controlo positivo: com uma caixa aberta, a mesma devolução processa-se.
    await processar(dev.id, { sessaoCaixaId: op.sessaoCaixaId }, outro);
    const d = await estadoDevolucao(dev.id);
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId).toBeTruthy();
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } })).toBe(1);
  });

  // =========================================================================
  // Troca
  // =========================================================================

  /** Verifica a troca: NC, nova Venda com Factura-Recibo, efeito líquido, stock e caixa. */
  async function verificarTroca(
    r: any,
    ctxTroca: { fatura: any; dev: any; antes: Awaited<ReturnType<typeof contagens>>; lancAntes: Set<string> },
    esperado: { frSubtotal: string; frIva: string; frTotal: string; dinheiro: string; liquido: Record<string, string>; qtdB: number },
  ) {
    const { fatura, dev, antes, lancAntes } = ctxTroca;

    // ── NC dos bens devolvidos ──
    const ncs = await db.notaCredito.findMany({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } });
    expect(ncs, 'uma NC dos bens devolvidos').toHaveLength(1);
    const nc = ncs[0];
    expect(dec(nc.total).toFixed(2)).toBe('1160.00');
    await esperarLancamentoNC(nc);
    const d = await estadoDevolucao(dev.id);
    expect(d.status).toBe('PROCESSADA');
    expect(d.notaCreditoId).toBe(nc.id);

    // ── nova Venda + Factura-Recibo ──
    const troca = await db.troca.findFirst({ where: { id: r.id, tenantId: TENANT } });
    expect(troca.devolucaoId).toBe(dev.id);
    const venda = await db.venda.findFirst({ where: { id: troca.vendaSubstituicaoId, tenantId: TENANT } });
    expect(venda.faturaId, 'Venda de substituição com faturaId').toBeTruthy();
    const fr = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT }, include: { serieDocumento: true, linhas: true } });
    expect(fr.vendaId).toBe(venda.id);
    expect(fr.serieDocumento.tipo).toBe('FATURA_RECIBO');
    expect(fr.status).toBe('PAGA');
    expect(dec(fr.totalPago).equals(dec(fr.total))).toBe(true);
    expect(dec(fr.subtotal).toFixed(2)).toBe(esperado.frSubtotal);
    expect(dec(fr.ivaTotal).toFixed(2)).toBe(esperado.frIva);
    expect(dec(fr.total).toFixed(2)).toBe(esperado.frTotal);
    expect(dec(fr.total).equals(dec(venda.total))).toBe(true);
    expect(fr.linhas).toHaveLength(1);
    expect(fr.linhas[0].produtoId).toBe(produtoB);

    // Lançamento da FR com a forma de construirLancamentoVendaPOS.
    expect(fr.lancamentoId, 'Fatura.lancamentoId').toBeTruthy();
    const lanc = await db.lancamento.findFirst({ where: { id: fr.lancamentoId, tenantId: TENANT } });
    expect(lanc.status).toBe('LANCADO');
    expect(lanc.origem).toBe('VENDA');
    expect(lanc.documentoOrigemTipo).toBe('Fatura');
    expect(lanc.documentoOrigemId).toBe(fr.id);
    const pFR = await partidasDe(fr.lancamentoId);
    expect(somar(pFR, 'CREDITO').toFixed(2)).toBe(esperado.frTotal);
    expect(somar(pFR, 'DEBITO').toFixed(2)).toBe(esperado.frTotal);
    expect(somar(pFR, 'CREDITO', '711').toFixed(2)).toBe(esperado.frSubtotal);
    expect(somar(pFR, 'CREDITO', '44331').toFixed(2)).toBe(esperado.frIva);
    expect(pFR.filter((p) => p.tipo === 'CREDITO').every((p) => ['711', '44331'].includes(p.codigo))).toBe(true);
    expect(pFR.filter((p) => p.tipo === 'DEBITO').every((p) => ['111', '121', '411'].includes(p.codigo)), 'débitos só em contas de meio').toBe(true);
    // Reconstrói os pagamentos a partir dos débitos e compara com a função pura.
    const meioDe: Record<string, string> = { '111': 'DINHEIRO', '121': 'CARTAO', '411': 'CREDITO' };
    const recon = faturacao.construirLancamentoVendaPOS(
      { id: fr.id, numero: fr.numero, dataEmissao: fr.dataEmissao, subtotal: dec(fr.subtotal), ivaTotal: dec(fr.ivaTotal), total: dec(fr.total) },
      pFR.filter((p) => p.tipo === 'DEBITO').map((p) => ({ tipo: meioDe[p.codigo] as never, valor: p.valor })),
    );
    expect(pFR.map(chave).sort()).toEqual(recon.partidas.map((p) => chave({ codigo: p.contaCodigo, tipo: p.tipo, valor: dec(p.valor) })).sort());

    // ── efeito líquido de todos os lançamentos da troca = só a diferença ──
    expect(liquidoPorConta(await partidasDosNovos(lancAntes)), 'efeito líquido da troca por conta (411 a zero)').toEqual(esperado.liquido);

    // ── stock, caixa, séries ──
    const depois = await contagens();
    expect(depois.saldoA, 'devolvido reentra').toBe(dec(antes.saldoA).plus(1).toString());
    expect(depois.saldoB, 'substituto sai').toBe(dec(antes.saldoB).minus(esperado.qtdB).toString());
    const movs = await db.movimentoCaixa.findMany({ where: { tenantId: TENANT } });
    const novosMovs = movs.length - antes.movimentosCaixa;
    const liquidoCaixa = movs
      .filter((m: any) => m.sessaoCaixaId === op.sessaoCaixaId && ['VENDA', 'DEVOLUCAO'].includes(m.tipo))
      .reduce((a: Prisma.Decimal, m: any) => (m.tipo === 'VENDA' ? a.plus(dec(m.valor)) : a.minus(dec(m.valor))), ZERO);
    if (dec(esperado.dinheiro).isZero()) expect(novosMovs, 'troca sem diferença não mexe na caixa').toBe(0);
    else expect(novosMovs).toBeGreaterThan(0);
    expect(depois.notasCredito).toBe(antes.notasCredito + 1);
    expect(depois.faturas).toBe(antes.faturas + 1);
    expect(depois.vendas).toBe(antes.vendas + 1);
    expect(depois.trocas).toBe(antes.trocas + 1);
    expect(depois.serieNC).toBe(antes.serieNC + 1);
    expect(depois.serieFR).toBe(antes.serieFR + 1);
    return { liquidoCaixa };
  }

  it('troca A(1160) → B(1740), diferença 580 em dinheiro: NC 1160 + Factura-Recibo 1740 PAGA com lançamento; efeito líquido 411 = 0, 111 = +580, 711 = −500, 44331 = −80; stock A +1, B −1', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const lancAntes = await idsLancamentos();
    const caixaAntes = (await db.movimentoCaixa.findMany({ where: { tenantId: TENANT, sessaoCaixaId: op.sessaoCaixaId } }))
      .filter((m: any) => ['VENDA', 'DEVOLUCAO'].includes(m.tipo))
      .reduce((a: Prisma.Decimal, m: any) => (m.tipo === 'VENDA' ? a.plus(dec(m.valor)) : a.minus(dec(m.valor))), ZERO);

    const r = await trocar({
      devolucaoId: dev.id,
      novoItem: { produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario: 1500, desconto: 0, taxaIva: 0.16 },
      sessaoCaixaId: op.sessaoCaixaId,
      pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }],
    });

    const { liquidoCaixa } = await verificarTroca(r, { fatura, dev, antes, lancAntes }, {
      frSubtotal: '1500.00',
      frIva: '240.00',
      frTotal: '1740.00',
      dinheiro: '580',
      liquido: { '111': '580.00', '711': '-500.00', '44331': '-80.00' },
      qtdB: 1,
    });
    expect(liquidoCaixa.minus(caixaAntes).toFixed(2), 'entrada líquida na caixa = diferença').toBe('580.00');
  });

  it('troca de igual valor A(1160) → B a 1000 (1160), sem pagamentos: NC + Factura-Recibo 1160 PAGA, efeito líquido nulo em todas as contas, caixa intacta', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const lancAntes = await idsLancamentos();

    const r = await trocar({
      devolucaoId: dev.id,
      novoItem: { produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
      sessaoCaixaId: op.sessaoCaixaId,
      pagamentos: [],
    });

    await verificarTroca(r, { fatura, dev, antes, lancAntes }, {
      frSubtotal: '1000.00',
      frIva: '160.00',
      frTotal: '1160.00',
      dinheiro: '0',
      liquido: {},
      qtdB: 1,
    });
  });

  it('atomicidade da troca: sessão de caixa FECHADA (falha depois da NC) → nada fica: sem NC, Venda, Fatura nem Troca; séries NC/FR/VENDA intactas; devolução APROVADA', async () => {
    const outro = await novoOperador();
    const { venda, fatura } = await venderA(1, outro);
    const dev = await devolucaoAprovada(venda, fatura, 1, false, outro);
    await fecharCaixa(outro);
    const antes = await contagens();
    const devAntes = await estadoDevolucao(dev.id);

    const erro = await capturarErro(() =>
      trocar(
        {
          devolucaoId: dev.id,
          novoItem: { produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario: 1500, desconto: 0, taxaIva: 0.16 },
          sessaoCaixaId: outro.sessaoCaixaId,
          pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }],
        },
        outro,
      ),
    );

    expect(erro, 'a troca tinha de falhar com a caixa fechada').toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('SESSAO_CAIXA_FECHADA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } }), 'NC órfã').toBe(0);
    expect(await contagens()).toEqual(antes);
    expect(await estadoDevolucao(dev.id)).toEqual(devAntes);
  });

  it('atomicidade da troca: conta 111 inactiva (falha no lançamento da nova Factura-Recibo) → nada fica; com a 111 reposta a mesma troca passa', async () => {
    const { venda, fatura } = await venderA(1);
    const dev = await devolucaoAprovada(venda, fatura, 1, false);
    const antes = await contagens();
    const devAntes = await estadoDevolucao(dev.id);
    const input = {
      devolucaoId: dev.id,
      novoItem: { produtoId: produtoB, nomeProduto: 'Artigo B', quantidade: 1, precoUnitario: 1500, desconto: 0, taxaIva: 0.16 },
      sessaoCaixaId: op.sessaoCaixaId,
      pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }],
    };
    const conta111 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '111' } });
    expect(conta111).not.toBeNull();
    await db.contaPGC.update({ where: { id: conta111.id }, data: { ativo: false } });

    let erro: any;
    try {
      erro = await capturarErro(() => trocar(input));
    } finally {
      await db.contaPGC.update({ where: { id: conta111.id }, data: { ativo: true } });
    }

    expect(erro, 'a troca tinha de falhar: a Factura-Recibo debita 111 pela diferença em dinheiro').toBeDefined();
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } }), 'NC órfã').toBe(0);
    expect(await contagens()).toEqual(antes);
    expect(await estadoDevolucao(dev.id)).toEqual(devAntes);

    // Controlo positivo.
    await trocar(input);
    expect((await estadoDevolucao(dev.id)).status).toBe('PROCESSADA');
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, faturaOriginalId: fatura.id } })).toBe(1);
  });

  // =========================================================================
  // Invariante do tenant
  // =========================================================================

  it('invariante do tenant: nenhuma Venda de troca sem faturaId; nenhuma Fatura nem NC sem lancamentoId', async () => {
    const trocas = await db.troca.findMany({ where: { tenantId: TENANT } });
    expect(trocas.length).toBeGreaterThan(0);
    for (const t of trocas) {
      const v = await db.venda.findFirst({ where: { id: t.vendaSubstituicaoId, tenantId: TENANT } });
      expect(v.faturaId, `Venda de troca ${v.numero} sem faturaId`).toBeTruthy();
    }
    expect(await db.fatura.count({ where: { tenantId: TENANT, lancamentoId: null } })).toBe(0);
    expect(await db.notaCredito.count({ where: { tenantId: TENANT, lancamentoId: null } })).toBe(0);
  });
});
