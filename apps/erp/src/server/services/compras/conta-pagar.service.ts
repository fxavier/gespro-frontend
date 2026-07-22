/**
 * Implementação do serviço de Contas a Pagar — WS B (Wave 3)
 * Integração real: liquidação → registarLancamentoContabilistico (WS D).
 */
import 'server-only';

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import { registarLancamentoContabilistico } from '@/server/services/financas/contabilidade.service';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
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

export const contaPagarService: IContaPagarService = {
  async criar(input: CreateContaPagarInput, ctx: Ctx): Promise<ContaPagarDetalhe> {
    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'CONTA_PAGAR', ctx),
    );

    const conta = await db.contaPagar.create({
      data: {
        tenantId: ctx.tenantId,
        numero, ...input,
        valorPago: 0, valorRestante: input.valorOriginal,
        status: 'ABERTA',
      },
      include: { fornecedor: { select: { nome: true } }, pagamentos: true },
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
      const conta = await tx.contaPagar.findUnique({
        where: { id: input.contaPagarId },
        include: { pagamentos: true },
      });
      if (!conta || conta.tenantId !== ctx.tenantId) throw new NotFoundError('Conta a pagar não encontrada');

      const statusBloqueados: StatusContaPagar[] = ['PAGA', 'CANCELADA'];
      if (statusBloqueados.includes(conta.status as StatusContaPagar)) {
        throw new BusinessRuleError('ESTADO_INVALIDO', 'Conta a pagar já liquidada ou cancelada');
      }

      const valorRestante = Number(conta.valorRestante ?? conta.valorOriginal);
      if (input.valor > valorRestante + 0.001) {
        throw new BusinessRuleError(
          'PAGAMENTO_EXCEDIDO',
          `Valor do pagamento (${input.valor}) excede o valor restante (${valorRestante})`,
        );
      }

      const txClient = tx as unknown as Prisma.TransactionClient;
      const numero = await proximoNumeroSerie(txClient, 'PAGAMENTO', ctx);

      // Criar pagamento primeiro para ter o id disponível para o lançamento
      const pagamento = await tx.pagamento.create({
        data: {
          tenantId: ctx.tenantId, numero,
          contaPagarId: conta.id,
          dataPagamento: input.dataPagamento,
          valor: input.valor,
          formaPagamento: input.formaPagamento,
          referencia: input.referencia,
          observacoes: input.observacoes,
          status: 'CONCLUIDO',
        },
      });

      // Wave 3: registar lançamento contabilístico em WS D.
      // PGC: 421 Fornecedores c/c (DÉBITO — reduz passivo); 121 Depósitos à ordem (CRÉDITO — reduz caixa/banco).
      // Fallback para códigos PGC padrão (sem ConfiguracaoContabil no schema actual).
      const lancamento = await registarLancamentoContabilistico(
        txClient,
        {
          data: input.dataPagamento,
          diarioTipo: 'BANCO',
          origem: 'PAGAMENTO',
          documentoOrigemId: pagamento.id,
          documentoOrigemTipo: 'Pagamento',
          historico: `Pagamento ${numero} — ${conta.descricao}`,
          partidas: [
            { contaCodigo: '421', tipo: 'DEBITO', valor: String(input.valor) },
            { contaCodigo: '121', tipo: 'CREDITO', valor: String(input.valor) },
          ],
        },
        ctx,
      );

      // Actualizar pagamento com o lancamentoId real
      await tx.pagamento.update({
        where: { id: pagamento.id },
        data: { lancamentoId: lancamento.id },
      });

      const novoValorPago = Number(conta.valorPago ?? 0) + input.valor;
      const novoValorRestante = Number(conta.valorOriginal) - novoValorPago;
      const novoStatus: StatusContaPagar = novoValorRestante <= 0.001 ? 'PAGA' : 'PARCIALMENTE_PAGA';

      transitarContaPagar(conta.status as StatusContaPagar, novoStatus);

      await tx.contaPagar.update({
        where: { id: conta.id },
        data: {
          valorPago: novoValorPago,
          valorRestante: Math.max(0, novoValorRestante),
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
