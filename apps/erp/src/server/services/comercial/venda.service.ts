/**
 * VendaService + SessaoPOSService — Wave 3 (WS C)
 *
 * Integração real com WS A (stock) e WS D (caixa/faturação).
 * Cross-WS dependencies injectadas no construtor para testabilidade.
 *
 * Fluxo POS (dentro da $transaction principal — ADR-0041):
 *   1. proximoNumeroSerie(tx,'VENDA') → número único (WS D)
 *   2. criar Venda (CONCLUIDA) + ItemVenda + PagamentoVenda
 *   3. baixarStock por item (WS A) usando localizacao ARMAZEM real
 *   4. Factura-Recibo (série FATURA_RECIBO, PAGA) + lançamento, pelo núcleo
 *      emitirDocumentoEmTx (WS D); Venda.faturaId ↔ Fatura.vendaId
 *   5. registarMovimentoCaixa só pela parte em DINHEIRO (WS D)
 *   6. HistoricoEstadoVenda inicial
 *   Após commit: calcular + registar comissão (best-effort, WS C interno)
 *
 * Fluxo ENCOMENDA (dentro da $transaction de criar):
 *   1. proximoNumeroSerie → número único
 *   2. criar Venda + itens + pagamentos (status=RASCUNHO)
 *   3. reservarStock por item → ReservaStock com documentoReferenciaId=venda.id
 *   4. HistoricoEstadoVenda inicial
 *   Transitar CONFIRMADA: sem efeito de stock (reserva já activa)
 *   Transitar FATURADA: confirmarConsumoStock por reserva activa da venda
 *   Transitar CANCELADA: libertarStock por reserva activa da venda
 *   Transitar DEVOLVIDA: entradaStock por item (devolução ao armazém)
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx, TxClient } from '@/server/services/types';
import type { BaixaStockInput, IStockService, ReservaStockInput } from '@/server/services/inventario/stock.interface';
import type { RegistarMovimentoCaixaInput, TipoSerieDocumento } from '@/server/services/financas';
import type { IFaturacaoService } from '@/server/services/financas';
import type { ICaixaService } from '@/server/services/financas';
import type { IMeioPagamentoPOSService } from '@/server/services/financas';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';
import { CLIENTE_CONSUMIDOR_FINAL } from '@/lib/consumidor-final';
import type { IComissaoService } from './comissao.interface';
import {
  TRANSICOES_VENDA,
  transitarVenda,
  TRANSICOES_SESSAO_POS,
  transitarSessaoPOS,
  type StatusVenda,
  type StatusSessaoPOS,
  type IVendaService,
  type ISessaoPOSService,
  type VendaRow,
  type VendaSummary,
  type PaginatedVendas,
  type ItemVendaRow,
  type PagamentoVendaRow,
  type HistoricoEstadoVendaRow,
  type SessaoPOSRow,
} from './venda.interface';
import type {
  CreateVendaInput,
  UpdateVendaInput,
  FilterVendaInput,
  TransitarVendaInput,
  AbrirSessaoPOSInput,
  FecharSessaoPOSInput,
} from '@/lib/validations/vendas';

// ---------------------------------------------------------------------------
// Helpers (Decimal → string, ADR A9)
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string {
  return v?.toString() ?? '0';
}

// ---------------------------------------------------------------------------
// Tipo das linhas Prisma (sem includes pesados)
// ---------------------------------------------------------------------------

type PrismaVenda = Awaited<ReturnType<typeof prisma.venda.findFirstOrThrow>>;
type PrismaItemVenda = Awaited<ReturnType<typeof prisma.itemVenda.findFirstOrThrow>>;
type PrismaPagamento = Awaited<ReturnType<typeof prisma.pagamentoVenda.findFirstOrThrow>>;
type PrismaHistoricoEstado = Awaited<ReturnType<typeof prisma.historicoEstadoVenda.findFirstOrThrow>>;
type PrismaSessaoPOS = Awaited<ReturnType<typeof prisma.sessaoPOS.findFirstOrThrow>>;

function mapItemRow(i: PrismaItemVenda): ItemVendaRow {
  return {
    id: i.id,
    tenantId: i.tenantId,
    vendaId: i.vendaId,
    produtoId: i.produtoId,
    varianteProdutoId: i.varianteId,
    nomeProduto: i.nomeProduto,
    sku: i.sku,
    quantidade: dec(i.quantidade),
    precoUnitario: dec(i.precoUnitario),
    desconto: dec(i.desconto),
    taxaIva: dec(i.taxaIva),
    subtotal: dec(i.subtotal),
    ivaItem: dec(i.ivaItem),
    total: dec(i.total),
    createdAt: i.createdAt,
  };
}

function mapPagamentoRow(p: PrismaPagamento): PagamentoVendaRow {
  return {
    id: p.id,
    tenantId: p.tenantId,
    vendaId: p.vendaId,
    tipo: p.tipo as PagamentoVendaRow['tipo'],
    valor: dec(p.valor),
    referencia: p.referencia,
    troco: p.troco ? dec(p.troco) : null,
    createdAt: p.createdAt,
  };
}

function mapHistoricoEstadoRow(h: PrismaHistoricoEstado): HistoricoEstadoVendaRow {
  return {
    id: h.id,
    tenantId: h.tenantId,
    vendaId: h.vendaId,
    estadoAntes: h.estadoAntes as StatusVenda,
    estadoDepois: h.estadoDepois as StatusVenda,
    motivo: h.motivo,
    userId: h.userId,
    createdAt: h.createdAt,
  };
}

type VendaComRelacoes = PrismaVenda & {
  itens?: PrismaItemVenda[];
  pagamentos?: PrismaPagamento[];
  historicoEstado?: PrismaHistoricoEstado[];
};

function mapVendaRow(v: VendaComRelacoes): VendaRow {
  return {
    id: v.id,
    tenantId: v.tenantId,
    numero: v.numero,
    origem: v.origem as VendaRow['origem'],
    status: v.status as StatusVenda,
    clienteId: v.clienteId,
    vendedorId: v.vendedorId,
    sessaoPOSId: v.sessaoPOSId,
    sessaoCaixaId: v.sessaoCaixaId,
    faturaId: v.faturaId,
    enderecoEntregaId: v.enderecoEntregaId,
    dataEntregaPrevista: v.dataEntregaPrevista,
    subtotal: dec(v.subtotal),
    descontoTotal: dec(v.descontoTotal),
    ivaTotal: dec(v.ivaTotal),
    total: dec(v.total),
    currency: v.currency,
    observacoes: v.observacoes,
    dataVenda: v.dataVenda,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    itens: v.itens?.map(mapItemRow),
    pagamentos: v.pagamentos?.map(mapPagamentoRow),
    historicoEstado: v.historicoEstado?.map(mapHistoricoEstadoRow),
  };
}

type VendaComCliente = PrismaVenda & { cliente?: { nome: string } | null };

function mapVendaSummary(v: VendaComCliente): VendaSummary {
  return {
    id: v.id,
    numero: v.numero,
    origem: v.origem as VendaSummary['origem'],
    status: v.status as StatusVenda,
    clienteId: v.clienteId,
    clienteNome: v.cliente?.nome ?? null,
    vendedorId: v.vendedorId,
    total: dec(v.total),
    dataVenda: v.dataVenda,
    faturaId: v.faturaId,
  };
}

function mapSessaoPOSRow(s: PrismaSessaoPOS): SessaoPOSRow {
  return {
    id: s.id,
    tenantId: s.tenantId,
    vendedorId: s.vendedorId,
    sessaoCaixaId: s.sessaoCaixaId,
    status: s.status as StatusSessaoPOS,
    abertoEm: s.abertoEm,
    fechadoEm: s.fechadoEm,
    totalVendas: dec(s.totalVendas),
    numeroPedidos: s.numeroPedidos,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Helpers de localização (Wave 3)
// ---------------------------------------------------------------------------

/**
 * Resolve o primeiro armazém activo do tenant dentro de uma transacção.
 * Lança BusinessRuleError('LOCALIZACAO_NAO_ENCONTRADA') se não existir nenhum.
 */
