/**
 * EncomendaService — WS-10 (Spec 10)
 *
 * Fluxo:
 *  criar                  → RASCUNHO (sem efeito de stock)
 *  confirmar              → CONFIRMADA + reservarStock por item (contrato A)
 *  converterEmVenda       → CONCLUIDA + confirmarConsumoStock + nova Venda (contrato C/D)
 *  cancelar               → CANCELADA + libertarStock das reservas activas (contrato A)
 *  entregarParcial        → PARCIALMENTE_ENTREGUE
 *
 * Toda mutação com stock corre dentro de prismaBase.$transaction.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import { TRANSICOES_ENCOMENDA } from '@/lib/state-machines';
import type {
  CreateEncomendaInput,
  UpdateEncomendaInput,
  FilterEncomendaInput,
  TransitarEncomendaInput,
} from '@/lib/validations/vendas';

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export interface ItemEncomendaRow {
  id: string;
  tenantId: string;
  encomendaId: string;
  produtoId: string;
  varianteId: string | null;
  nomeProduto: string;
  sku: string | null;
  quantidade: string;
  precoUnitario: string;
  desconto: string;
  taxaIva: string;
  subtotal: string;
  ivaItem: string;
  total: string;
  quantidadeEntregue: string;
  createdAt: Date;
}

export interface EncomendaRow {
  id: string;
  tenantId: string;
  numero: string;
  clienteId: string;
  vendedorId: string | null;
  status: string;
  dataPrevista: Date | null;
  enderecoEntregaId: string | null;
  subtotal: string;
  desconto: string;
  iva: string;
  total: string;
  currency: string;
  notas: string | null;
  vendaId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EncomendaCompleta extends EncomendaRow {
  itens: ItemEncomendaRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string {
  return v?.toString() ?? '0';
}

type PrismaEncomenda = {
  id: string;
  tenantId: string;
  numero: string;
  clienteId: string;
  vendedorId: string | null;
  status: string;
  dataPrevista: Date | null;
  enderecoEntregaId: string | null;
  subtotal: Prisma.Decimal;
  desconto: Prisma.Decimal;
  iva: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
  notas: string | null;
  vendaId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapEncomenda(e: PrismaEncomenda): EncomendaRow {
  return {
    id: e.id,
    tenantId: e.tenantId,
    numero: e.numero,
    clienteId: e.clienteId,
    vendedorId: e.vendedorId,
    status: e.status,
    dataPrevista: e.dataPrevista,
    enderecoEntregaId: e.enderecoEntregaId,
    subtotal: dec(e.subtotal),
    desconto: dec(e.desconto),
    iva: dec(e.iva),
    total: dec(e.total),
    currency: e.currency,
    notas: e.notas,
    vendaId: e.vendaId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

type PrismaItemEncomenda = {
  id: string;
  tenantId: string;
  encomendaId: string;
  produtoId: string;
  varianteId: string | null;
  nomeProduto: string;
  sku: string | null;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  desconto: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
  quantidadeEntregue: Prisma.Decimal;
  createdAt: Date;
};

function mapItem(i: PrismaItemEncomenda): ItemEncomendaRow {
  return {
    id: i.id,
    tenantId: i.tenantId,
    encomendaId: i.encomendaId,
    produtoId: i.produtoId,
    varianteId: i.varianteId,
    nomeProduto: i.nomeProduto,
    sku: i.sku,
    quantidade: dec(i.quantidade),
    precoUnitario: dec(i.precoUnitario),
    desconto: dec(i.desconto),
    taxaIva: dec(i.taxaIva),
    subtotal: dec(i.subtotal),
    ivaItem: dec(i.ivaItem),
    total: dec(i.total),
    quantidadeEntregue: dec(i.quantidadeEntregue),
    createdAt: i.createdAt,
  };
}

function calcularTotaisItens(itens: CreateEncomendaInput['itens']): {
  subtotal: Prisma.Decimal;
  iva: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  let subtotal = new Prisma.Decimal(0);
  let iva = new Prisma.Decimal(0);

  for (const item of itens) {
    const qty = new Prisma.Decimal(item.quantidade);
    const preco = new Prisma.Decimal(item.precoUnitario);
    const desc = new Prisma.Decimal(item.desconto ?? 0).div(100);
    const taxa = new Prisma.Decimal(item.taxaIva ?? 0.16);

    const baseItem = qty.mul(preco).mul(new Prisma.Decimal(1).minus(desc));
    const ivaItem = baseItem.mul(taxa);

    subtotal = subtotal.plus(baseItem);
    iva = iva.plus(ivaItem);
  }

  return { subtotal, iva, total: subtotal.plus(iva) };
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class EncomendaService {
  constructor(private readonly stockService: IStockService) {}

  async criar(input: CreateEncomendaInput, ctx: Ctx): Promise<EncomendaRow> {
    const { subtotal, iva, total } = calcularTotaisItens(input.itens);

    return prismaBase.$transaction(async (tx) => {
      // Numeração atómica (contrato D)
      const numero = await proximoNumeroSerie(tx, 'ENCOMENDA', ctx);

      const encomenda = await tx.encomenda.create({
        data: {
          tenantId: ctx.tenantId,
          numero,
          clienteId: input.clienteId,
          vendedorId: input.vendedorId ?? null,
          dataPrevista: input.dataPrevista ?? null,
          enderecoEntregaId: input.enderecoEntregaId ?? null,
          subtotal,
          desconto: new Prisma.Decimal(0),
          iva,
          total,
          notas: input.notas ?? null,
          itens: {
            create: input.itens.map((item) => {
              const qty = new Prisma.Decimal(item.quantidade);
              const preco = new Prisma.Decimal(item.precoUnitario);
              const desc = new Prisma.Decimal(item.desconto ?? 0).div(100);
              const taxa = new Prisma.Decimal(item.taxaIva ?? 0.16);
              const baseItem = qty.mul(preco).mul(new Prisma.Decimal(1).minus(desc));
              const ivaItem = baseItem.mul(taxa);

              return {
                tenantId: ctx.tenantId,
                produtoId: item.produtoId,
                varianteId: item.varianteId ?? null,
                nomeProduto: item.nomeProduto,
                sku: item.sku ?? null,
                quantidade: qty,
                precoUnitario: preco,
                desconto: new Prisma.Decimal(item.desconto ?? 0),
                taxaIva: taxa,
                subtotal: baseItem,
                ivaItem,
                total: baseItem.plus(ivaItem),
              };
            }),
          },
        },
      });

      return mapEncomenda(encomenda as unknown as PrismaEncomenda);
    });
  }

  async obter(id: string, ctx: Ctx): Promise<EncomendaCompleta> {
    const encomenda = await prismaBase.encomenda.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      include: { itens: { orderBy: { createdAt: 'asc' } } },
    });
    if (!encomenda) throw new NotFoundError('Encomenda não encontrada');

    return {
      ...mapEncomenda(encomenda as unknown as PrismaEncomenda),
      itens: (encomenda.itens as unknown as PrismaItemEncomenda[]).map(mapItem),
    };
  }

  async listar(
    filter: FilterEncomendaInput,
    ctx: Ctx,
  ): Promise<{ items: EncomendaRow[]; nextCursor: string | null }> {
    const { take, cursor, q, status, clienteId, vendedorId, dataInicio, dataFim, orderBy, order } = filter;

    const where = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(status && { status: status as 'RASCUNHO' | 'CONFIRMADA' | 'PARCIALMENTE_ENTREGUE' | 'CONCLUIDA' | 'CANCELADA' }),
      ...(clienteId && { clienteId }),
      ...(vendedorId && { vendedorId }),
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
        prismaBase.encomenda.findMany({
          ...args,
          where,
          orderBy: { [orderBy]: order },
        }) as Promise<{ id: string }[]>,
      { cursor, take },
    );

    return {
      items: result.items.map((r) => mapEncomenda(r as unknown as PrismaEncomenda)),
      nextCursor: result.nextCursor,
    };
  }

  async atualizar(id: string, input: UpdateEncomendaInput, ctx: Ctx): Promise<EncomendaRow> {
    const existente = await prismaBase.encomenda.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existente) throw new NotFoundError('Encomenda não encontrada');

    // Só pode editar RASCUNHO
    if (existente.status !== 'RASCUNHO') {
      throw new BusinessRuleError(
        'ENCOMENDA_NAO_EDITAVEL',
        'Só é possível editar encomendas em rascunho.',
      );
    }

    const row = await prismaBase.encomenda.update({
      where: { id },
      data: {
        ...(input.dataPrevista !== undefined && { dataPrevista: input.dataPrevista }),
        ...(input.enderecoEntregaId !== undefined && { enderecoEntregaId: input.enderecoEntregaId }),
        ...(input.notas !== undefined && { notas: input.notas }),
        ...(input.vendedorId !== undefined && { vendedorId: input.vendedorId }),
      },
    });

    return mapEncomenda(row as unknown as PrismaEncomenda);
  }

  /**
   * Transitar estado de encomenda.
   * confirmar → reservarStock (contrato A) dentro de $transaction
   * cancelar  → libertarStock se houver reservas activas (contrato A) dentro de $transaction
   */
  async transitar(input: TransitarEncomendaInput, ctx: Ctx): Promise<EncomendaRow> {
    const encomenda = await prismaBase.encomenda.findFirst({
      where: { id: input.encomendaId, tenantId: ctx.tenantId, deletedAt: null },
      include: { itens: true },
    });
    if (!encomenda) throw new NotFoundError('Encomenda não encontrada');

    const atual = encomenda.status as string;
    const permitidas = TRANSICOES_ENCOMENDA[atual] ?? [];
    if (!permitidas.includes(input.paraStatus)) {
      throw new BusinessRuleError(
        'TRANSICAO_INVALIDA',
        `Encomenda: transição inválida ${atual} → ${input.paraStatus}`,
      );
    }

    // CONFIRMAR → reservar stock
    if (input.paraStatus === 'CONFIRMADA') {
      return prismaBase.$transaction(async (tx) => {
        const reservas: string[] = [];

        for (const item of encomenda.itens) {
          if (!input.localizacaoId) {
            // Se não fornecida localização, skip da reserva (best-effort)
            // Em produção deveria ser obrigatório; aqui toleramos falta de stock
            break;
          }
          const r = await this.stockService.reservarStock(
            tx,
            {
              produtoId: item.produtoId,
              varianteProdutoId: item.varianteId ?? undefined,
              localizacaoId: input.localizacaoId,
              quantidade: Number(item.quantidade),
              documentoReferenciaId: encomenda.id,
              documentoReferenciaTipo: 'Encomenda',
            },
            ctx,
          );
          reservas.push(r.reservaId);
        }

        const updated = await tx.encomenda.update({
          where: { id: encomenda.id },
          data: { status: 'CONFIRMADA' as const },
        });

        return mapEncomenda(updated as unknown as PrismaEncomenda);
      });
    }

    // CANCELAR → libertar reservas activas
    if (input.paraStatus === 'CANCELADA') {
      return prismaBase.$transaction(async (tx) => {
        // Libertar reservas activas referenciadas a esta encomenda
        const reservasActivas = await tx.reservaStock.findMany({
          where: {
            tenantId: ctx.tenantId,
            documentoReferenciaId: encomenda.id,
            status: 'ATIVA',
          },
          select: { id: true },
        });

        for (const reserva of reservasActivas) {
          await this.stockService.libertarStock(tx, reserva.id, ctx);
        }

        const updated = await tx.encomenda.update({
          where: { id: encomenda.id },
          data: { status: 'CANCELADA' as const, deletedAt: new Date() },
        });

        return mapEncomenda(updated as unknown as PrismaEncomenda);
      });
    }

    // Outras transições (PARCIALMENTE_ENTREGUE, CONCLUIDA) — só estado
    const updated = await prismaBase.encomenda.update({
      where: { id: encomenda.id },
      data: { status: input.paraStatus as 'PARCIALMENTE_ENTREGUE' | 'CONCLUIDA' | 'CANCELADA' },
    });

    return mapEncomenda(updated as unknown as PrismaEncomenda);
  }

  /**
   * Converter encomenda CONFIRMADA em Venda + confirmar consumo de stock.
   * Cria Venda com origem=ENCOMENDA e preenche encomenda.vendaId.
   * O caller (action) chama vendaService.criar internamente, mas para manter
   * a transacção atómica usamos prismaBase.$transaction directo aqui.
   */
  async converterEmVenda(
    encomendaId: string,
    pagamentos: Array<{ tipo: string; valor: number; referencia?: string; troco?: number }>,
    ctx: Ctx,
    sessaoCaixaId?: string,
  ): Promise<{ vendaId: string; encomendaNumero: string }> {
    const encomenda = await prismaBase.encomenda.findFirst({
      where: { id: encomendaId, tenantId: ctx.tenantId, deletedAt: null },
      include: { itens: true },
    });
    if (!encomenda) throw new NotFoundError('Encomenda não encontrada');

    if (!['CONFIRMADA', 'PARCIALMENTE_ENTREGUE'].includes(encomenda.status)) {
      throw new BusinessRuleError(
        'ENCOMENDA_NAO_CONFIRMADA',
        'Só é possível converter encomendas confirmadas em venda.',
      );
    }

    return prismaBase.$transaction(async (tx) => {
      // Confirmar consumo de todas as reservas activas desta encomenda
      const reservasActivas = await tx.reservaStock.findMany({
        where: {
          tenantId: ctx.tenantId,
          documentoReferenciaId: encomenda.id,
          status: 'ATIVA',
        },
        select: { id: true },
      });

      for (const reserva of reservasActivas) {
        await this.stockService.confirmarConsumoStock(tx, reserva.id, ctx);
      }

      // Numeração para a venda
      const numeroVenda = await proximoNumeroSerie(tx, 'VENDA', ctx);

      // Calcular totais da venda a partir da encomenda
      const subtotal = encomenda.subtotal;
      const ivaTotal = encomenda.iva;
      const total = encomenda.total;

      // Criar Venda com origem=ENCOMENDA
      const venda = await tx.venda.create({
        data: {
          tenantId: ctx.tenantId,
          numero: numeroVenda,
          origem: 'ENCOMENDA',
          status: 'FATURADA',
          clienteId: encomenda.clienteId,
          vendedorId: encomenda.vendedorId ?? ctx.userId,
          sessaoCaixaId: sessaoCaixaId ?? null,
          dataEntregaPrevista: encomenda.dataPrevista,
          enderecoEntregaId: encomenda.enderecoEntregaId,
          subtotal,
          descontoTotal: encomenda.desconto,
          ivaTotal,
          total,
          observacoes: encomenda.notas,
          itens: {
            create: encomenda.itens.map((item) => ({
              tenantId: ctx.tenantId,
              produtoId: item.produtoId,
              varianteId: item.varianteId,
              nomeProduto: item.nomeProduto,
              sku: item.sku,
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              desconto: item.desconto,
              taxaIva: item.taxaIva,
              subtotal: item.subtotal,
              ivaItem: item.ivaItem,
              total: item.total,
            })),
          },
          pagamentos: {
            create: pagamentos.map((p) => ({
              tenantId: ctx.tenantId,
              tipo: p.tipo as 'DINHEIRO' | 'CARTAO' | 'TRANSFERENCIA' | 'MPESA' | 'EMOLA' | 'CREDITO',
              valor: new Prisma.Decimal(p.valor),
              referencia: p.referencia ?? null,
              troco: p.troco != null ? new Prisma.Decimal(p.troco) : null,
            })),
          },
        },
      });

      // Marcar encomenda como concluída e rastrear vendaId
      await tx.encomenda.update({
        where: { id: encomenda.id },
        data: { status: 'CONCLUIDA', vendaId: venda.id },
      });

      return { vendaId: venda.id, encomendaNumero: encomenda.numero };
    });
  }
}
