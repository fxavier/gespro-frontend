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

const r2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface LinhasDevolviveis {
  faturaId: string | null;
  faturaNumero: string | null;
  clienteId: string | null;
  linhas: Array<{
    produtoId: string;
    descricao: string;
    quantidadeFacturada: string;
    quantidadeDevolvivel: string;
    valorUnitario: string;
    taxaIva: string;
  }>;
}

interface LinhaFacturada {
  produtoId: string;
  descricao: string;
  quantidade: Prisma.Decimal;
  devolvivel: Prisma.Decimal;
  /** Preço unitário líquido do desconto da linha (subtotal ÷ quantidade, a 2 casas). */
  valorUnitario: Prisma.Decimal;
  taxaIva: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

/**
 * Linhas da factura com o que já foi creditado por NC não canceladas: o creditado de cada produto
 * abate-se às suas linhas pela ordem da factura.
 */
async function lerLinhasFacturadas(
  db: Pick<Prisma.TransactionClient, 'linhaFatura' | 'linhaNotaCredito'>,
  faturaId: string,
  ctx: Ctx,
): Promise<LinhaFacturada[]> {
  const linhas = await db.linhaFatura.findMany({
    where: { tenantId: ctx.tenantId, faturaId, produtoId: { not: null } },
    orderBy: [{ ordemLinha: 'asc' }, { createdAt: 'asc' }],
  });
  const creditadas = await db.linhaNotaCredito.findMany({
    where: {
      tenantId: ctx.tenantId,
      produtoId: { not: null },
      notaCredito: { faturaOriginalId: faturaId, status: { not: 'CANCELADA' } },
    },
    select: { produtoId: true, quantidade: true },
  });
  const porAbater = new Map<string, Prisma.Decimal>();
  for (const c of creditadas) {
    porAbater.set(c.produtoId!, (porAbater.get(c.produtoId!) ?? new Prisma.Decimal(0)).plus(c.quantidade));
  }
  return linhas.map((l) => {
    const resto = porAbater.get(l.produtoId!) ?? new Prisma.Decimal(0);
    const abatido = Prisma.Decimal.min(resto, l.quantidade);
    porAbater.set(l.produtoId!, resto.minus(abatido));
    return {
      produtoId: l.produtoId!,
      descricao: l.descricao,
      quantidade: l.quantidade,
      devolvivel: l.quantidade.minus(abatido),
      valorUnitario: r2(l.subtotal.div(l.quantidade)),
      taxaIva: l.taxaIva,
      subtotal: l.subtotal,
    };
  });
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
 * devolução já traga (resíduo do desenho antigo) — trancada (`FOR UPDATE`) ANTES de a ler, para
 * que o estado que o chamador verifica (`exigirNotaCreditoComCredito`) seja o de depois de
 * qualquer liquidação/cancelamento concorrente (#331); senão, com factura, emite-a pelo núcleo
 * `emitirNotaCreditoEmTx` (contrato D). Sem factura → `null`.
 */
export async function notaCreditoDaDevolucaoEmTx(
  faturacao: Pick<IFaturacaoService, 'emitirNotaCreditoEmTx' | 'motivoIsencaoAutomaticoEmTx'>,
  tx: Prisma.TransactionClient,
  devolucao: DevolucaoComItens,
  motivo: string,
  data: Date,
  ctx: Ctx,
): Promise<{ id: string; numero: string; total: Prisma.Decimal; status: string } | null> {
  if (devolucao.notaCreditoId) {
    await tx.$queryRaw`SELECT id FROM "NotaCredito" WHERE id = ${devolucao.notaCreditoId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const existente = await tx.notaCredito.findFirst({
      where: { id: devolucao.notaCreditoId, tenantId: ctx.tenantId },
      select: { id: true, numero: true, total: true, status: true },
    });
    if (!existente) throw new NotFoundError('Nota de crédito da devolução não encontrada');
    return existente;
  }
  if (!devolucao.faturaId) return null;

  const motivoIsencao = await faturacao.motivoIsencaoAutomaticoEmTx(tx, ctx);
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
        ...(Number(item.taxaIva) === 0 ? { motivoIsencao } : {}),
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

/**
 * A NC só tem crédito a abater/devolver enquanto `EMITIDA`. Códigos separados (#331):
 * `NC_JA_LIQUIDADA` (LIQUIDADA) e `NC_CANCELADA` (CANCELADA). `nc` tem de vir da leitura trancada.
 */
export function exigirNotaCreditoComCredito(
  nc: { numero: string; status: string },
  devolucaoNumero: string,
  consequencia: string,
): void {
  if (nc.status === 'EMITIDA') return;
  throw new BusinessRuleError(
    nc.status === 'CANCELADA' ? 'NC_CANCELADA' : 'NC_JA_LIQUIDADA',
    `A nota de crédito ${nc.numero} da devolução ${devolucaoNumero} está ${nc.status}: ${consequencia}`,
  );
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class DevolucaoService {
  constructor(
    private readonly stockService: Pick<IStockService, 'entradaStock'>,
    private readonly faturacaoService: Pick<
      IFaturacaoService,
      'emitirNotaCreditoEmTx' | 'liquidarNotaCreditoEmTx' | 'motivoIsencaoAutomaticoEmTx'
    >,
    private readonly caixaService: Pick<ICaixaService, 'registarMovimentoCaixa'>,
  ) {}

  /**
   * Criar devolução (#562). Com factura de origem — a escolhida ou, com `vendaId`, a da venda — o
   * servidor é a fonte de verdade: cliente, preço (líquido do desconto da linha) e taxa vêm da
   * `LinhaFatura`; recusa produto que não está na factura (`PRODUTO_NAO_FACTURADO`), preço
   * diferente do facturado (`PRECO_DIFERENTE_DO_FACTURADO`) e quantidade acima de facturado − já
   * creditado (`QUANTIDADE_ACIMA_DO_FACTURADO`). Sem factura só entra stock: reembolso recusado
   * (`REEMBOLSO_SEM_DOCUMENTO`) — o dinheiro só sai da caixa contra uma nota de crédito.
   */
  async criar(input: CreateDevolucaoInput, ctx: Ctx): Promise<DevolucaoRow> {
    return prismaBase.$transaction(async (tx) => {
      let faturaId = input.faturaId ?? null;
      if (input.vendaId) {
        const venda = await tx.venda.findFirst({
          where: { id: input.vendaId, tenantId: ctx.tenantId },
          select: { numero: true, faturaId: true },
        });
        if (!venda) throw new NotFoundError('Venda não encontrada');
        if (faturaId && venda.faturaId !== faturaId) {
          throw new BusinessRuleError('FATURA_NAO_E_DA_VENDA', `A factura escolhida não é a da venda ${venda.numero}.`);
        }
        faturaId = venda.faturaId;
      }
      if (!faturaId && input.reembolso) {
        throw new BusinessRuleError(
          'REEMBOLSO_SEM_DOCUMENTO',
          'Sem factura de origem não há nota de crédito: a devolução não pode ter reembolso.',
        );
      }

      let clienteId = input.clienteId;
      let itens: Array<{
        produtoId: string;
        varianteId: string | null;
        nomeProduto: string;
        sku: string | null;
        quantidade: Prisma.Decimal;
        valorUnitario: Prisma.Decimal;
        taxaIva: Prisma.Decimal;
        subtotal: Prisma.Decimal;
      }>;
      if (faturaId) {
        const fatura = await tx.fatura.findFirst({
          where: { id: faturaId, tenantId: ctx.tenantId },
          select: { numero: true, clienteId: true },
        });
        if (!fatura) throw new NotFoundError('Factura de origem não encontrada');
        clienteId = fatura.clienteId;
        const linhas = await lerLinhasFacturadas(tx, faturaId, ctx);
        const pedido = new Map<LinhaFacturada, Prisma.Decimal>();
        itens = input.itens.map((item) => {
          const doProduto = linhas.filter((l) => l.produtoId === item.produtoId);
          if (doProduto.length === 0) {
            throw new BusinessRuleError(
              'PRODUTO_NAO_FACTURADO',
              `${item.nomeProduto} não consta da factura ${fatura.numero}.`,
            );
          }
          const valorUnitario = r2(new Prisma.Decimal(item.valorUnitario));
          const linha = doProduto.find((l) => l.valorUnitario.equals(valorUnitario));
          if (!linha) {
            throw new BusinessRuleError(
              'PRECO_DIFERENTE_DO_FACTURADO',
              `${item.nomeProduto}: o preço ${valorUnitario.toFixed(2)} não é o facturado na ${fatura.numero} ` +
                `(${doProduto.map((l) => l.valorUnitario.toFixed(2)).join(', ')}).`,
            );
          }
          const quantidade = new Prisma.Decimal(item.quantidade);
          const acumulado = (pedido.get(linha) ?? new Prisma.Decimal(0)).plus(quantidade);
          if (acumulado.greaterThan(linha.devolvivel)) {
            throw new BusinessRuleError(
              'QUANTIDADE_ACIMA_DO_FACTURADO',
              `${item.nomeProduto}: só ${linha.devolvivel.toString()} de ${linha.quantidade.toString()} facturados ` +
                `na ${fatura.numero} ainda não foram creditados.`,
            );
          }
          pedido.set(linha, acumulado);
          return {
            produtoId: item.produtoId,
            varianteId: item.varianteId ?? null,
            nomeProduto: item.nomeProduto,
            sku: item.sku ?? null,
            quantidade,
            valorUnitario,
            taxaIva: linha.taxaIva,
            // Proporcional à linha: devolver tudo credita exactamente o facturado, sem cêntimos a mais.
            subtotal: r2(linha.subtotal.mul(quantidade).div(linha.quantidade)),
          };
        });
      } else {
        itens = input.itens.map((item) => {
          const quantidade = new Prisma.Decimal(item.quantidade);
          const valorUnitario = new Prisma.Decimal(item.valorUnitario);
          return {
            produtoId: item.produtoId,
            varianteId: item.varianteId ?? null,
            nomeProduto: item.nomeProduto,
            sku: item.sku ?? null,
            quantidade,
            valorUnitario,
            taxaIva: new Prisma.Decimal(item.taxaIva),
            subtotal: r2(quantidade.mul(valorUnitario)),
          };
        });
      }

      // IVA por linha, a 2 casas, como a facturação (`calcularTotaisVendaPOS`).
      const comIva = itens.map((i) => {
        const ivaItem = r2(i.subtotal.mul(i.taxaIva));
        return { ...i, ivaItem, total: i.subtotal.plus(ivaItem) };
      });
      const valorTotal = comIva.reduce((a, i) => a.plus(i.total), new Prisma.Decimal(0));

      const numero = await proximoNumeroSerie(tx, 'NOTA_DEVOLUCAO', ctx, new Date());

      const devolucao = await tx.devolucao.create({
        data: {
          tenantId: ctx.tenantId,
          numero,
          clienteId,
          vendaId: input.vendaId ?? null,
          faturaId,
          motivo: input.motivo as 'DEFEITO' | 'PRODUTO_ERRADO' | 'INSATISFACAO' | 'EXCESSO_PEDIDO' | 'AVARIA_TRANSPORTE' | 'OUTRO',
          reembolso: input.reembolso ?? false,
          observacoes: input.observacoes ?? null,
          valorTotal,
          itens: { create: comIva.map((i) => ({ tenantId: ctx.tenantId, ...i })) },
        },
      });

      return mapDevolucao(devolucao as unknown as PrismaDevolucao);
    });
  }

  /**
   * O que ainda se pode devolver de uma venda (#562): as linhas da sua factura com preço líquido,
   * taxa e quantidade facturada − já creditada. Venda sem factura → `faturaId: null`, sem linhas.
   */
  async linhasDevolviveis(vendaId: string, ctx: Ctx): Promise<LinhasDevolviveis> {
    const venda = await prismaBase.venda.findFirst({
      where: { id: vendaId, tenantId: ctx.tenantId },
      select: { faturaId: true },
    });
    if (!venda) throw new NotFoundError('Venda não encontrada');
    const fatura = venda.faturaId
      ? await prismaBase.fatura.findFirst({
          where: { id: venda.faturaId, tenantId: ctx.tenantId },
          select: { id: true, numero: true, clienteId: true },
        })
      : null;
    if (!fatura) return { faturaId: null, faturaNumero: null, clienteId: null, linhas: [] };
    const linhas = await lerLinhasFacturadas(prismaBase, fatura.id, ctx);
    return {
      faturaId: fatura.id,
      faturaNumero: fatura.numero,
      clienteId: fatura.clienteId,
      linhas: linhas.map((l) => ({
        produtoId: l.produtoId,
        descricao: l.descricao,
        quantidadeFacturada: l.quantidade.toString(),
        quantidadeDevolvivel: l.devolvivel.toString(),
        valorUnitario: l.valorUnitario.toString(),
        taxaIva: l.taxaIva.toString(),
      })),
    };
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
    return this.transitarSimples(id, 'APROVADA', ctx);
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
    },
  ): Promise<DevolucaoRow> {
    const previa = await prismaBase.devolucao.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { faturaId: true, notaCreditoId: true },
    });
    if (!previa) throw new NotFoundError('Devolução não encontrada');
    // O travão de e-mail é de quem tem sessão (o núcleo da NC não o aplica) — só quando se emite:
    // há factura e ainda não há NC. A série é a activa do tipo/ano (#93, #241).
    if (previa.faturaId && !previa.notaCreditoId) {
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

      const agora = new Date();
      const nc = await notaCreditoDaDevolucaoEmTx(this.faturacaoService, tx, devolucao, `Devolução ${devolucao.numero}: ${devolucao.motivo}`, agora, ctx);
      // NC reutilizada: o estado (lido depois da tranca) decide ANTES de qualquer escrita, em
      // todos os ramos — sem reembolso também, senão fica PROCESSADA a apontar para uma NC
      // cancelada ou já liquidada (#412). Uma NC acabada de emitir nasce EMITIDA.
      if (nc) exigirNotaCreditoComCredito(nc, devolucao.numero, 'não tem crédito para esta devolução.');
      // Sem NC não sai dinheiro da caixa (#562) — trava também as devoluções antigas sem factura.
      if (devolucao.reembolso && !nc) {
        throw new BusinessRuleError(
          'REEMBOLSO_SEM_DOCUMENTO',
          `A devolução ${devolucao.numero} não tem factura de origem: não há nota de crédito para reembolsar.`,
        );
      }

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
      if (nc && devolucao.reembolso && options?.sessaoCaixaId) {
        const valor = new Prisma.Decimal(String(nc.total));
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
        await this.faturacaoService.liquidarNotaCreditoEmTx(
          tx,
          { notaCreditoId: nc.id, data: agora, numerario: valor, compensado: new Prisma.Decimal(0) },
          ctx,
        );
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
    return this.transitarSimples(id, 'REJEITADA', ctx);
  }

  /**
   * Aprovar e rejeitar (#130) — compare-and-set: o estado de que a transição parte é lido
   * trancado (`FOR UPDATE`) na mesma transacção que escreve. Lido antes, um «Rejeitar»
   * atrasado carimbava REJEITADA por cima de uma devolução já PROCESSADA (NC emitida, stock
   * reentrado), e dois «Aprovar» passavam ambos.
   *
   * A rejeição continua a carimbar `aprovadoPorId`/`aprovadoEm` (quem decidiu e quando): o
   * modelo não tem campos próprios, e o detalhe chama-lhe «Rejeitada em».
   */
  private async transitarSimples(
    id: string,
    alvo: 'APROVADA' | 'REJEITADA',
    ctx: Ctx,
  ): Promise<DevolucaoRow> {
    return prismaBase.$transaction(async (tx) => {
      const devolucao = await lerDevolucaoTrancada(tx, id, ctx);

      const permitidas = TRANSICOES_DEVOLUCAO[devolucao.status] ?? [];
      if (!permitidas.includes(alvo)) {
        throw new BusinessRuleError(
          'TRANSICAO_INVALIDA',
          `Devolução: transição inválida ${devolucao.status} → ${alvo}`,
        );
      }

      const updated = await tx.devolucao.update({
        where: { id: devolucao.id },
        data: { status: alvo, aprovadoPorId: ctx.userId, aprovadoEm: new Date() },
      });

      return mapDevolucao(updated as unknown as PrismaDevolucao);
    });
  }
}
