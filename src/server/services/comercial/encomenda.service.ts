/**
 * EncomendaService — WS-10 (Spec 10)
 *
 * Fluxo:
 *  criar                  → RASCUNHO (sem efeito de stock)
 *  confirmar              → CONFIRMADA + reservarStock por item (contrato A)
 *                           localizacaoId OBRIGATÓRIO — falha com BusinessRuleError se ausente
 *  converterEmVenda       → CONCLUIDA + confirmarConsumoStock (ou baixarStock fallback)
 *                           + registarMovimentoCaixa + registarLancamentoContabilistico
 *  cancelar               → CANCELADA + libertarStock das reservas activas (contrato A)
 *
 * Toda a mutação com stock/caixa/contabilidade corre dentro de prismaBase.$transaction.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import type { ICaixaService, RegistarMovimentoCaixaInput } from '@/server/services/financas';
import type {
  IContabilidadeService,
  RegistarLancamentoContabilisticoInput,
} from '@/server/services/financas';
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

    // Arredondar por linha a 2dp (igual ao Postgres @db.Decimal(18,2))
    // para evitar 1-cêntimo de desequilíbrio no lançamento contabilístico.
    const baseItem = qty.mul(preco).mul(new Prisma.Decimal(1).minus(desc)).toDP(2);
    const ivaItem = baseItem.mul(taxa).toDP(2);

    subtotal = subtotal.plus(baseItem);
    iva = iva.plus(ivaItem);
  }

  // total = sum das linhas já arredondadas → round(s+i) == round(s)+round(i)
  return { subtotal: subtotal.toDP(2), iva: iva.toDP(2), total: subtotal.toDP(2).plus(iva.toDP(2)) };
}

// ---------------------------------------------------------------------------
// Lançamento contabilístico PGC (Decreto 70/2009)
// Separado aqui para evitar import de internals de financas.
// ---------------------------------------------------------------------------

/** Códigos PGC padrão (espelho local de faturacao.service.PGC_FATURACAO) */
const PGC_VENDA = {
  CLIENTES_CC: '411',       // 4.1.1 — Clientes c/c (devedora)
  RECEITA_VENDAS: '711',    // 7.1.1 — Vendas - Mercadorias
  IVA_LIQUIDADO: '44331',   // 4.4.3.3.1 — IVA liquidado
} as const;

