/**
 * DevolucaoService — WS-10 (Spec 10)
 *
 * Fluxo:
 *  criar     → PENDENTE (documento append-only; sem efeito de stock)
 *  aprovar   → APROVADA
 *  processar → PROCESSADA, numa só prismaBase.$transaction (ADR-0041 §8):
 *                NC pelo núcleo emitirNotaCreditoEmTx (contrato D) + entradaStock +
 *                reembolso (registarMovimentoCaixa + liquidação da NC) + status=PROCESSADA.
 *              Se algo falhar nada fica: a devolução permanece APROVADA e pode ser re-tentada.
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
import { exigirEmailConfirmadoParaEmitir, proximoNumeroSerie } from '@/server/services/financas';
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
// Núcleo partilhado com a troca (mesmo domínio): leitura trancada e NC da devolução
// ---------------------------------------------------------------------------

export type DevolucaoComItens = NonNullable<Awaited<ReturnType<typeof lerDevolucaoTrancada>>>;

/** Tranca a devolução (`FOR UPDATE`) e lê-a com os itens; o estado que decide vem daqui. */
export async function lerDevolucaoTrancada(tx: Prisma.TransactionClient, id: string, ctx: Ctx) {
  await tx.$queryRaw`SELECT id FROM "Devolucao" WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  const devolucao = await tx.devolucao.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { itens: { orderBy: { createdAt: 'asc' } } },
  });
  if (!devolucao) throw new NotFoundError('Devolução não encontrada');
  return devolucao;
}

/**
 * NC dos bens devolvidos, na transacção do chamador (processar e troca): reutiliza a que a
 * devolução já traga (resíduo do desenho antigo); senão, com factura, emite-a pelo núcleo
 * `emitirNotaCreditoEmTx` (contrato D). Sem factura → `null`.
 */
export async function notaCreditoDaDevolucaoEmTx(
  faturacao: Pick<IFaturacaoService, 'emitirNotaCreditoEmTx'>,
  tx: Prisma.TransactionClient,
  devolucao: DevolucaoComItens,
  motivo: string,
  data: Date,
  ctx: Ctx,
): Promise<{ id: string; numero: string; total: Prisma.Decimal; status: string } | null> {
  if (devolucao.notaCreditoId) {
    const existente = await tx.notaCredito.findFirst({
      where: { id: devolucao.notaCreditoId, tenantId: ctx.tenantId },
      select: { id: true, numero: true, total: true, status: true },
    });
    if (!existente) throw new NotFoundError('Nota de crédito da devolução não encontrada');
    return existente;
  }
  if (!devolucao.faturaId) return null;

  const nc = await faturacao.emitirNotaCreditoEmTx(
    tx,
    {
      faturaOriginalId: devolucao.faturaId,
      motivo,
      moeda: devolucao.currency,
      dataEmissao: data,
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
  return { id: nc.id, numero: nc.numero, total: new Prisma.Decimal(String(nc.total)), status: nc.status };
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class DevolucaoService {
  constructor(
    private readonly stockService: Pick<IStockService, 'entradaStock'>,
    private readonly faturacaoService: Pick<IFaturacaoService, 'emitirNotaCreditoEmTx' | 'liquidarNotaCreditoEmTx'>,
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
      const numero = await proximoNumeroSerie(tx, 'NOTA_DEVOLUCAO', ctx, new Date());

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
   * Processar devolução aprovada (ADR-0041 §8) — tudo numa só transacção, ou nada:
   *
   *  1. Tranca a devolução e relê-a: a transição APROVADA → PROCESSADA decide-se na leitura
   *     trancada (dois processamentos concorrentes não emitem duas NC).
   *  2. Com factura: nota de crédito pelo núcleo `emitirNotaCreditoEmTx` (estorno 711/44331 →
   *     411). Uma devolução que já traga `notaCreditoId` (resíduo do desenho antigo, em que a NC
   *     era emitida numa transacção própria) reutiliza-a.
   *  3. Entrada de stock por item (contrato A).
   *  4. Reembolso (com sessão de caixa): `MovimentoCaixa` DEVOLUCAO e, com NC, liquidação da NC
   *     por devolução em numerário (D 411 / C 111) — o cliente deixa de ter crédito na 411.
   *  5. PROCESSADA com `notaCreditoId`.
   *
   * Qualquer falha (caixa fechada, período fechado, NC acima da factura…) desfaz tudo: não fica
   * NC órfã nem número de série gasto, e a devolução continua APROVADA para nova tentativa.
   *
   * As duas vias de reembolso (ADR-0041 §8, «Devolução — reembolso»):
   *  - com sessão de caixa: o reembolso sai da gaveta (D 411 / C 111 + MovimentoCaixa DEVOLUCAO)
   *    e a NC fica LIQUIDADA por DEVOLUCAO;
   *  - sem sessão de caixa: a NC fica EMITIDA (crédito do cliente na 411) e liquida-se depois em
   *    Facturação — por devolução (ex.: banco) ou por COMPENSACAO na factura original.
   * A anulação POS devolve pelos meios originais; a devolução, pelo que fisicamente sai. Na troca,
   * a NC compensa o documento de substituição (ver `TrocaService.criar`).
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
    const previa = await prismaBase.devolucao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { faturaId: true, notaCreditoId: true },
    });
    if (!previa) throw new NotFoundError('Devolução não encontrada');
    // O travão de e-mail é de quem tem sessão (o núcleo da NC não o aplica) — só quando se emite.
    if (previa.faturaId && !previa.notaCreditoId && options?.serieNotaCreditoId) {
      await exigirEmailConfirmadoParaEmitir();
    }

    return prismaBase.$transaction(async (tx) => {
      const devolucao = await lerDevolucaoTrancada(tx, id, ctx);

      const permitidas = TRANSICOES_DEVOLUCAO[devolucao.status] ?? [];
      if (!permitidas.includes('PROCESSADA')) {
        throw new BusinessRuleError(
          'TRANSICAO_INVALIDA',
          `Devolução: transição inválida ${devolucao.status} → PROCESSADA`,
        );
      }

      // Com factura, exige série de NC antes de avançar.
      if (devolucao.faturaId && !options?.serieNotaCreditoId) {
        throw new BusinessRuleError(
          'SERIE_NC_OBRIGATORIA',
          'Esta devolução está associada a uma fatura. É obrigatório fornecer uma série de nota de crédito.',
        );
      }

      const agora = new Date();
      const nc = await notaCreditoDaDevolucaoEmTx(this.faturacaoService, tx, devolucao, `Devolução ${devolucao.numero}: ${devolucao.motivo}`, agora, ctx);

      // Entrada de stock por item devolvido (contrato A)
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
              documentoReferenciaTipo: 'DevolucaoVenda',
            },
            ctx,
          );
        }
      }

      // Reembolso em dinheiro: sai da gaveta e liquida a NC (a 411 do cliente fica a zero).
      if (devolucao.reembolso && options?.sessaoCaixaId) {
        const valor = nc ? new Prisma.Decimal(String(nc.total)) : devolucao.valorTotal;
        await this.caixaService.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId: options.sessaoCaixaId,
            tipo: 'DEVOLUCAO',
            valor,
            descricao: `Reembolso devolução ${devolucao.numero}`,
            documentoOrigemId: devolucao.id,
            documentoOrigemTipo: 'Devolucao',
          },
          ctx,
        );
        if (nc) {
          if (nc.status !== 'EMITIDA') {
            throw new BusinessRuleError(
              'NC_JA_LIQUIDADA',
              `A nota de crédito ${nc.numero} da devolução ${devolucao.numero} está ${nc.status}: o valor não se devolve outra vez.`,
            );
          }
          await this.faturacaoService.liquidarNotaCreditoEmTx(
            tx,
            { notaCreditoId: nc.id, data: agora, numerario: valor, compensado: new Prisma.Decimal(0) },
            ctx,
          );
        }
      }

      const updated = await tx.devolucao.update({
        where: { id: devolucao.id },
        data: {
          status: 'PROCESSADA',
          processadoPorId: ctx.userId,
          processadoEm: agora,
          ...(nc && { notaCreditoId: nc.id }),
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
