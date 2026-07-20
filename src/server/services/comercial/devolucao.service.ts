/**
 * DevolucaoService — WS-10 (Spec 10)
 *
 * Fluxo:
 *  criar     → PENDENTE (documento append-only; sem efeito de stock)
 *  aprovar   → APROVADA
 *  processar → PROCESSADA:
 *                a) emitirNotaCredito (contrato D — tx própria; append-only)
 *                b) prismaBase.$transaction: entradaStock + registarMovimentoCaixa + status=PROCESSADA
 *              Ordem: NC emitida 1.º; se falhar, devolução permanece APROVADA e pode ser re-tentada.
 *  rejeitar  → REJEITADA
 *
 * Documentos são append-only; a fatura original nunca é alterada.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import type { IFaturacaoService } from '@/server/services/financas/faturacao.interface';
import type { ICaixaService } from '@/server/services/financas/caixa.interface';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import { TRANSICOES_DEVOLUCAO } from '@/lib/state-machines';
import type {
  CreateDevolucaoInput,
  FilterDevolucaoInput,
} from '@/lib/validations/vendas';

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export interface ItemDevolucaoRow {
  id: string;
  tenantId: string;
  devolucaoId: string;
  produtoId: string;
  varianteId: string | null;
  nomeProduto: string;
  sku: string | null;
  quantidade: string;
  valorUnitario: string;
  taxaIva: string;
  subtotal: string;
  ivaItem: string;
  total: string;
  createdAt: Date;
}

export interface DevolucaoRow {
  id: string;
  tenantId: string;
  numero: string;
  clienteId: string;
  vendaId: string | null;
  faturaId: string | null;
  motivo: string;
  status: string;
  valorTotal: string;
  currency: string;
  notaCreditoId: string | null;
  reembolso: boolean;
  observacoes: string | null;
  aprovadoPorId: string | null;
  aprovadoEm: Date | null;
  processadoPorId: string | null;
  processadoEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DevolucaoCompleta extends DevolucaoRow {
  itens: ItemDevolucaoRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string {
  return v?.toString() ?? '0';
}

type PrismaDevolucao = {
  id: string;
  tenantId: string;
  numero: string;
  clienteId: string;
  vendaId: string | null;
  faturaId: string | null;
  motivo: string;
  status: string;
  valorTotal: Prisma.Decimal;
  currency: string;
  notaCreditoId: string | null;
  reembolso: boolean;
  observacoes: string | null;
  aprovadoPorId: string | null;
  aprovadoEm: Date | null;
  processadoPorId: string | null;
  processadoEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapDevolucao(d: PrismaDevolucao): DevolucaoRow {
  return {
    ...d,
    valorTotal: dec(d.valorTotal),
    motivo: d.motivo,
    status: d.status,
  };
}

type PrismaItemDevolucao = {
  id: string;
  tenantId: string;
  devolucaoId: string;
  produtoId: string;
  varianteId: string | null;
  nomeProduto: string;
  sku: string | null;
  quantidade: Prisma.Decimal;
  valorUnitario: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  createdAt: Date;
};

function mapItem(i: PrismaItemDevolucao): ItemDevolucaoRow {
  return {
    ...i,
    quantidade: dec(i.quantidade),
    valorUnitario: dec(i.valorUnitario),
    taxaIva: dec(i.taxaIva),
    subtotal: dec(i.subtotal),
    ivaItem: dec(i.ivaItem),
    total: dec(i.total),
  };
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class DevolucaoService {
  constructor(
    private readonly stockService: Pick<IStockService, 'entradaStock'>,
    private readonly faturacaoService: Pick<IFaturacaoService, 'emitirNotaCredito'>,
    private readonly caixaService: Pick<ICaixaService, 'registarMovimentoCaixa'>,
  ) {}

  async criar(input: CreateDevolucaoInput, ctx: Ctx): Promise<DevolucaoRow> {
    // Calcular valorTotal a partir dos itens
    let valorTotal = new Prisma.Decimal(0);
    for (const item of input.itens) {
      const qty = new Prisma.Decimal(item.quantidade);
      const val = new Prisma.Decimal(item.valorUnitario);
      const taxa = new Prisma.Decimal(item.taxaIva ?? 0.16);
      const base = qty.mul(val);
      const iva = base.mul(taxa);
      valorTotal = valorTotal.plus(base).plus(iva);
    }

    return prismaBase.$transaction(async (tx) => {
      const numero = await proximoNumeroSerie(tx, 'NOTA_DEVOLUCAO', ctx);

      const devolucao = await tx.devolucao.create({
        data: {
          tenantId: ctx.tenantId,
          numero,
          clienteId: input.clienteId,
          vendaId: input.vendaId ?? null,
          faturaId: input.faturaId ?? null,
          motivo: input.motivo as 'DEFEITO' | 'PRODUTO_ERRADO' | 'INSATISFACAO' | 'EXCESSO_PEDIDO' | 'AVARIA_TRANSPORTE' | 'OUTRO',
          reembolso: input.reembolso ?? false,
          observacoes: input.observacoes ?? null,
          valorTotal,
          itens: {
            create: input.itens.map((item) => {
              const qty = new Prisma.Decimal(item.quantidade);
              const val = new Prisma.Decimal(item.valorUnitario);
              const taxa = new Prisma.Decimal(item.taxaIva ?? 0.16);
              const base = qty.mul(val);
              const ivaItem = base.mul(taxa);

              return {
                tenantId: ctx.tenantId,
                produtoId: item.produtoId,
                varianteId: item.varianteId ?? null,
                nomeProduto: item.nomeProduto,
                sku: item.sku ?? null,
                quantidade: qty,
                valorUnitario: val,
                taxaIva: taxa,
                subtotal: base,
                ivaItem,
                total: base.plus(ivaItem),
              };
            }),
          },
        },
      });

      return mapDevolucao(devolucao as unknown as PrismaDevolucao);
    });
  }

  async obter(id: string, ctx: Ctx): Promise<DevolucaoCompleta> {
    const devolucao = await prismaBase.devolucao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { itens: { orderBy: { createdAt: 'asc' } } },
    });
    if (!devolucao) throw new NotFoundError('Devolução não encontrada');

    return {
      ...mapDevolucao(devolucao as unknown as PrismaDevolucao),
      itens: (devolucao.itens as unknown as PrismaItemDevolucao[]).map(mapItem),
    };
  }

  async listar(
    filter: FilterDevolucaoInput,
    ctx: Ctx,
  ): Promise<{ items: DevolucaoRow[]; nextCursor: string | null }> {
    const { take, cursor, q, status, motivo, clienteId, dataInicio, dataFim, orderBy, order } = filter;

    const where = {
      tenantId: ctx.tenantId,
      ...(status && { status: status as 'PENDENTE' | 'APROVADA' | 'PROCESSADA' | 'REJEITADA' }),
      ...(motivo && { motivo: motivo as 'DEFEITO' | 'PRODUTO_ERRADO' | 'INSATISFACAO' | 'EXCESSO_PEDIDO' | 'AVARIA_TRANSPORTE' | 'OUTRO' }),
      ...(clienteId && { clienteId }),
      ...(q && {
        OR: [
          { numero: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
      ...((dataInicio || dataFim) && {
        createdAt: {
          ...(dataInicio && { gte: dataInicio }),
          ...(dataFim && { lte: dataFim }),
        },
      }),
    };

    const result = await paginate<{ id: string }>(
      (args) =>
        prismaBase.devolucao.findMany({
          ...args,
          where,
          orderBy: { [orderBy]: order },
        }) as Promise<{ id: string }[]>,
      { cursor, take },
    );

    return {
      items: result.items.map((r) => mapDevolucao(r as unknown as PrismaDevolucao)),
      nextCursor: result.nextCursor,
    };
  }

  async aprovar(id: string, ctx: Ctx): Promise<DevolucaoRow> {
    const devolucao = await prismaBase.devolucao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!devolucao) throw new NotFoundError('Devolução não encontrada');

    const permitidas = TRANSICOES_DEVOLUCAO[devolucao.status] ?? [];
    if (!permitidas.includes('APROVADA')) {
      throw new BusinessRuleError(
        'TRANSICAO_INVALIDA',
        `Devolução: transição inválida ${devolucao.status} → APROVADA`,
      );
    }

    const updated = await prismaBase.devolucao.update({
      where: { id },
      data: { status: 'APROVADA', aprovadoPorId: ctx.userId, aprovadoEm: new Date() },
    });

    return mapDevolucao(updated as unknown as PrismaDevolucao);
  }

  /**
   * Processar devolução aprovada:
   *
   * Ordem de operações:
   * 1. Emitir nota de crédito (contrato D — tx própria, append-only, idempotente com numeração)
   * 2. prismaBase.$transaction:
   *    a. entradaStock por item (contrato A — aceita tx)
   *    b. registarMovimentoCaixa se reembolso=true (contrato D — aceita tx)
   *    c. devolucao.status = PROCESSADA + notaCreditoId
   *
   * Se a NC falhar, devolucao permanece APROVADA e pode ser re-tentada.
   * Se o tx falhar, a NC foi emitida mas a devolucao fica APROVADA — ao re-tentar,
   * a NC já existe mas a nova tentativa usa uma série nova (design append-only aceite).
   */
  async processar(
    id: string,
    ctx: Ctx,
    options?: {
      sessaoCaixaId?: string;
      localizacaoId?: string;
      serieNotaCreditoId?: string;
    },
  ): Promise<DevolucaoRow> {
    const devolucao = await prismaBase.devolucao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { itens: true },
    });
    if (!devolucao) throw new NotFoundError('Devolução não encontrada');

    const permitidas = TRANSICOES_DEVOLUCAO[devolucao.status] ?? [];
    if (!permitidas.includes('PROCESSADA')) {
      throw new BusinessRuleError(
        'TRANSICAO_INVALIDA',
        `Devolução: transição inválida ${devolucao.status} → PROCESSADA`,
      );
    }

    // 1. Emitir nota de crédito (tx própria do faturacaoService)
    let notaCreditoId: string | null = null;
    if (devolucao.faturaId && options?.serieNotaCreditoId) {
      const nc = await this.faturacaoService.emitirNotaCredito(
        {
          serieDocumentoId: options.serieNotaCreditoId,
          faturaOriginalId: devolucao.faturaId,
          motivo: `Devolução ${devolucao.numero}: ${devolucao.motivo}`,
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
            // subtotal, ivaItem, total calculados pelo transform do schema
            subtotal: Number(item.subtotal),
            ivaItem: Number(item.ivaItem),
            total: Number(item.total),
          })),
        },
        ctx,
      );
      notaCreditoId = nc.id;
    }

    // 2. Tx principal: stock + caixa + status
    return prismaBase.$transaction(async (tx) => {
      // a. Entrada de stock por item devolvido (contrato A)
      if (options?.localizacaoId) {
        for (const item of devolucao.itens) {
          await this.stockService.entradaStock(
            tx,
            {
              produtoId: item.produtoId,
              varianteProdutoId: item.varianteId ?? undefined,
              localizacaoDestinoId: options.localizacaoId,
              quantidade: Number(item.quantidade),
              documentoReferenciaId: devolucao.id,
              documentoReferenciaTipo: 'Devolucao',
            },
            ctx,
          );
        }
      }

      // b. Reembolso opcional via caixa (contrato D)
      if (devolucao.reembolso && options?.sessaoCaixaId) {
        await this.caixaService.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId: options.sessaoCaixaId,
            tipo: 'DEVOLUCAO',
            valor: devolucao.valorTotal,
            descricao: `Reembolso devolução ${devolucao.numero}`,
            documentoOrigemId: devolucao.id,
            documentoOrigemTipo: 'Devolucao',
          },
          ctx,
        );
      }

      // c. Marcar como PROCESSADA
      const updated = await tx.devolucao.update({
        where: { id },
        data: {
          status: 'PROCESSADA',
          processadoPorId: ctx.userId,
          processadoEm: new Date(),
          ...(notaCreditoId && { notaCreditoId }),
        },
      });

      return mapDevolucao(updated as unknown as PrismaDevolucao);
    });
  }

  async rejeitar(id: string, ctx: Ctx): Promise<DevolucaoRow> {
    const devolucao = await prismaBase.devolucao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!devolucao) throw new NotFoundError('Devolução não encontrada');

    const permitidas = TRANSICOES_DEVOLUCAO[devolucao.status] ?? [];
    if (!permitidas.includes('REJEITADA')) {
      throw new BusinessRuleError(
        'TRANSICAO_INVALIDA',
        `Devolução: transição inválida ${devolucao.status} → REJEITADA`,
      );
    }

    const updated = await prismaBase.devolucao.update({
      where: { id },
      data: { status: 'REJEITADA', aprovadoPorId: ctx.userId, aprovadoEm: new Date() },
    });

    return mapDevolucao(updated as unknown as PrismaDevolucao);
  }
}
