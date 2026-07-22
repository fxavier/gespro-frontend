/**
 * TrocaService — WS-10 (Spec 10)
 *
 * Compõe:
 *  0. Emitir NC dos bens devolvidos (contrato D — tx própria, antes do $tx principal)
 *     MAJOR 5: NC obrigatória se devolucao.faturaId + serieNotaCreditoId
 *  1. Processar devolução (entrada de stock do artigo devolvido)
 *  2. Criar nova venda do artigo substituto (baixarStock)
 *  3. Liquidar diferença de valor (a favor do cliente ou da empresa)
 *  4. Marcar devolução PROCESSADA + criar Troca
 *
 * NC é emitida ANTES do $transaction principal (tx própria do faturacaoService).
 * Tudo o resto em prismaBase.$transaction único.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import type { ICaixaService } from '@/server/services/financas/caixa.interface';
import type { IFaturacaoService } from '@/server/services/financas/faturacao.interface';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import type { CreateTrocaInput } from '@/lib/validations/vendas';

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
    private readonly faturacaoService: Pick<IFaturacaoService, 'emitirNotaCredito'>,
  ) {}

  /**
   * Criar troca:
   *
   * 0. [Se faturaId + serieNotaCreditoId]: emitir NC da devolução (tx própria)
   * 1. prismaBase.$transaction:
   *    a. entradaStock do artigo devolvido (contrato A)
   *    b. Criar Venda do artigo substituto (nova numeração)
   *    c. baixarStock do artigo substituto (contrato A)
   *    d. Acerto de caixa se diferença != 0 (contrato D caixa)
   *    e. Marcar devolucao como PROCESSADA + notaCreditoId se emitida
   *    f. Criar Troca
   */
  async criar(input: CreateTrocaInput, ctx: Ctx): Promise<TrocaRow> {
    const devolucao = await prismaBase.devolucao.findFirst({
      where: { id: input.devolucaoId, tenantId: ctx.tenantId },
      include: { itens: true },
    });
    if (!devolucao) throw new NotFoundError('Devolução não encontrada');

    if (devolucao.status !== 'APROVADA') {
      throw new BusinessRuleError(
        'DEVOLUCAO_INVALIDA',
        'Troca só pode ser criada a partir de uma devolução aprovada.',
      );
    }

    // 0. Emitir NC dos bens devolvidos — MAJOR 5 (tx própria, antes do $tx principal)
    //    Guard: se fatura presente, serieNotaCreditoId é obrigatório (consistente com BLOCKER 3).
    if (devolucao.faturaId && !input.serieNotaCreditoId) {
      throw new BusinessRuleError(
        'SERIE_NC_OBRIGATORIA',
        'Esta devolução está associada a uma fatura. É obrigatório fornecer uma série de nota de crédito para a troca.',
      );
    }

    // Idempotência: reutilizar NC já emitida se existir (evita duplo estorno)
    let notaCreditoId: string | null = (devolucao.notaCreditoId as string | null) ?? null;

    if (devolucao.faturaId && input.serieNotaCreditoId && !notaCreditoId) {
      const nc = await this.faturacaoService.emitirNotaCredito(
        {
          serieDocumentoId: input.serieNotaCreditoId,
          faturaOriginalId: devolucao.faturaId,
          motivo: `Troca — devolução ${devolucao.numero}`,
          moeda: 'MZN',
          dataEmissao: new Date(),
          linhas: devolucao.itens.map((item, idx) => ({
            produtoId: item.produtoId,
            descricao: item.nomeProduto,
            quantidade: Number(item.quantidade),
            precoUnitario: Number(item.valorUnitario),
            desconto: 0,
            taxaIva: Number(item.taxaIva),
            ordemLinha: idx + 1,
            subtotal: Number(item.subtotal),
            ivaItem: Number(item.ivaItem),
            total: Number(item.total),
          })),
        },
        ctx,
      );
      notaCreditoId = nc.id;
    }

    return prismaBase.$transaction(async (tx) => {
      // a. Entrada de stock do artigo devolvido
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

      // b. Calcular totais do artigo substituto
      const novoItem = input.novoItem;
      const qty = new Prisma.Decimal(novoItem.quantidade);
      const preco = new Prisma.Decimal(novoItem.precoUnitario);
      const desc = new Prisma.Decimal(novoItem.desconto ?? 0).div(100);
      const taxa = new Prisma.Decimal(novoItem.taxaIva ?? 0.16);
      const baseItem = qty.mul(preco).mul(new Prisma.Decimal(1).minus(desc));
      const ivaItem = baseItem.mul(taxa);
      const totalItem = baseItem.plus(ivaItem);

      // Criar Venda de substituição
      const numeroVenda = await proximoNumeroSerie(tx, 'VENDA', ctx);
      const venda = await tx.venda.create({
        data: {
          tenantId: ctx.tenantId,
          numero: numeroVenda,
          origem: 'MANUAL',
          status: 'CONCLUIDA',
          clienteId: devolucao.clienteId,
          vendedorId: ctx.userId,
          sessaoCaixaId: input.sessaoCaixaId ?? null,
          subtotal: baseItem,
          descontoTotal: new Prisma.Decimal(0),
          ivaTotal: ivaItem,
          total: totalItem,
          observacoes: input.observacoes ?? `Troca referente a devolução ${devolucao.numero}`,
          itens: {
            create: [
              {
                tenantId: ctx.tenantId,
                produtoId: novoItem.produtoId,
                varianteId: novoItem.varianteId ?? null,
                nomeProduto: novoItem.nomeProduto,
                sku: novoItem.sku ?? null,
                quantidade: qty,
                precoUnitario: preco,
                desconto: new Prisma.Decimal(novoItem.desconto ?? 0),
                taxaIva: taxa,
                subtotal: baseItem,
                ivaItem,
                total: totalItem,
              },
            ],
          },
          pagamentos: {
            create: input.pagamentos.map((p) => ({
              tenantId: ctx.tenantId,
              tipo: p.tipo as 'DINHEIRO' | 'CARTAO' | 'TRANSFERENCIA' | 'MPESA' | 'EMOLA' | 'CREDITO',
              valor: new Prisma.Decimal(p.valor),
              referencia: p.referencia ?? null,
              troco: p.troco != null ? new Prisma.Decimal(p.troco) : null,
            })),
          },
        },
      });

      // c. Baixar stock do artigo substituto
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

      // d. Calcular diferença de valor (positivo = cliente deve; negativo = empresa deve)
      const valorDevolvido = devolucao.valorTotal as Prisma.Decimal;
      const diferenca = totalItem.minus(valorDevolvido);

      // d2. Acerto de caixa se diferença != 0 e sessão de caixa fornecida
      if (!diferenca.isZero() && input.sessaoCaixaId) {
        const tipoMovimento = diferenca.isPositive() ? 'VENDA' : 'DEVOLUCAO';
        await this.caixaService.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId: input.sessaoCaixaId,
            tipo: tipoMovimento,
            valor: diferenca.abs(),
            descricao: diferenca.isPositive()
              ? `Troca: cliente pagou diferença`
              : `Troca: reembolso de diferença ao cliente`,
            documentoOrigemId: venda.id,
            documentoOrigemTipo: 'Troca',
          },
          ctx,
        );
      }

      // e. Marcar devolucao como PROCESSADA + notaCreditoId se emitida (MAJOR 5)
      await tx.devolucao.update({
        where: { id: devolucao.id },
        data: {
          status: 'PROCESSADA',
          processadoPorId: ctx.userId,
          processadoEm: new Date(),
          ...(notaCreditoId && { notaCreditoId }),
        },
      });

      // f. Criar Troca
      const numeroTroca = `TRC-${Date.now()}`;
      const troca = await tx.troca.create({
        data: {
          tenantId: ctx.tenantId,
          numero: numeroTroca,
          devolucaoId: devolucao.id,
          vendaSubstituicaoId: venda.id,
          diferenca,
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
