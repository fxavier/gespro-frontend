/**
 * Implementação do serviço de Contas a Pagar — WS B (Wave 3)
 * Integração real: liquidação → registarLancamentoContabilistico (WS D).
 */
import 'server-only';

import { Prisma, PrismaClient, type TipoAquisicaoIva } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import { registarLancamentoContabilistico } from '@/server/services/financas/contabilidade.service';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import { resolverContaMeioPagamento } from '@/server/services/financas/meio-pagamento.service';
import { registarMovimentoCaixa } from '@/server/services/financas/caixa.service';
import type {
  IContaPagarService,
  ContaPagarDetalhe,
  ContaPagarResumo,
  PagamentoDto,
  AgingRelatorio,
  AgingLinha,
  StatusContaPagar,
  StatusPagamento,
} from './conta-pagar.service.interface';
import {
  TRANSICOES_CONTA_PAGAR,
  TRANSICOES_PAGAMENTO,
  transitarContaPagar,
  transitarPagamento,
} from './conta-pagar.service.interface';
import type {
  CreateContaPagarInput,
  FilterContaPagarInput,
  CreatePagamentoInput,
  FilterPagamentoInput,
} from '@/lib/validations/compras';
import type { Ctx } from '@/server/services/types';

const db = prisma as unknown as PrismaClient;

// =====================================================================
// Funções puras — exportadas para testes
// =====================================================================

