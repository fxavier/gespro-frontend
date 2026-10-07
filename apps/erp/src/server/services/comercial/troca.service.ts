/**
 * TrocaService — WS-10 (Spec 10), ADR-0041 §8
 *
 * Uma troca é uma devolução + uma venda nova, e fiscalmente é isso mesmo: a nota de crédito dos
 * bens devolvidos e uma Factura-Recibo nova para o substituto, pelo mesmo caminho da venda POS.
 * Tudo numa só `prismaBase.$transaction` — uma falha em qualquer passo não deixa nada (nem NC,
 * nem Venda, nem Fatura, nem Troca, nem números de série gastos):
 *
 *  1. Devolução trancada e relida (APROVADA, com factura).
 *  2. NC dos bens devolvidos pelo núcleo `emitirNotaCreditoEmTx` (D 711 / D 44331 / C 411).
 *  3. Entrada de stock do devolvido; Venda de substituição; baixa de stock do substituto.
 *  4. Factura-Recibo (série FATURA_RECIBO, PAGA) pelo núcleo `emitirDocumentoEmTx`, com o
 *     lançamento de `construirLancamentoVendaPOS`, ligada à venda nos dois sentidos.
 *  5. Compensação NC ↔ FR: o crédito da NC paga a FR até ao valor dela — é um pagamento
 *     CREDITO (D 411) no lançamento da FR, que anula o C 411 da NC; a NC fica LIQUIDADA por
 *     COMPENSACAO. Os `pagamentos` do input são só a diferença que o cliente paga; se o
 *     substituto vale menos, o excesso da NC devolve-se em dinheiro (D 411 / C 111 na liquidação
 *     + MovimentoCaixa DEVOLUCAO). Efeito líquido: 411 a zero, caixa/banco = diferença.
 *  6. Caixa: só a parte em DINHEIRO entra na gaveta (MovimentoCaixa VENDA).
 *  7. Devolução PROCESSADA com `notaCreditoId`; Troca criada.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import type { ICaixaService, IFaturacaoService, IMeioPagamentoPOSService } from '@/server/services/financas';
import { exigirEmailConfirmadoParaEmitir } from '@/server/services/financas';
import { TRANSICOES_DEVOLUCAO } from '@/lib/state-machines';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';
import type { CreateTrocaInput } from '@/lib/validations/vendas';
import { lerDevolucaoTrancada, notaCreditoDaDevolucaoEmTx } from './devolucao.service';
import { linhaDocumentoFiscal } from './venda.service';

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export interface TrocaRow {
  id: string;
  tenantId: string;
  numero: string;
  devolucaoId: string;
  vendaSubstituicaoId: string;
  diferenca: string;
  currency: string;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string {
  return v?.toString() ?? '0';
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class TrocaService {
  constructor(
    private readonly stockService: Pick<IStockService, 'entradaStock' | 'baixarStock'>,
    private readonly caixaService: Pick<ICaixaService, 'registarMovimentoCaixa'>,
    private readonly faturacaoService: Pick<
      IFaturacaoService,
      | 'proximoNumeroSerie'
      | 'emitirNotaCreditoEmTx'
      | 'liquidarNotaCreditoEmTx'
      | 'emitirDocumentoEmTx'
      | 'construirLancamentoVendaPOS'
      | 'motivoIsencaoAutomaticoEmTx'
    >,
    private readonly meioPagamentoPOSService: IMeioPagamentoPOSService,
  ) {}

  /**
   * Cria a troca (ADR-0041 §8, «Troca — como a NC paga a nova Factura-Recibo»): NC da devolução,
   * venda de substituição com Factura-Recibo e compensação NC ↔ FR numa só transacção.
   *
   * Compensação: o crédito da NC paga a FR até ao total dela — D 411 no lançamento da FR (como um
   * meio CREDITO) e a NC liquidada por COMPENSACAO, sem lançamento próprio. `input.pagamentos` é só
   * o que muda de mãos: Σ pagamentos = total da FR − compensado (senão PAGAMENTOS_NAO_BATEM_TOTAL).
   * Substituto mais barato: o excedente da NC devolve-se em numerário (D 411 / C 111 no lançamento
   * de liquidação + MovimentoCaixa DEVOLUCAO) — a única parte da compensação com lançamento.
   * A venda de substituição não se anula pelo POS (VENDA_DE_TROCA em `vendaService.anular`).
   *
   * Recusa sem escrever: TRANSICAO_INVALIDA (devolução não APROVADA), TROCA_SEM_FATURA,
   * SERIE_NC_OBRIGATORIA, NC_JA_LIQUIDADA, PAGAMENTOS_NAO_BATEM_TOTAL, TROCA_SEM_CREDITO,
   * SESSAO_CAIXA_NECESSARIA, e as dos núcleos (NC_EXCEDE_FATURA, PERIODO_FECHADO…).
   */
  async criar(input: CreateTrocaInput, ctx: Ctx): Promise<TrocaRow> {
    // Emite documentos fiscais: o travão de e-mail é de quem tem sessão (os núcleos não o aplicam).
    await exigirEmailConfirmadoParaEmitir();

    const novoItem = input.novoItem;
    const totais = calcularTotaisVendaPOS([
      { quantidade: novoItem.quantidade, precoUnitario: novoItem.precoUnitario, desconto: novoItem.desconto ?? 0, taxaIva: novoItem.taxaIva ?? 0.16 },
    ]);
    const linha = totais.linhas[0];
    const pagos = input.pagamentos.map((p) => ({ tipo: p.tipo, valor: new Prisma.Decimal(String(p.valor)) }));

    return prismaBase.$transaction(async (tx) => {
      const devolucao = await lerDevolucaoTrancada(tx, input.devolucaoId, ctx);
      // Mesma regra do `processar`: a troca leva a devolução APROVADA → PROCESSADA.
      const permitidas = TRANSICOES_DEVOLUCAO[devolucao.status] ?? [];
      if (!permitidas.includes('PROCESSADA')) {
        throw new BusinessRuleError(
          'TRANSICAO_INVALIDA',
          `Devolução: transição inválida ${devolucao.status} → PROCESSADA. A troca só se cria a partir de uma devolução aprovada.`,
        );
      }
      if (!devolucao.faturaId) {
        throw new BusinessRuleError(
          'TROCA_SEM_FATURA',
          `A devolução ${devolucao.numero} não está ligada a uma factura: sem nota de crédito não há crédito a abater na venda de substituição.`,
        );
      }
      if (!input.serieNotaCreditoId) {
        throw new BusinessRuleError(
          'SERIE_NC_OBRIGATORIA',
          'Esta devolução está associada a uma fatura. É obrigatório fornecer uma série de nota de crédito para a troca.',
        );
      }

      const agora = new Date();

      // 2. NC dos bens devolvidos (ou a que a devolução já traga, se ainda tiver crédito).
      const nc = await notaCreditoDaDevolucaoEmTx(
        this.faturacaoService,
        tx,
        devolucao,
        `Troca — devolução ${devolucao.numero}`,
        agora,
        ctx,
      );
      if (!nc) throw new NotFoundError('Nota de crédito da devolução não encontrada');
      if (nc.status !== 'EMITIDA') {
        throw new BusinessRuleError(
          'NC_JA_LIQUIDADA',
          `A nota de crédito ${nc.numero} da devolução ${devolucao.numero} está ${nc.status}: já não tem crédito a abater na troca.`,
        );
      }

      // 5. Compensação: o crédito da NC paga a FR até ao total dela; o resto é diferença.
      const compensado = Prisma.Decimal.min(nc.total, totais.total);
      const aDevolver = nc.total.minus(compensado);
      const pagoPeloCliente = pagos.reduce((a, p) => a.plus(p.valor), new Prisma.Decimal(0));
      const diferenca = totais.total.minus(compensado);
      if (!pagoPeloCliente.equals(diferenca)) {
        throw new BusinessRuleError(
          'PAGAMENTOS_NAO_BATEM_TOTAL',
          `A diferença a pagar na troca é ${diferenca.toFixed(2)} (substituto ${totais.total.toFixed(2)} − ` +
            `crédito ${compensado.toFixed(2)}), mas os pagamentos somam ${pagoPeloCliente.toFixed(2)}.`,
        );
      }
      if (pagos.some((p) => p.tipo === 'CREDITO')) {
        throw new BusinessRuleError(
          'TROCA_SEM_CREDITO',
          'A diferença de uma troca paga-se no acto: a crédito, emita uma factura em Facturação.',
        );
      }
      const dinheiro = pagos.filter((p) => p.tipo === 'DINHEIRO').reduce((a, p) => a.plus(p.valor), new Prisma.Decimal(0));
      if ((dinheiro.greaterThan(0) || aDevolver.greaterThan(0)) && !input.sessaoCaixaId) {
        throw new BusinessRuleError(
          'SESSAO_CAIXA_NECESSARIA',
          'Esta troca movimenta dinheiro: indique a sessão de caixa aberta.',
        );
      }

      // 3a. Entrada de stock do artigo devolvido
      if (input.localizacaoId) {
        for (const item of devolucao.itens) {
          await this.stockService.entradaStock(
            tx,
            {
              produtoId: item.produtoId,
              varianteProdutoId: item.varianteId ?? undefined,
              localizacaoDestinoId: input.localizacaoId,
              quantidade: Number(item.quantidade),
              documentoReferenciaId: devolucao.id,
              documentoReferenciaTipo: 'DevolucaoVenda',
            },
            ctx,
          );
        }
      }

      // 3b. Venda de substituição — os totais saem do mesmo cálculo da Factura-Recibo.
      const numeroVenda = await this.faturacaoService.proximoNumeroSerie(tx, 'VENDA', ctx, agora);
      const venda = await tx.venda.create({
        data: {
          tenantId: ctx.tenantId,
          numero: numeroVenda,
          origem: 'MANUAL',
          status: 'CONCLUIDA',
          clienteId: devolucao.clienteId,
          vendedorId: ctx.userId,
          sessaoCaixaId: input.sessaoCaixaId ?? null,
          subtotal: totais.subtotal,
          descontoTotal: new Prisma.Decimal(0),
          ivaTotal: totais.ivaTotal,
          total: totais.total,
          dataVenda: agora,
          observacoes: input.observacoes ?? `Troca referente a devolução ${devolucao.numero}`,
          itens: {
            create: [
              {
                tenantId: ctx.tenantId,
                produtoId: novoItem.produtoId,
                varianteId: novoItem.varianteId ?? null,
                nomeProduto: novoItem.nomeProduto,
                sku: novoItem.sku ?? null,
                quantidade: new Prisma.Decimal(String(novoItem.quantidade)),
                precoUnitario: new Prisma.Decimal(String(novoItem.precoUnitario)),
                desconto: new Prisma.Decimal(String(novoItem.desconto ?? 0)),
                taxaIva: new Prisma.Decimal(String(novoItem.taxaIva ?? 0.16)),
                subtotal: linha.subtotal,
                ivaItem: linha.ivaItem,
                total: linha.total,
              },
            ],
          },
          // Só o dinheiro que o cliente entregou; o crédito compensado está na NC (via Troca).
          pagamentos: {
            create: input.pagamentos.map((p) => ({
              tenantId: ctx.tenantId,
              tipo: p.tipo,
              valor: new Prisma.Decimal(String(p.valor)),
              referencia: p.referencia ?? null,
              troco: p.troco != null ? new Prisma.Decimal(String(p.troco)) : null,
            })),
          },
        },
      });

      // 3c. Baixar stock do artigo substituto
      if (input.localizacaoId) {
        await this.stockService.baixarStock(
          tx,
          {
            produtoId: novoItem.produtoId,
            varianteProdutoId: novoItem.varianteId ?? undefined,
            localizacaoOrigemId: input.localizacaoId,
            quantidade: Number(novoItem.quantidade),
            documentoReferenciaId: venda.id,
            documentoReferenciaTipo: 'Venda',
          },
          ctx,
        );
      }

      // 4. Factura-Recibo do substituto: D meios da diferença + D 411 pelo crédito compensado.
      const meios = compensado.greaterThan(0) ? [...pagos, { tipo: 'CREDITO' as const, valor: compensado }] : pagos;
      const contas = await this.meioPagamentoPOSService.resolverContasPagamentoPOS(tx, ctx);
      const motivoIsencao = await this.faturacaoService.motivoIsencaoAutomaticoEmTx(tx, ctx);
      const fatura = await this.faturacaoService.emitirDocumentoEmTx(
        tx,
        {
          clienteId: devolucao.clienteId,
          vendaId: venda.id,
          moeda: 'MZN',
          dataEmissao: agora,
          dataVencimento: agora,
          observacoes: `Troca — devolução ${devolucao.numero}, nota de crédito ${nc.numero}`,
          linhas: [
            linhaDocumentoFiscal(
              {
                produtoId: novoItem.produtoId,
                nomeProduto: novoItem.nomeProduto,
                quantidade: novoItem.quantidade,
                precoUnitario: novoItem.precoUnitario,
                taxaIva: novoItem.taxaIva ?? 0.16,
                ...linha,
              },
              0,
              motivoIsencao,
            ),
          ],
        },
        ctx,
        {
          tipoSerie: 'FATURA_RECIBO',
          construirLancamento: (doc) => this.faturacaoService.construirLancamentoVendaPOS(doc, meios, contas),
        },
      );
      await tx.venda.updateMany({ where: { id: venda.id, tenantId: ctx.tenantId }, data: { faturaId: fatura.id } });

      // 5. Liquidação da NC: compensada na FR e, se o substituto vale menos, o resto em dinheiro.
      await this.faturacaoService.liquidarNotaCreditoEmTx(
        tx,
        { notaCreditoId: nc.id, data: agora, numerario: aDevolver, compensado },
        ctx,
      );

      // 6. Caixa: entra o dinheiro da diferença; sai o excesso do crédito devolvido.
      if (input.sessaoCaixaId && dinheiro.greaterThan(0)) {
        await this.caixaService.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId: input.sessaoCaixaId,
            tipo: 'VENDA',
            valor: dinheiro,
            descricao: `Troca: diferença paga pelo cliente (${fatura.numero})`,
            documentoOrigemId: venda.id,
            documentoOrigemTipo: 'Troca',
          },
          ctx,
        );
      }
      if (input.sessaoCaixaId && aDevolver.greaterThan(0)) {
        await this.caixaService.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId: input.sessaoCaixaId,
            tipo: 'DEVOLUCAO',
            valor: aDevolver,
            descricao: `Troca: reembolso da diferença (NC ${nc.numero})`,
            documentoOrigemId: venda.id,
            documentoOrigemTipo: 'Troca',
          },
          ctx,
        );
      }

      // 7. Devolução PROCESSADA com a NC; Troca.
      await tx.devolucao.update({
        where: { id: devolucao.id },
        data: {
          status: 'PROCESSADA',
          processadoPorId: ctx.userId,
          processadoEm: agora,
          notaCreditoId: nc.id,
        },
      });

      const troca = await tx.troca.create({
        data: {
          tenantId: ctx.tenantId,
          numero: `TRC-${Date.now()}`,
          devolucaoId: devolucao.id,
          vendaSubstituicaoId: venda.id,
          // positiva = cliente pagou; negativa = crédito devolvido ao cliente
          diferenca: totais.total.minus(nc.total),
          observacoes: input.observacoes ?? null,
        },
      });

      return {
        id: troca.id,
        tenantId: troca.tenantId,
        numero: troca.numero,
        devolucaoId: troca.devolucaoId,
        vendaSubstituicaoId: troca.vendaSubstituicaoId,
        diferenca: dec(troca.diferenca),
        currency: troca.currency,
        observacoes: troca.observacoes,
        createdAt: troca.createdAt,
        updatedAt: troca.updatedAt,
      };
    });
  }

  async obter(id: string, ctx: Ctx): Promise<TrocaRow> {
    const troca = await prismaBase.troca.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!troca) throw new NotFoundError('Troca não encontrada');

    return {
      id: troca.id,
      tenantId: troca.tenantId,
      numero: troca.numero,
      devolucaoId: troca.devolucaoId,
      vendaSubstituicaoId: troca.vendaSubstituicaoId,
      diferenca: dec(troca.diferenca),
      currency: troca.currency,
      observacoes: troca.observacoes,
      createdAt: troca.createdAt,
      updatedAt: troca.updatedAt,
    };
  }

  /** A troca cuja venda de substituição é `vendaId`, se houver (ADR-0041 §8: essa venda não se anula pelo POS). */
  async trocaDaVenda(vendaId: string, ctx: Ctx): Promise<{ numero: string } | null> {
    return prismaBase.troca.findFirst({
      where: { tenantId: ctx.tenantId, vendaSubstituicaoId: vendaId },
      select: { numero: true },
    });
  }

  async listar(
    ctx: Ctx,
    opts?: { take?: number; cursor?: string },
  ): Promise<{ items: TrocaRow[]; nextCursor: string | null }> {
    const take = opts?.take ?? 25;
    const cursor = opts?.cursor;

    const rows = await prismaBase.troca.findMany({
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const items = rows.slice(0, take);
    const nextCursor = rows.length > take ? items[items.length - 1].id : null;

    return {
      items: items.map((t) => ({
        id: t.id,
        tenantId: t.tenantId,
        numero: t.numero,
        devolucaoId: t.devolucaoId,
        vendaSubstituicaoId: t.vendaSubstituicaoId,
        diferenca: dec(t.diferenca),
        currency: t.currency,
        observacoes: t.observacoes,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      nextCursor,
    };
  }
}