function construirLancamentoVenda(venda: {
  id: string;
  numero: string;
  total: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  iva: Prisma.Decimal;
}): RegistarLancamentoContabilisticoInput {
  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_VENDA.CLIENTES_CC,
      tipo: 'DEBITO',
      valor: venda.total.toFixed(2),
      historico: `Encomenda → Venda ${venda.numero}`,
    },
    {
      contaCodigo: PGC_VENDA.RECEITA_VENDAS,
      tipo: 'CREDITO',
      valor: venda.subtotal.toFixed(2),
      historico: `Venda ${venda.numero} — receita`,
    },
  ];

  if (venda.iva.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_VENDA.IVA_LIQUIDADO,
      tipo: 'CREDITO',
      valor: venda.iva.toFixed(2),
      historico: `Venda ${venda.numero} — IVA liquidado`,
    });
  }

  return {
    data: new Date(),
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: venda.id,
    documentoOrigemTipo: 'Venda',
    historico: `Conversão de encomenda — Venda ${venda.numero}`,
    partidas,
  };
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class EncomendaService {
  constructor(
    private readonly stockService: IStockService,
    private readonly caixaService: Pick<ICaixaService, 'registarMovimentoCaixa'>,
    private readonly contabilidadeService: Pick<IContabilidadeService, 'registarLancamentoContabilistico'>,
  ) {}

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
   *
   * CONFIRMADA → reservarStock (contrato A) — localizacaoId OBRIGATÓRIO
   * CANCELADA  → libertarStock das reservas activas (contrato A)
   * Outras     → só estado
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

    // ── CONFIRMAR → reservar stock (BLOCKER 2: localizacaoId obrigatório)
    if (input.paraStatus === 'CONFIRMADA') {
      if (!input.localizacaoId) {
        throw new BusinessRuleError(
          'LOCALIZACAO_OBRIGATORIA',
          'É necessária uma localização de stock para confirmar a encomenda.',
        );
      }

      return prismaBase.$transaction(async (tx) => {
        for (const item of encomenda.itens) {
          await this.stockService.reservarStock(
            tx,
            {
              produtoId: item.produtoId,
              varianteProdutoId: item.varianteId ?? undefined,
              localizacaoId: input.localizacaoId!,
              quantidade: Number(item.quantidade),
              documentoReferenciaId: encomenda.id,
              documentoReferenciaTipo: 'Venda', // encomenda convertida é semanticamente uma Venda
            },
            ctx,
          );
        }

        const updated = await tx.encomenda.update({
          where: { id: encomenda.id },
          data: { status: 'CONFIRMADA' as const },
        });

        return mapEncomenda(updated as unknown as PrismaEncomenda);
      });
    }

    // ── CANCELAR → libertar reservas activas
    if (input.paraStatus === 'CANCELADA') {
      return prismaBase.$transaction(async (tx) => {
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
   *
   * Dentro de prismaBase.$transaction:
   *  1. confirmarConsumoStock para cada reserva activa (contrato A)
   *     Fallback: baixarStock se não existirem reservas (edge case; requer localizacaoId)
   *  2. Criar Venda com origem=ENCOMENDA e status=FATURADA
   *  3. registarMovimentoCaixa (contrato D) — se sessaoCaixaId fornecido
   *  4. registarLancamentoContabilistico (contrato D) — partida dobrada VENDAS
   *  5. Marcar encomenda CONCLUIDA e rastrear vendaId
   */
  async converterEmVenda(
    encomendaId: string,
    pagamentos: Array<{ tipo: string; valor: number; referencia?: string; troco?: number }>,
    ctx: Ctx,
    opts?: { sessaoCaixaId?: string; localizacaoId?: string },
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
      // 1. Gerir stock:
      //    a) Consumir reservas activas desta encomenda (caminho normal)
      //    b) Fallback: baixarStock directo se não houver reservas (edge case)
      const reservasActivas = await tx.reservaStock.findMany({
        where: {
          tenantId: ctx.tenantId,
          documentoReferenciaId: encomenda.id,
          status: 'ATIVA',
        },
        select: { id: true },
      });

      if (reservasActivas.length > 0) {
        for (const reserva of reservasActivas) {
          await this.stockService.confirmarConsumoStock(tx, reserva.id, ctx);
        }
      } else if (opts?.localizacaoId) {
        // Fallback: baixa directa (encomenda confirmada sem reserva activa)
        for (const item of encomenda.itens) {
          await this.stockService.baixarStock(
            tx,
            {
              produtoId: item.produtoId,
              varianteProdutoId: item.varianteId ?? undefined,
              localizacaoOrigemId: opts.localizacaoId,
              quantidade: Number(item.quantidade),
              documentoReferenciaId: encomenda.id,
              documentoReferenciaTipo: 'Venda', // encomenda convertida é semanticamente uma Venda
            },
            ctx,
          );
        }
      }

      // 2. Numeração e totais
      const numeroVenda = await proximoNumeroSerie(tx, 'VENDA', ctx);
      const subtotal = encomenda.subtotal as Prisma.Decimal;
      const ivaTotal = encomenda.iva as Prisma.Decimal;
      const total = encomenda.total as Prisma.Decimal;

      // 3. Criar Venda com status FATURADA (já confirmada e entregue)
      const venda = await tx.venda.create({
        data: {
          tenantId: ctx.tenantId,
          numero: numeroVenda,
          origem: 'ENCOMENDA',
          status: 'FATURADA',
          clienteId: encomenda.clienteId,
          vendedorId: encomenda.vendedorId ?? ctx.userId,
          sessaoCaixaId: opts?.sessaoCaixaId ?? null,
          dataEntregaPrevista: encomenda.dataPrevista,
          enderecoEntregaId: encomenda.enderecoEntregaId,
          subtotal,
          descontoTotal: encomenda.desconto as Prisma.Decimal,
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

      // 4. Registar movimento de caixa (contrato D) — BLOCKER 1
      if (opts?.sessaoCaixaId) {
        const movInput: RegistarMovimentoCaixaInput = {
          sessaoCaixaId: opts.sessaoCaixaId,
          tipo: 'VENDA',
          valor: total,
          descricao: `Venda ${numeroVenda} (encomenda ${encomenda.numero})`,
          documentoOrigemId: venda.id,
          documentoOrigemTipo: 'Venda',
        };
        await this.caixaService.registarMovimentoCaixa(tx, movInput, ctx);
      }

      // 5. Lançamento contabilístico — partida dobrada (contrato D) — BLOCKER 1
      const lancamentoInput = construirLancamentoVenda({
        id: venda.id,
        numero: numeroVenda,
        total,
        subtotal,
        iva: ivaTotal,
      });
      await this.contabilidadeService.registarLancamentoContabilistico(tx, lancamentoInput, ctx);

      // 6. Marcar encomenda como concluída
      await tx.encomenda.update({
        where: { id: encomenda.id },
        data: { status: 'CONCLUIDA', vendaId: venda.id },
      });

      return { vendaId: venda.id, encomendaNumero: encomenda.numero };
    });
  }
}