/** Calcular dias de atraso a partir da data de vencimento. */
export function calcularDiasAtraso(dataVencimento: Date, agora = new Date()): number {
  const diff = Math.floor((agora.getTime() - dataVencimento.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

/** Determinar bucket de aging (em dias de atraso). */
export function bucketAging(diasAtraso: number): 'corrente' | 'ate30Dias' | 'de31a60Dias' | 'de61a90Dias' | 'acima90Dias' {
  if (diasAtraso <= 0) return 'corrente';
  if (diasAtraso <= 30) return 'ate30Dias';
  if (diasAtraso <= 60) return 'de31a60Dias';
  if (diasAtraso <= 90) return 'de61a90Dias';
  return 'acima90Dias';
}

// =====================================================================
// =====================================================================
// Mappers BD → DTO
// =====================================================================

function toContaPagarResumo(c: any): ContaPagarResumo {
  return {
    id: c.id, numero: c.numero,
    fornecedorId: c.fornecedorId,
    fornecedorNome: c.fornecedor?.nome ?? c.fornecedorId,
    descricao: c.descricao,
    valorOriginal: Number(c.valorOriginal),
    valorPago: Number(c.valorPago ?? 0),
    valorRestante: Number(c.valorRestante ?? c.valorOriginal),
    dataEmissao: c.dataEmissao,
    dataVencimento: c.dataVencimento,
    status: c.status,
    diasAtraso: calcularDiasAtraso(new Date(c.dataVencimento)),
  };
}

function toContaPagarDetalhe(c: any): ContaPagarDetalhe {
  return {
    ...toContaPagarResumo(c),
    pedidoCompraId: c.pedidoCompraId ?? null,
    centroCustoId: c.centroCustoId ?? null,
    contaContabilId: c.contaContabilId ?? null,
    observacoes: c.observacoes ?? null,
    pagamentos: (c.pagamentos ?? []).map(toPagamentoDto),
  };
}

function toPagamentoDto(p: any): PagamentoDto {
  return {
    id: p.id, numero: p.numero,
    dataPagamento: p.dataPagamento,
    valor: Number(p.valor),
    formaPagamento: p.formaPagamento,
    referencia: p.referencia ?? null,
    status: p.status,
    lancamentoId: p.lancamentoId ?? null,
  };
}

// =====================================================================
// Implementação
// =====================================================================

// Mapeamento tipoAquisicao → conta PGC de IVA dedutível (ADR-0034 §1)
export const MAPA_4432X: Record<TipoAquisicaoIva, string> = {
  INVENTARIOS:          '44321',
  ATIVOS:               '44322',
  OUTROS_BENS_SERVICOS: '44323',
};

/**
 * Lança o reconhecimento da dívida ao fornecedor dentro de uma transacção existente.
 *
 * Aceita `contaCodigo` (código PGC, ex.: '211', '3111') — padrão do produto
 * (ver PGC_PAYROLL em payroll.service.ts e PGC_COMPRAS em compras.service.ts).
 * O chamador resolve o código; esta função constrói e submete o lançamento.
 *
 * Lançamento:
 * - Com IVA dedutível (tipoAquisicao + baseIva + valorIva definidos):
 *     D contaCodigo(baseIva) + D 4432x(valorIva) / C 421(valorOriginal)
 * - Sem IVA dedutível:
 *     D contaCodigo(valorOriginal) / C 421(valorOriginal)
 *
 * A invariante débitos=créditos é verificada por registarLancamentoContabilistico
 * e faz a criação falhar se os valores não fecharem — nunca silencia desequilíbrio.
 *
 * Exportada para ser partilhada por `compras.service.ts` sem duplicar a lógica.
 */
export async function lancarReconhecimentoDivida(
  tx: Prisma.TransactionClient,
  params: {
    contaPagarId: string;
    numero: string;
    descricao: string;
    /** Código PGC da conta de gasto/existências (ex.: '211', '3111') */
    contaCodigo: string;
    valorOriginal: number | Prisma.Decimal;
    tipoAquisicao: TipoAquisicaoIva | null;
    baseIva: number | Prisma.Decimal | null;
    valorIva: number | Prisma.Decimal | null;
    dataLancamento: Date;
  },
  ctx: Ctx,
): Promise<void> {
  const valorOrig = String(params.valorOriginal);
  let partidas: Array<{ contaCodigo: string; tipo: 'DEBITO' | 'CREDITO'; valor: string }>;

  if (params.tipoAquisicao && params.baseIva != null && params.valorIva != null) {
    // D gasto(baseIva) + D 4432x(valorIva) / C 421(valorOriginal)
    partidas = [
      { contaCodigo: params.contaCodigo,                    tipo: 'DEBITO',  valor: String(params.baseIva) },
      { contaCodigo: MAPA_4432X[params.tipoAquisicao],      tipo: 'DEBITO',  valor: String(params.valorIva) },
      { contaCodigo: '421',                                 tipo: 'CREDITO', valor: valorOrig },
    ];
  } else {
    // Sem IVA dedutível: D gasto(total) / C 421(total)
    partidas = [
      { contaCodigo: params.contaCodigo, tipo: 'DEBITO',  valor: valorOrig },
      { contaCodigo: '421',              tipo: 'CREDITO', valor: valorOrig },
    ];
  }

  await registarLancamentoContabilistico(
    tx,
    {
      data: params.dataLancamento,
      diarioTipo: 'COMPRAS',
      origem: 'COMPRA',
      documentoOrigemId: params.contaPagarId,
      documentoOrigemTipo: 'ContaPagar',
      historico: `Reconhecimento ${params.numero} — ${params.descricao}`,
      partidas,
    },
    ctx,
  );
}

export const contaPagarService: IContaPagarService = {
  /**
   * Cria uma conta a pagar e lança o reconhecimento da dívida ao fornecedor (ADR-0034 §1).
   *
   * Lançamento: D <gasto|existências> [+ D 4432x] / C 421 Fornecedores c/c
   *
   * Decisões de design:
   * 1. contaContabilId obrigatório: sem ele não é possível equilibrar o débito de gasto/existências.
   *    Recusa com CONTA_CONTABIL_OBRIGATORIA.
   * 2. Se tipoAquisicao está presente e numeroDocumento está ausente: recusa toda a criação com
   *    DOCUMENTO_FORNECEDOR_INCOMPLETO. O chamador está a afirmar um facto fiscal (IVA dedutível
   *    existe) mas sem o documento que o suporta; criar a conta sem lançar o dedutível deixaria
   *    o razão com uma dívida mas sem o direito à dedução registado — não é recuperável sem
   *    estorno + recriação. Se tipoAquisicao está ausente, lança D gasto(total) / C 421 sem IVA.
   * 3. nuitFornecedor é sempre copiado do Fornecedor neste momento (não relido no apuramento),
   *    porque o NUIT do fornecedor pode mudar e o do documento é imutável.
   * 4. A data do lançamento é dataDocumento (se presente), senão dataEmissao — é a dataDocumento
   *    que define o período de dedução (§1 do ADR), não a data de criação da conta a pagar.
   * 5. Número, ContaPagar e lançamento estão numa única $transaction: se o lançamento falhar
   *    (ex.: período fechado), não fica lacuna na série nem conta a pagar semi-criada.
   */
  async criar(input: CreateContaPagarInput, ctx: Ctx): Promise<ContaPagarDetalhe> {
    // Guarda de contaContabilId antes de entrar na transacção (falha rápida, sem consumir número)
    if (!input.contaContabilId) {
      throw new BusinessRuleError(
        'CONTA_CONTABIL_OBRIGATORIA',
        'A conta contabilística de gasto/existências (contaContabilId) é obrigatória para registar o reconhecimento da dívida.',
      );
    }

    // Guarda de documento fiscal (falha rápida)
    if (input.tipoAquisicao && !input.numeroDocumento) {
      throw new BusinessRuleError(
        'DOCUMENTO_FORNECEDOR_INCOMPLETO',
        'Para registar IVA dedutível (tipoAquisicao definido) é obrigatório indicar o número do documento do fornecedor (numeroDocumento).',
      );
    }

    const conta = await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      const txClient = rawTx as unknown as Prisma.TransactionClient;

      // 1. Obter e avançar a série (dentro da mesma tx — sem lacunas se o resto falhar)
      const numero = await proximoNumeroSerie(txClient, 'CONTA_PAGAR', ctx, input.dataEmissao);

      // 2. Carregar fornecedor para copiar o NUIT no momento do registo
      const fornecedor = await tx.fornecedor.findUnique({
        where: { id: input.fornecedorId },
        select: { nuit: true, tenantId: true },
      });
      if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) {
        throw new NotFoundError('Fornecedor não encontrado');
      }

      // 3. Resolver e validar a conta PGC de gasto/existências
      const contaPGC = await tx.contaPGC.findUnique({
        where: { id: input.contaContabilId! },
        select: { codigo: true, tenantId: true },
      });
      if (!contaPGC || contaPGC.tenantId !== ctx.tenantId) {
        throw new NotFoundError('Conta contabilística não encontrada');
      }

      // 4. Criar ContaPagar com bloco fiscal populado
      const { tipoAquisicao, baseIva, taxaIva, valorIva, numeroDocumento, dataDocumento, ...restInput } = input;
      const contaCriada = await tx.contaPagar.create({
        data: {
          tenantId: ctx.tenantId,
          numero,
          ...restInput,
          nuitFornecedor: fornecedor.nuit,
          numeroDocumento:  numeroDocumento ?? null,
          dataDocumento:    dataDocumento ?? null,
          baseIva:          baseIva   != null ? new Prisma.Decimal(String(baseIva))  : null,
          taxaIva:          taxaIva   != null ? new Prisma.Decimal(String(taxaIva))  : null,
          valorIva:         valorIva  != null ? new Prisma.Decimal(String(valorIva)) : null,
          tipoAquisicao:    tipoAquisicao ?? null,
          valorPago: 0,
          valorRestante: input.valorOriginal,
          status: 'ABERTA',
        },
        include: { fornecedor: { select: { nome: true } }, pagamentos: true },
      });

      // 5. Lançamento de reconhecimento da dívida (ADR-0034 §1)
      //    Data = dataDocumento (define o período de dedução) ou dataEmissao se ausente
      await lancarReconhecimentoDivida(
        txClient,
        {
          contaPagarId:  contaCriada.id,
          numero,
          descricao:     input.descricao,
          contaCodigo:   contaPGC.codigo,
          valorOriginal: input.valorOriginal,
          tipoAquisicao: tipoAquisicao ?? null,
          baseIva:       baseIva  ?? null,
          valorIva:      valorIva ?? null,
          dataLancamento: dataDocumento ?? input.dataEmissao,
        },
        ctx,
      );

      return contaCriada;
    });

    return toContaPagarDetalhe(conta);
  },

  async obter(id: string, ctx: Ctx): Promise<ContaPagarDetalhe> {
    const conta = await db.contaPagar.findUnique({
      where: { id },
      include: { fornecedor: { select: { nome: true } }, pagamentos: true },
    });
    if (!conta || conta.tenantId !== ctx.tenantId) throw new NotFoundError('Conta a pagar não encontrada');
    return toContaPagarDetalhe(conta);
  },

  async listar(filtros: FilterContaPagarInput, ctx: Ctx) {
    const { status, fornecedorId, vencidas, cursor, take = 25, orderBy = 'dataVencimento', orderDir = 'asc' } = filtros;
    const agora = new Date();
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(fornecedorId ? { fornecedorId } : {}),
      ...(vencidas ? { dataVencimento: { lt: agora }, status: { in: ['ABERTA', 'PARCIALMENTE_PAGA'] } } : {}),
    };
    return paginate(
      (a) => db.contaPagar.findMany({
        ...a, where,
        include: { fornecedor: { select: { nome: true } } },
        orderBy: { [orderBy]: orderDir },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toContaPagarResumo), nextCursor: p.nextCursor }));
  },

  async cancelar(id: string, motivo: string, ctx: Ctx): Promise<void> {
    const conta = await db.contaPagar.findUnique({ where: { id } });
    if (!conta || conta.tenantId !== ctx.tenantId) throw new NotFoundError('Conta a pagar não encontrada');
    transitarContaPagar(conta.status as StatusContaPagar, 'CANCELADA');
    await db.contaPagar.update({ where: { id }, data: { status: 'CANCELADA', observacoes: motivo } });
  },

  async actualizarVencidas(ctx: Ctx): Promise<number> {
    const agora = new Date();
    const result = await db.contaPagar.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ABERTA', 'PARCIALMENTE_PAGA'] },
        dataVencimento: { lt: agora },
      },
      data: { status: 'VENCIDA' },
    });
    return result.count;
  },

  async registarPagamento(input: CreatePagamentoInput, ctx: Ctx): Promise<PagamentoDto> {
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      const txClient = rawTx as unknown as Prisma.TransactionClient;

      // 1. Resolver o meio de pagamento ANTES de qualquer escrita: se a
      //    validação falhar (sessão fechada, conta inactiva, etc.) não fica
      //    nada a meio.
      const meio = await resolverContaMeioPagamento(
        txClient,
        { forma: input.formaPagamento, contaBancariaId: input.contaBancariaId },
        ctx,
      );

      const conta = await tx.contaPagar.findUnique({
        where: { id: input.contaPagarId },
        include: { pagamentos: true },
      });
      if (!conta || conta.tenantId !== ctx.tenantId) throw new NotFoundError('Conta a pagar não encontrada');

      const statusBloqueados: StatusContaPagar[] = ['PAGA', 'CANCELADA'];
      if (statusBloqueados.includes(conta.status as StatusContaPagar)) {
        throw new BusinessRuleError('ESTADO_INVALIDO', 'Conta a pagar já liquidada ou cancelada');
      }

      const valorRestante = new Prisma.Decimal(String(conta.valorRestante ?? conta.valorOriginal));
      const valorPagamento = new Prisma.Decimal(String(input.valor));
      if (valorPagamento.greaterThan(valorRestante.plus(new Prisma.Decimal('0.001')))) {
        throw new BusinessRuleError(
          'PAGAMENTO_EXCEDIDO',
          `Valor do pagamento (${valorPagamento.toFixed(2)}) excede o valor restante (${valorRestante.toFixed(2)})`,
        );
      }

      const numero = await proximoNumeroSerie(txClient, 'PAGAMENTO', ctx, input.dataPagamento);

      // 2. Criar pagamento primeiro para ter o id disponível para o lançamento
      //    e para o MovimentoCaixa (documentoOrigemId)
      const pagamento = await tx.pagamento.create({
        data: {
          tenantId: ctx.tenantId, numero,
          contaPagarId: conta.id,
          dataPagamento: input.dataPagamento,
          valor: valorPagamento,
          formaPagamento: input.formaPagamento,
          referencia: input.referencia,
          observacoes: input.observacoes,
          status: 'CONCLUIDO',
        },
      });

      // 3. Lançamento contabilístico: D 421 / C <contaCodigo> no diário resolvido
      const lancamento = await registarLancamentoContabilistico(
        txClient,
        {
          data: input.dataPagamento,
          diarioTipo: meio.diarioTipo,
          origem: 'PAGAMENTO',
          documentoOrigemId: pagamento.id,
          documentoOrigemTipo: 'Pagamento',
          historico: `Pagamento ${numero} — ${conta.descricao}`,
          partidas: [
            { contaCodigo: '421',           tipo: 'DEBITO',  valor: valorPagamento.toFixed(2) },
            { contaCodigo: meio.contaCodigo, tipo: 'CREDITO', valor: valorPagamento.toFixed(2) },
          ],
        },
        ctx,
      );

      // 4. Gravar lancamentoId no Pagamento
      await tx.pagamento.update({
        where: { id: pagamento.id },
        data: { lancamentoId: lancamento.id },
      });

      // 5. Em numerário: registar MovimentoCaixa PAGAMENTO na sessão do utilizador
      if (meio.sessaoCaixaId) {
        await registarMovimentoCaixa(
          txClient,
          {
            sessaoCaixaId: meio.sessaoCaixaId,
            tipo: 'PAGAMENTO',
            valor: valorPagamento.toFixed(2),
            descricao: `Pagamento ${numero} — ${conta.descricao}`,
            documentoOrigemTipo: 'Pagamento',
            documentoOrigemId: pagamento.id,
          },
          ctx,
        );
      }

      // 6. Actualizar ContaPagar — manter VENCIDA quando o pagamento é parcial
      const novoValorPago = new Prisma.Decimal(String(conta.valorPago ?? 0)).plus(valorPagamento);
      const novoValorRestante = new Prisma.Decimal(String(conta.valorOriginal)).minus(novoValorPago);

      // Um pagamento parcial numa conta VENCIDA não a «desvence»: continua por
      // pagar e fora de prazo, e VENCIDA → PARCIALMENTE_PAGA nem é transição
      // válida — rebentava com «Transição inválida» (500) no caso mais comum
      // do mundo real, o fornecedor a receber por prestações depois do prazo.
      // Só a liquidação total muda o estado.
      const novoStatus: StatusContaPagar =
        novoValorRestante.lessThanOrEqualTo(new Prisma.Decimal('0.001'))
          ? 'PAGA'
          : conta.status === 'VENCIDA'
            ? 'VENCIDA'
            : 'PARCIALMENTE_PAGA';

      if (novoStatus !== conta.status) {
        transitarContaPagar(conta.status as StatusContaPagar, novoStatus);
      }

      await tx.contaPagar.update({
        where: { id: conta.id },
        data: {
          valorPago: novoValorPago.toNumber(),
          valorRestante: novoValorRestante.lessThan(0) ? 0 : novoValorRestante.toNumber(),
          status: novoStatus,
        },
      });

      return toPagamentoDto(pagamento);
    }) as Promise<PagamentoDto>;
  },

  async listarPagamentos(filtros: FilterPagamentoInput, ctx: Ctx) {
    const { contaPagarId, status, cursor, take = 25 } = filtros;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(contaPagarId ? { contaPagarId } : {}),
      ...(status ? { status } : {}),
    };
    return paginate(
      (a) => db.pagamento.findMany({ ...a, where, orderBy: { dataPagamento: 'desc' } }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toPagamentoDto), nextCursor: p.nextCursor }));
  },

  async relatorioAging(ctx: Ctx): Promise<AgingRelatorio> {
    const agora = new Date();
    const contas = await db.contaPagar.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ABERTA', 'PARCIALMENTE_PAGA', 'VENCIDA'] },
      },
      include: { fornecedor: { select: { nome: true } } },
    });

    const porFornecedor: Record<string, AgingLinha> = {};
    let totalAberto = 0;

    for (const conta of contas) {
      const restante = Number(conta.valorRestante ?? 0);
      if (restante <= 0) continue;

      const id = conta.fornecedorId;
      if (!porFornecedor[id]) {
        porFornecedor[id] = {
          fornecedorId: id,
          fornecedorNome: conta.fornecedor?.nome ?? id,
          corrente: 0, ate30Dias: 0, de31a60Dias: 0, de61a90Dias: 0, acima90Dias: 0, total: 0,
        };
      }

      const dias = calcularDiasAtraso(new Date(conta.dataVencimento), agora);
      const bucket = bucketAging(dias);
      porFornecedor[id][bucket] += restante;
      porFornecedor[id].total += restante;
      totalAberto += restante;
    }

    return {
      dataReferencia: agora,
      linhas: Object.values(porFornecedor),
      totalAberto,
    };
  },

  async saldoAbertoPorFornecedor(fornecedorId: string, ctx: Ctx) {
    const agora = new Date();
    const contas = await db.contaPagar.findMany({
      where: {
        tenantId: ctx.tenantId, fornecedorId,
        status: { in: ['ABERTA', 'PARCIALMENTE_PAGA', 'VENCIDA'] },
      },
    });

    let aberto = 0;
    let vencido = 0;

    for (const conta of contas) {
      const restante = Number(conta.valorRestante ?? 0);
      aberto += restante;
      if (new Date(conta.dataVencimento) < agora) vencido += restante;
    }

    return { aberto, vencido };
  },
};

// Re-exportar para uso nos testes
export { transitarContaPagar, transitarPagamento, TRANSICOES_CONTA_PAGAR, TRANSICOES_PAGAMENTO };
