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
import { exigirClienteParaCredito } from '@/lib/cliente-credito';
import type { Ctx } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import type { ICaixaService, RegistarMovimentoCaixaInput } from '@/server/services/financas';
import type {
  IContabilidadeService,
  RegistarLancamentoContabilisticoInput,
} from '@/server/services/financas';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import { ESTADOS_ENCOMENDA_CONVERTIVEIS, TRANSICOES_ENCOMENDA } from '@/lib/state-machines';
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

type ItemEncomendaInput = CreateEncomendaInput['itens'][number];

/**
 * Valores de uma linha, arredondados a 2dp por linha (igual ao Postgres
 * @db.Decimal(18,2)) para evitar 1-cêntimo de desequilíbrio no lançamento
 * contabilístico. Usado pelo `criar` e pelo `atualizar` — uma só regra.
 */
function linhaEncomenda(item: ItemEncomendaInput, tenantId: string) {
  const qty = new Prisma.Decimal(item.quantidade);
  const preco = new Prisma.Decimal(item.precoUnitario);
  const descontoPct = new Prisma.Decimal(item.desconto ?? 0);
  const taxa = new Prisma.Decimal(item.taxaIva ?? 0.16);
  const baseItem = qty.mul(preco).mul(new Prisma.Decimal(1).minus(descontoPct.div(100))).toDP(2);
  const ivaItem = baseItem.mul(taxa).toDP(2);

  return {
    tenantId,
    produtoId: item.produtoId,
    varianteId: item.varianteId ?? null,
    nomeProduto: item.nomeProduto,
    sku: item.sku ?? null,
    quantidade: qty,
    precoUnitario: preco,
    desconto: descontoPct,
    taxaIva: taxa,
    subtotal: baseItem,
    ivaItem,
    total: baseItem.plus(ivaItem),
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
    const linha = linhaEncomenda(item, '');
    subtotal = subtotal.plus(linha.subtotal);
    iva = iva.plus(linha.ivaItem);
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

type StatusEncomendaPrisma = 'RASCUNHO' | 'CONFIRMADA' | 'PARCIALMENTE_ENTREGUE' | 'CONCLUIDA' | 'CANCELADA';

/**
 * Compare-and-set do estado de uma encomenda, dentro da tx do chamador: só escreve se a
 * encomenda (do tenant, não apagada) ainda estiver num dos estados `de`. O UPDATE tranca a
 * linha; um pedido concorrente espera pelo commit do primeiro e reavalia o WHERE (count 0).
 * Quem perde recebe o mesmo erro que um pedido sequencial: NotFoundError se a encomenda
 * entretanto foi apagada (cancelada), senão o erro de domínio de `recusa`.
 */
async function compararETrocarEstado(
  tx: Prisma.TransactionClient,
  id: string,
  de: readonly string[],
  data: { status: StatusEncomendaPrisma; deletedAt?: Date },
  ctx: Ctx,
  recusa: () => BusinessRuleError,
): Promise<void> {
  const { count } = await tx.encomenda.updateMany({
    where: { id, tenantId: ctx.tenantId, deletedAt: null, status: { in: [...de] as StatusEncomendaPrisma[] } },
    data,
  });
  if (count === 1) return;
  const existe = await tx.encomenda.findFirst({
    where: { id, tenantId: ctx.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!existe) throw new NotFoundError('Encomenda não encontrada');
  throw recusa();
}

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
      const numero = await proximoNumeroSerie(tx, 'ENCOMENDA', ctx, new Date());

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
            create: input.itens.map((item) => linhaEncomenda(item, ctx.tenantId)),
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
    const totais = input.itens ? calcularTotaisItens(input.itens) : null;

    return prismaBase.$transaction(async (tx) => {
      // Verificação de RASCUNHO atómica com a escrita: o WHERE do updateMany
      // tranca a linha e só escreve se o estado ainda for RASCUNHO.
      const { count } = await tx.encomenda.updateMany({
        where: { id, tenantId: ctx.tenantId, status: 'RASCUNHO', deletedAt: null },
        data: {
          ...(input.clienteId !== undefined && { clienteId: input.clienteId }),
          ...(input.dataPrevista !== undefined && { dataPrevista: input.dataPrevista }),
          ...(input.enderecoEntregaId !== undefined && { enderecoEntregaId: input.enderecoEntregaId }),
          ...(input.notas !== undefined && { notas: input.notas }),
          ...(input.vendedorId !== undefined && { vendedorId: input.vendedorId }),
          ...(totais && { subtotal: totais.subtotal, iva: totais.iva, total: totais.total }),
        },
      });

      if (count === 0) {
        const existente = await tx.encomenda.findFirst({
          where: { id, tenantId: ctx.tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!existente) throw new NotFoundError('Encomenda não encontrada');
        throw new BusinessRuleError(
          'ENCOMENDA_NAO_EDITAVEL',
          'Só é possível editar encomendas em rascunho.',
        );
      }

      if (input.itens) {
        await tx.itemEncomenda.deleteMany({ where: { tenantId: ctx.tenantId, encomendaId: id } });
        await tx.itemEncomenda.createMany({
          data: input.itens.map((item) => ({ ...linhaEncomenda(item, ctx.tenantId), encomendaId: id })),
        });
      }

      const row = await tx.encomenda.findFirstOrThrow({ where: { id, tenantId: ctx.tenantId } });
      return mapEncomenda(row as unknown as PrismaEncomenda);
    });
  }

  /**
   * Transitar estado de encomenda.
   *
   * CONFIRMADA → reservarStock (contrato A) — localizacaoId OBRIGATÓRIO
   * CANCELADA  → libertarStock das reservas activas (contrato A)
   * Outras     → só estado
   */
  async transitar(input: TransitarEncomendaInput, ctx: Ctx): Promise<EncomendaRow> {
    return prismaBase.$transaction(async (tx) => {
      const encomenda = await tx.encomenda.findFirst({
        where: { id: input.encomendaId, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, status: true },
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

      // BLOCKER 2: localizacaoId obrigatório para reservar stock ao confirmar
      if (input.paraStatus === 'CONFIRMADA' && !input.localizacaoId) {
        throw new BusinessRuleError(
          'LOCALIZACAO_OBRIGATORIA',
          'É necessária uma localização de stock para confirmar a encomenda.',
        );
      }

      // Compare-and-set: só escreve se o estado ainda for o lido. Um pedido concorrente
      // fica à espera da tranca da linha e, depois do commit do primeiro, vê count = 0.
      await compararETrocarEstado(
        tx,
        encomenda.id,
        [atual],
        {
          status: input.paraStatus as StatusEncomendaPrisma,
          ...(input.paraStatus === 'CANCELADA' && { deletedAt: new Date() }),
        },
        ctx,
        () =>
          new BusinessRuleError(
            'TRANSICAO_INVALIDA',
            `Encomenda: o estado mudou entretanto; transição ${atual} → ${input.paraStatus} recusada`,
          ),
      );

      // ── CONFIRMAR → reservar stock (contrato A). Itens lidos depois da tranca.
      if (input.paraStatus === 'CONFIRMADA') {
        const itens = await tx.itemEncomenda.findMany({
          where: { tenantId: ctx.tenantId, encomendaId: encomenda.id },
        });
        for (const item of itens) {
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
      }

      // ── CANCELAR → libertar reservas activas
      if (input.paraStatus === 'CANCELADA') {
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
      }

      const updated = await tx.encomenda.findFirstOrThrow({
        where: { id: encomenda.id, tenantId: ctx.tenantId },
      });
      return mapEncomenda(updated as unknown as PrismaEncomenda);
    });
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
    return prismaBase.$transaction(async (tx) => {
      const lida = await tx.encomenda.findFirst({
        where: { id: encomendaId, tenantId: ctx.tenantId, deletedAt: null },
        select: { id: true, status: true, clienteId: true },
      });
      if (!lida) throw new NotFoundError('Encomenda não encontrada');

      const naoConfirmada = () =>
        new BusinessRuleError(
          'ENCOMENDA_NAO_CONFIRMADA',
          'Só é possível converter encomendas confirmadas em venda.',
        );
      if (!ESTADOS_ENCOMENDA_CONVERTIVEIS.includes(lida.status)) throw naoConfirmada();

      // Venda a crédito (ADR-0041 §4, #317): nem o Consumidor Final nem um cliente
      // inactivo/apagado abrem conta corrente — mesma regra da venda POS.
      if (pagamentos.some((p) => p.tipo === 'CREDITO')) {
        const cliente = await tx.cliente.findFirst({
          where: { id: lida.clienteId, tenantId: ctx.tenantId },
          select: { codigo: true, status: true, deletedAt: true },
        });
        exigirClienteParaCredito(cliente);
      }

      // Compare-and-set: dois «Converter» simultâneos — só um passa daqui.
      await compararETrocarEstado(tx, lida.id, ESTADOS_ENCOMENDA_CONVERTIVEIS, { status: 'CONCLUIDA' }, ctx, naoConfirmada);

      const encomenda = await tx.encomenda.findFirstOrThrow({
        where: { id: lida.id, tenantId: ctx.tenantId },
        include: { itens: true },
      });

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
      const numeroVenda = await proximoNumeroSerie(tx, 'VENDA', ctx, new Date());
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

      // 6. Rastrear a venda (o estado CONCLUIDA já foi escrito pelo compare-and-set)
      await tx.encomenda.update({
        where: { id: encomenda.id },
        data: { vendaId: venda.id },
      });

      return { vendaId: venda.id, encomendaNumero: encomenda.numero };
    });
  }
}