async function _resolverArmazem(tx: TxClient, ctx: Ctx): Promise<string> {
  const loc = await tx.localizacao.findFirst({
    where: { tenantId: ctx.tenantId, tipo: 'ARMAZEM' as never, ativa: true, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!loc) {
    throw new BusinessRuleError(
      'LOCALIZACAO_NAO_ENCONTRADA',
      'Nenhum armazém activo encontrado. Crie pelo menos um armazém no módulo de stock.',
    );
  }
  return loc.id;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cliente de uma venda POS com parte a crédito (ADR-0041 §4): tem de ser identificado —
 * nem anónimo nem o Consumidor Final, que não tem conta corrente a que se cobrar.
 */
async function _clienteDoCredito(
  tx: Prisma.TransactionClient,
  input: CreateVendaInput,
  ctx: Ctx,
): Promise<{ id: string; diasPagamento: number }> {
  const cliente = input.clienteId
    ? await tx.cliente.findFirst({
        where: { id: input.clienteId, tenantId: ctx.tenantId },
        select: { id: true, codigo: true, diasPagamento: true },
      })
    : null;
  if (input.clienteId && !cliente) throw new NotFoundError('Cliente não encontrado');
  if (!cliente || cliente.codigo === CLIENTE_CONSUMIDOR_FINAL.codigo) {
    throw new BusinessRuleError(
      'CLIENTE_OBRIGATORIO_CREDITO',
      'Uma venda a crédito exige um cliente identificado (não o Consumidor Final).',
    );
  }
  return { id: cliente.id, diasPagamento: cliente.diasPagamento };
}

// ---------------------------------------------------------------------------
// VendaService
// ---------------------------------------------------------------------------

export class VendaService implements IVendaService {
  constructor(
    private readonly stockService: Pick<
      IStockService,
      'baixarStock' | 'reservarStock' | 'libertarStock' | 'entradaStock' | 'confirmarConsumoStock'
    >,
    private readonly caixaService: Pick<ICaixaService, 'registarMovimentoCaixa'>,
    private readonly faturacaoService: Pick<
      IFaturacaoService,
      'proximoNumeroSerie' | 'emitirDocumentoEmTx' | 'construirLancamentoVendaPOS'
    >,
    private readonly comissaoService: Pick<
      IComissaoService,
      'calcularComissao' | 'registarComissao'
    >,
    private readonly meioPagamentoPOSService: IMeioPagamentoPOSService,
  ) {}

  async criar(input: CreateVendaInput, ctx: Ctx): Promise<VendaRow> {
    // 1. Calcular totais (puro — o mesmo cálculo do terminal POS, por linha a 2 casas).
    //    Aplica-se a TODAS as origens: é a regra de totais da venda, não uma regra só do POS.
    const totais = calcularTotaisVendaPOS(input.itens);
    const { total } = totais;
    const itensTotais = input.itens.map((item, k) => ({ item, ...totais.linhas[k] }));
    const dataVenda = input.dataVenda ?? new Date();

    // 1b. Idempotência (ADR-0041 §5): um retry com a mesma chave devolve a venda já gravada,
    //     sem escrever nada. Esta leitura é só o atalho; a garantia é o índice único
    //     (tenantId, chaveIdempotencia) — ver o catch da transacção abaixo.
    const chave = input.chaveIdempotencia;
    if (chave) {
      const existente = await this._vendaComChave(chave, input, ctx);
      if (existente) return existente;
    }

    // 2. Status inicial por origem: ENCOMENDA em RASCUNHO; POS paga nasce CONCLUIDA e POS
    //    com parte a crédito nasce FATURADA (ADR-0041 §7); os outros em PENDENTE.
    const posACredito = input.origem === 'POS' && input.pagamentos.some((p) => p.tipo === 'CREDITO');
    const statusInicial: StatusVenda =
      input.origem === 'ENCOMENDA'
        ? 'RASCUNHO'
        : input.origem === 'POS'
          ? posACredito
            ? 'FATURADA'
            : 'CONCLUIDA'
          : 'PENDENTE';

    // 3. Transacção principal: número + venda + itens + pagamentos + stock + caixa + histórico
    let vendaRow: VendaRow;
    try {
      vendaRow = await this._criarEmTx(input, ctx, {
        totais,
        itensTotais,
        dataVenda,
        posACredito,
        statusInicial,
      });
    } catch (err) {
      // Violação de unicidade: pode ser a corrida com a mesma chave (a outra tentativa ganhou o
      // índice (tenantId, chaveIdempotencia) e esta transacção foi desfeita inteira — número,
      // stock, caixa, documento) ou outro índice único qualquer. Só se devolve a venda quando
      // existe mesmo uma venda gravada com esta chave (e com o mesmo conteúdo); senão relança.
      if (
        chave &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const vencedora = await this._vendaComChave(chave, input, ctx);
        if (vencedora) return vencedora;
      }
      throw err;
    }

    // 4. Registar comissão APÓS o commit da transacção principal — só para a chamada que criou.
    //    A comissão é best-effort: falha regista-se no log mas não reverte a venda.
    //    Não engolir o erro dentro de uma tx — a comissão tem a sua própria operação.
    if (input.vendedorId) {
      try {
        const calculo = await this.comissaoService.calcularComissao(
          input.vendedorId,
          vendaRow.id,
          total.toString(),
          itensTotais.map(({ item, subtotal }) => ({
            categoriaId: item.produtoId, // Wave 3: categoria real via WS A
            valor: subtotal.toString(),
          })),
          ctx,
        );
        // Usa prisma (não tx) — a transacção principal já foi committed
        await this.comissaoService.registarComissao(prisma as unknown as TxClient, calculo, ctx);
      } catch (err) {
        // Regista no log mas não propaga — a venda já está committed
        console.error('[VendaService.criar] Falha ao registar comissão:', err);
      }
    }

    return vendaRow;
  }

  /**
   * Venda já gravada com esta chave de idempotência no tenant, ou `null`. A chave cobre o
   * conteúdo fiscal inteiro da venda (ADR-0041 §5): cliente, origem, linhas (produto, variante,
   * quantidade, preço, desconto, IVA) e pagamentos (tipo, valor), sem olhar à ordem. O `troco`
   * não é conteúdo fiscal e fica de fora. Mesma chave com outro conteúdo é um pedido novo
   * disfarçado de retry → `CHAVE_IDEMPOTENCIA_REUTILIZADA`.
   */
  private async _vendaComChave(
    chave: string,
    input: CreateVendaInput,
    ctx: Ctx,
  ): Promise<VendaRow | null> {
    const existente = await prisma.venda.findFirst({
      where: { tenantId: ctx.tenantId, chaveIdempotencia: chave },
      include: { itens: true, pagamentos: true },
    });
    if (!existente) return null;

    // Normaliza à escala das colunas (Decimal(18,2) e taxaIva Decimal(9,6)), como o Postgres grava.
    const n = (v: unknown, casas = 2) => new Prisma.Decimal(String(v)).toFixed(casas);
    const assinaturaLinha = (l: {
      produtoId: string;
      varianteId?: string | null;
      quantidade: unknown;
      precoUnitario: unknown;
      desconto: unknown;
      taxaIva: unknown;
    }) =>
      [l.produtoId, l.varianteId ?? '', n(l.quantidade), n(l.precoUnitario), n(l.desconto), n(l.taxaIva, 6)].join('|');
    const assinaturaPagamento = (p: { tipo: string; valor: unknown }) => `${p.tipo}|${n(p.valor)}`;
    const ordenadas = (xs: string[]) => [...xs].sort().join('\n');

    const mesmoConteudo =
      (existente.clienteId ?? null) === (input.clienteId ?? null) &&
      existente.origem === input.origem &&
      ordenadas(existente.itens.map(assinaturaLinha)) === ordenadas(input.itens.map(assinaturaLinha)) &&
      ordenadas(existente.pagamentos.map(assinaturaPagamento)) ===
        ordenadas(input.pagamentos.map(assinaturaPagamento));

    if (!mesmoConteudo) {
      throw new BusinessRuleError(
        'CHAVE_IDEMPOTENCIA_REUTILIZADA',
        'Esta chave de idempotência já foi usada numa venda com outro conteúdo.',
      );
    }
    return mapVendaRow({ ...existente, historicoEstado: [] });
  }

  private async _criarEmTx(
    input: CreateVendaInput,
    ctx: Ctx,
    {
      totais,
      itensTotais,
      dataVenda,
      posACredito,
      statusInicial,
    }: {
      totais: ReturnType<typeof calcularTotaisVendaPOS>;
      itensTotais: Array<
        { item: CreateVendaInput['itens'][number] } & ReturnType<typeof calcularTotaisVendaPOS>['linhas'][number]
      >;
      dataVenda: Date;
      posACredito: boolean;
      statusInicial: StatusVenda;
    },
  ): Promise<VendaRow> {
    const { subtotal: subtotalTotal, ivaTotal: ivaTotalAcc, total } = totais;
    return prisma.$transaction(async (tx) => {
      // 3. Crédito exige cliente identificado (ADR-0041 §4) — antes de gastar qualquer número.
      const clienteCredito = posACredito ? await _clienteDoCredito(tx as Prisma.TransactionClient, input, ctx) : null;

      // 3a. Número de série
      const numero = await this.faturacaoService.proximoNumeroSerie(
        tx as Prisma.TransactionClient,
        'VENDA' as TipoSerieDocumento,
        ctx,
        dataVenda,
      );

      // 3b. Resolver armazém padrão do tenant (usado em POS e ENCOMENDA)
      const armazemId = await _resolverArmazem(tx as TxClient, ctx);

      // 3c. Criar Venda
      const venda = await tx.venda.create({
        data: {
          tenantId: ctx.tenantId,
          numero,
          origem: input.origem,
          status: statusInicial,
          clienteId: input.clienteId ?? null,
          vendedorId: input.vendedorId,
          sessaoPOSId: input.sessaoPOSId ?? null,
          sessaoCaixaId: input.sessaoCaixaId ?? null,
          faturaId: null,
          enderecoEntregaId: input.enderecoEntregaId ?? null,
          dataEntregaPrevista: input.dataEntregaPrevista ?? null,
          subtotal: subtotalTotal,
          descontoTotal: new Prisma.Decimal(0),
          ivaTotal: ivaTotalAcc,
          total,
          currency: 'MZN',
          observacoes: input.observacoes ?? null,
          chaveIdempotencia: input.chaveIdempotencia ?? null,
          dataVenda,
          itens: {
            create: itensTotais.map(({ item, subtotal, ivaItem, total: tot }) => ({
              tenantId: ctx.tenantId,
              produtoId: item.produtoId,
              varianteId: item.varianteId ?? null,
              nomeProduto: item.nomeProduto,
              sku: item.sku ?? null,
              quantidade: new Prisma.Decimal(String(item.quantidade)),
              precoUnitario: new Prisma.Decimal(String(item.precoUnitario)),
              desconto: new Prisma.Decimal(String(item.desconto)),
              taxaIva: new Prisma.Decimal(String(item.taxaIva)),
              subtotal,
              ivaItem,
              total: tot,
            })),
          },
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
        include: { itens: true, pagamentos: true },
      });

      // 3d. Efeitos laterais de POS: baixar stock (WS A) + mover caixa (WS D)
      if (input.origem === 'POS') {
        for (const { item } of itensTotais) {
          const baixaInput: BaixaStockInput = {
            produtoId: item.produtoId,
            varianteProdutoId: item.varianteId,
            localizacaoOrigemId: input.localizacaoOrigemId ?? armazemId,
            quantidade: item.quantidade,
            documentoReferenciaId: venda.id,
            documentoReferenciaTipo: 'Venda',
          };
          await this.stockService.baixarStock(tx as TxClient, baixaInput, ctx);
        }

        // Documento fiscal + lançamento na MESMA transacção (ADR-0041 §1, §3, §4).
        const fatura = await this._emitirDocumentoPOS(
          tx as Prisma.TransactionClient,
          input,
          venda.id,
          itensTotais,
          dataVenda,
          clienteCredito,
          ctx,
        );
        venda.faturaId = fatura.id;

        // Só o dinheiro entra na gaveta (ADR-0041 §4).
        const dinheiro = venda.pagamentos
          .filter((p) => p.tipo === 'DINHEIRO')
          .reduce((a, p) => a.plus(p.valor), new Prisma.Decimal(0));
        if (input.sessaoCaixaId && dinheiro.greaterThan(0)) {
          const movInput: RegistarMovimentoCaixaInput = {
            sessaoCaixaId: input.sessaoCaixaId,
            tipo: 'VENDA',
            valor: dinheiro,
            descricao: `Venda ${numero}`,
            documentoOrigemId: venda.id,
            documentoOrigemTipo: 'Venda',
          };
          await this.caixaService.registarMovimentoCaixa(tx as TxClient, movInput, ctx);
        }
      }

      // 3e. ENCOMENDA: reservar stock por item (WS A)
      //     ReservaStock.documentoReferenciaId = venda.id permite lookup ao cancelar/confirmar.
      if (input.origem === 'ENCOMENDA') {
        for (const { item } of itensTotais) {
          const reservaInput: ReservaStockInput = {
            produtoId: item.produtoId,
            varianteProdutoId: item.varianteId,
            localizacaoId: input.localizacaoOrigemId ?? armazemId,
            quantidade: item.quantidade,
            documentoReferenciaId: venda.id,
            documentoReferenciaTipo: 'Venda',
          };
          await this.stockService.reservarStock(tx as TxClient, reservaInput, ctx);
        }
      }

      // 3f. Histórico de estado inicial
      await tx.historicoEstadoVenda.create({
        data: {
          tenantId: ctx.tenantId,
          vendaId: venda.id,
          estadoAntes: 'PENDENTE', // pré-criação
          estadoDepois: statusInicial,
          motivo: 'Venda criada',
          userId: ctx.userId,
        },
      });

      return mapVendaRow({ ...venda, historicoEstado: [] });
    });
  }

  /**
   * Documento fiscal da venda POS (ADR-0041 §1–§4), ligado à venda nos dois sentidos, com
   * lançamento D meio de pagamento (CREDITO → 411) / C 711 / C 44331:
   *   - paga: Factura-Recibo (série FATURA_RECIBO, PAGA); sem cliente, contra o Consumidor Final (§2);
   *   - com parte a crédito: Factura (série FATURA), EMITIDA ou PARCIALMENTE_PAGA pelo que foi
   *     recebido nos outros meios, vencimento = emissão + prazo do cliente.
   */
  private async _emitirDocumentoPOS(
    tx: Prisma.TransactionClient,
    input: CreateVendaInput,
    vendaId: string,
    itensTotais: Array<{
      item: CreateVendaInput['itens'][number];
      subtotal: Prisma.Decimal;
      ivaItem: Prisma.Decimal;
      total: Prisma.Decimal;
    }>,
    dataVenda: Date,
    clienteCredito: { id: string; diasPagamento: number } | null,
    ctx: Ctx,
  ) {
    let clienteId = clienteCredito?.id ?? input.clienteId;
    if (!clienteId) {
      const cf = await tx.cliente.findFirst({
        where: { tenantId: ctx.tenantId, codigo: CLIENTE_CONSUMIDOR_FINAL.codigo },
        select: { id: true },
      });
      if (!cf) {
        throw new BusinessRuleError(
          'CONSUMIDOR_FINAL_INEXISTENTE',
          `O cliente técnico ${CLIENTE_CONSUMIDOR_FINAL.nome} (${CLIENTE_CONSUMIDOR_FINAL.codigo}) não existe neste tenant.`,
        );
      }
      clienteId = cf.id;
    }

    const pagamentos = input.pagamentos.map((p) => ({ tipo: p.tipo, valor: new Prisma.Decimal(String(p.valor)) }));
    // Conta a débito por meio configurada pelo tenant; os ausentes caem na omissão (ADR-0041 §4).
    const contas = await this.meioPagamentoPOSService.resolverContasPagamentoPOS(tx, ctx);
    const fatura = await this.faturacaoService.emitirDocumentoEmTx(
      tx,
      {
        clienteId,
        vendaId,
        moeda: 'MZN',
        dataEmissao: dataVenda,
        dataVencimento: clienteCredito
          ? new Date(dataVenda.getTime() + clienteCredito.diasPagamento * DIA_MS)
          : dataVenda,
        linhas: itensTotais.map(({ item, subtotal, ivaItem, total }, i) => {
          const bruto = new Prisma.Decimal(String(item.quantidade)).mul(new Prisma.Decimal(String(item.precoUnitario)));
          return {
            produtoId: item.produtoId,
            descricao: item.nomeProduto,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            // Na factura o desconto é um valor, não uma percentagem.
            desconto: bruto.minus(subtotal).toDecimalPlaces(2).toNumber(),
            taxaIva: item.taxaIva,
            subtotal: subtotal.toNumber(),
            ivaItem: ivaItem.toNumber(),
            total: total.toNumber(),
            ordemLinha: i,
          };
        }),
      },
      ctx,
      {
        // FR nasce PAGA pela série (§1); a Factura nasce com o que foi recebido fora do crédito (§4).
        ...(clienteCredito
          ? {
              tipoSerie: 'FATURA' as const,
              totalPago: pagamentos.filter((p) => p.tipo !== 'CREDITO').reduce((a, p) => a.plus(p.valor), new Prisma.Decimal(0)),
            }
          : { tipoSerie: 'FATURA_RECIBO' as const }),
        construirLancamento: (doc) => this.faturacaoService.construirLancamentoVendaPOS(doc, pagamentos, contas),
      },
    );

    await tx.venda.updateMany({ where: { id: vendaId, tenantId: ctx.tenantId }, data: { faturaId: fatura.id } });
    return fatura;
  }

  async transitar(input: TransitarVendaInput, ctx: Ctx): Promise<VendaRow> {
    const venda = await prisma.venda.findUnique({
      where: { id: input.vendaId },
      include: { itens: true },
    });

    if (!venda || venda.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Venda ${input.vendaId} não encontrada`);
    }

    // Valida transição (lança BusinessRuleError se inválida)
    transitarVenda(venda.status as StatusVenda, input.paraStatus);

    return prisma.$transaction(async (tx) => {
      // Efeitos laterais da transição
      if (input.paraStatus === 'CANCELADA') {
        if (venda.origem === 'ENCOMENDA') {
          // Liberta todas as reservas activas desta venda (por documentoReferenciaId)
          const reservasAtivas = await tx.reservaStock.findMany({
            where: { tenantId: ctx.tenantId, documentoReferenciaId: venda.id, status: 'ATIVA' },
            select: { id: true },
          });
          for (const reserva of reservasAtivas) {
            await this.stockService.libertarStock(tx as TxClient, reserva.id, ctx);
          }
        }
        // Anular comissões pendentes
        await tx.comissao.updateMany({
          where: { tenantId: ctx.tenantId, vendaId: venda.id, status: 'PENDENTE' },
          data: { status: 'CANCELADA' },
        });
      }

      if (input.paraStatus === 'FATURADA' && venda.origem === 'ENCOMENDA') {
        // Confirma consumo das reservas activas — gera MovimentoStock(SAIDA)
        const reservasAtivas = await tx.reservaStock.findMany({
          where: { tenantId: ctx.tenantId, documentoReferenciaId: venda.id, status: 'ATIVA' },
          select: { id: true },
        });
        for (const reserva of reservasAtivas) {
          await this.stockService.confirmarConsumoStock(tx as TxClient, reserva.id, ctx);
        }
      }

      if (input.paraStatus === 'DEVOLVIDA') {
        // Entrada de stock por devolução ao armazém padrão
        const armazemId = await _resolverArmazem(tx as TxClient, ctx);
        for (const item of venda.itens) {
          const entradaInput: import('@/lib/validations/stock').EntradaStockInput = {
            produtoId: item.produtoId,
            varianteProdutoId: item.varianteId ?? undefined,
            localizacaoDestinoId: armazemId,
            quantidade: Number(item.quantidade.toString()),
            documentoReferenciaId: venda.id,
            documentoReferenciaTipo: 'DevolucaoVenda',
          };
          await this.stockService.entradaStock(tx as TxClient, entradaInput, ctx);
        }
      }

      // Atualizar estado
      const atualizada = await tx.venda.update({
        where: { id: venda.id },
        data: { status: input.paraStatus },
        include: { itens: true, pagamentos: true },
      });

      // Registar histórico (append-only)
      await tx.historicoEstadoVenda.create({
        data: {
          tenantId: ctx.tenantId,
          vendaId: venda.id,
          estadoAntes: venda.status,
          estadoDepois: input.paraStatus,
          motivo: input.motivo ?? null,
          userId: ctx.userId,
        },
      });

      return mapVendaRow(atualizada);
    });
  }

  async buscarPorId(id: string, ctx: Ctx): Promise<VendaRow> {
    const venda = await prisma.venda.findUnique({
      where: { id },
      include: { itens: true, pagamentos: true, historicoEstado: { orderBy: { createdAt: 'asc' } } },
    });

    if (!venda || venda.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Venda ${id} não encontrada`);
    }

    return mapVendaRow(venda);
  }

  async listar(filtros: FilterVendaInput, ctx: Ctx): Promise<PaginatedVendas> {
    const page = await paginate<{ id: string }>(
      (args) =>
        prisma.venda.findMany({
          ...args,
          where: {
            ...(filtros.q
              ? {
                  OR: [
                    { numero: { contains: filtros.q, mode: 'insensitive' } },
                    { cliente: { nome: { contains: filtros.q, mode: 'insensitive' } } },
                  ],
                }
              : {}),
            ...(filtros.origem ? { origem: filtros.origem } : {}),
            ...(filtros.status ? { status: filtros.status } : {}),
            ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
            ...(filtros.vendedorId ? { vendedorId: filtros.vendedorId } : {}),
            ...(filtros.sessaoPOSId ? { sessaoPOSId: filtros.sessaoPOSId } : {}),
            ...(filtros.dataInicio || filtros.dataFim
              ? {
                  dataVenda: {
                    ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
                    ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
                  },
                }
              : {}),
          },
          orderBy: { [filtros.orderBy]: filtros.order } as Prisma.VendaOrderByWithRelationInput,
          include: { cliente: { select: { nome: true } } },
        }) as Promise<{ id: string }[]>,
      { cursor: filtros.cursor, take: filtros.take },
    );

    return {
      items: (page.items as unknown as VendaComCliente[]).map(mapVendaSummary),
      nextCursor: page.nextCursor,
    };
  }

  async atualizar(id: string, input: UpdateVendaInput, ctx: Ctx): Promise<VendaRow> {
    const venda = await prisma.venda.findUnique({
      where: { id },
      select: { tenantId: true, status: true },
    });

    if (!venda || venda.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Venda ${id} não encontrada`);
    }

    if (!(['RASCUNHO', 'PENDENTE'] as StatusVenda[]).includes(venda.status as StatusVenda)) {
      throw new BusinessRuleError(
        'VENDA_NAO_EDITAVEL',
        `Venda no estado ${venda.status} não pode ser editada`,
      );
    }

    const atualizada = await prisma.venda.update({
      where: { id },
      data: {
        ...(input.clienteId !== undefined ? { clienteId: input.clienteId } : {}),
        ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
      },
      include: { itens: true, pagamentos: true },
    });

    return mapVendaRow(atualizada);
  }
}

// ---------------------------------------------------------------------------
// SessaoPOSService
// ---------------------------------------------------------------------------

export class SessaoPOSService implements ISessaoPOSService {
  async abrir(input: AbrirSessaoPOSInput, ctx: Ctx): Promise<SessaoPOSRow> {
    // Sessões POS ABERTAS cuja caixa já não está ABERTA são órfãs (nenhuma venda
    // passaria: SESSAO_CAIXA_FECHADA). Fecham-se aqui para o vendedor poder recomeçar.
    const abertas = await prisma.sessaoPOS.findMany({
      where: { tenantId: ctx.tenantId, vendedorId: ctx.userId, status: 'ABERTA' },
    });
    const caixasAbertas = await this.caixasAbertas(abertas.map((s) => s.sessaoCaixaId), ctx);
    const orfas = abertas.filter((s) => !caixasAbertas.has(s.sessaoCaixaId));
    if (orfas.length > 0) {
      await prisma.sessaoPOS.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: orfas.map((s) => s.id) }, status: 'ABERTA' },
        data: { status: 'FECHADA', fechadoEm: new Date() },
      });
    }
    const sessaoExistente = abertas.find((s) => caixasAbertas.has(s.sessaoCaixaId));

    if (sessaoExistente) {
      throw new BusinessRuleError(
        'SESSAO_JA_ABERTA',
        `Já existe uma sessão POS aberta (${sessaoExistente.id}) para este vendedor`,
      );
    }

    const nova = await prisma.sessaoPOS.create({
      data: {
        tenantId: ctx.tenantId,
        vendedorId: ctx.userId,
        sessaoCaixaId: input.sessaoCaixaId,
        status: 'ABERTA',
        abertoEm: new Date(),
        totalVendas: new Prisma.Decimal(0),
        numeroPedidos: 0,
      },
    });

    return mapSessaoPOSRow(nova);
  }

  async fechar(input: FecharSessaoPOSInput, ctx: Ctx): Promise<SessaoPOSRow> {
    const sessao = await prisma.sessaoPOS.findUnique({ where: { id: input.sessaoPOSId } });

    if (!sessao || sessao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Sessão POS ${input.sessaoPOSId} não encontrada`);
    }

    transitarSessaoPOS(sessao.status as StatusSessaoPOS, 'FECHADA');

    // Verificar vendas pendentes
    const vendasPendentes = await prisma.venda.count({
      where: { sessaoPOSId: sessao.id, status: 'PENDENTE' },
    });

    if (vendasPendentes > 0) {
      throw new BusinessRuleError(
        'SESSAO_COM_VENDAS_PENDENTES',
        `Existem ${vendasPendentes} vendas pendentes. Feche-as antes de encerrar a sessão.`,
      );
    }

    const fechada = await prisma.sessaoPOS.update({
      where: { id: sessao.id },
      data: { status: 'FECHADA', fechadoEm: new Date() },
    });

    return mapSessaoPOSRow(fechada);
  }

  async suspender(sessaoPOSId: string, ctx: Ctx): Promise<SessaoPOSRow> {
    const sessao = await prisma.sessaoPOS.findUnique({ where: { id: sessaoPOSId } });
    if (!sessao || sessao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Sessão POS ${sessaoPOSId} não encontrada`);
    }

    transitarSessaoPOS(sessao.status as StatusSessaoPOS, 'SUSPENSA');

    const suspensa = await prisma.sessaoPOS.update({
      where: { id: sessaoPOSId },
      data: { status: 'SUSPENSA' },
    });

    return mapSessaoPOSRow(suspensa);
  }

  async retomar(sessaoPOSId: string, ctx: Ctx): Promise<SessaoPOSRow> {
    const sessao = await prisma.sessaoPOS.findUnique({ where: { id: sessaoPOSId } });
    if (!sessao || sessao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Sessão POS ${sessaoPOSId} não encontrada`);
    }

    transitarSessaoPOS(sessao.status as StatusSessaoPOS, 'ABERTA');

    const retomada = await prisma.sessaoPOS.update({
      where: { id: sessaoPOSId },
      data: { status: 'ABERTA' },
    });

    return mapSessaoPOSRow(retomada);
  }

  async obterAtual(ctx: Ctx): Promise<SessaoPOSRow | null> {
    // Só leitura (corre no render de /pos): uma sessão POS sobre uma caixa já não
    // ABERTA conta como fechada — o `abrir` seguinte fecha-a de facto.
    const abertas = await prisma.sessaoPOS.findMany({
      where: { tenantId: ctx.tenantId, vendedorId: ctx.userId, status: 'ABERTA' },
      orderBy: { abertoEm: 'desc' },
    });
    const caixasAbertas = await this.caixasAbertas(abertas.map((s) => s.sessaoCaixaId), ctx);
    const sessao = abertas.find((s) => caixasAbertas.has(s.sessaoCaixaId));

    return sessao ? mapSessaoPOSRow(sessao) : null;
  }

  /** Ids (de entre `ids`) das sessões de caixa ainda ABERTAS — leitura cross-domínio estreita. */
  private async caixasAbertas(ids: string[], ctx: Ctx): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const caixas = await prisma.sessaoCaixa.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ids }, status: 'ABERTA' },
      select: { id: true },
    });
    return new Set(caixas.map((c) => c.id));
  }

  async buscarPorId(id: string, ctx: Ctx): Promise<SessaoPOSRow> {
    const sessao = await prisma.sessaoPOS.findUnique({ where: { id } });
    if (!sessao || sessao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Sessão POS ${id} não encontrada`);
    }
    return mapSessaoPOSRow(sessao);
  }
}

// Exporta referências de estado para uso em testes/outros módulos
export { TRANSICOES_VENDA, TRANSICOES_SESSAO_POS, transitarVenda, transitarSessaoPOS };
