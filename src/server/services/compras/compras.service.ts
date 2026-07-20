/**
 * Implementação do serviço de Compras — WS B (Wave 3)
 * Fluxo: RequisicaoCompra → aprovação multi-nível → Cotacao (RFQ) → PedidoCompra
 *        → RecebimentoCompra (+ entradaStock WS A) → ContaPagar.
 */
import 'server-only';

import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import { entradaStock } from '@/server/services/inventario/stock.service';
import { proximoNumeroSerie } from '@/server/services/financas/faturacao.service';
import type {
  IComprasService,
  RequisicaoCompraDetalhe,
  RequisicaoCompraResumo,
  CotacaoDetalhe,
  CotacaoResumo,
  PedidoCompraDetalhe,
  PedidoCompraResumo,
  RecebimentoCompraDto,
  ItemRecebimentoDto,
  StatusRequisicaoCompra,
  StatusCotacao,
  StatusPedidoCompra,
} from './compras.service.interface';
import {
  TRANSICOES_REQUISICAO,
  TRANSICOES_COTACAO,
  TRANSICOES_PEDIDO_COMPRA,
} from './compras.service.interface';
import type {
  CreateRequisicaoCompraInput,
  UpdateRequisicaoCompraInput,
  FilterRequisicaoCompraInput,
  AprovarDocumentoInput,
  CreateCotacaoInput,
  RegistarRespostaCotacaoInput,
  AdjudicarCotacaoInput,
  CreatePedidoCompraInput,
  UpdatePedidoCompraInput,
  FilterPedidoCompraInput,
  CreateRecebimentoCompraInput,
  CreateConfiguracaoWorkflowInput,
} from '@/lib/validations/compras';
import type { Ctx } from '@/server/services/types';
import type { z } from 'zod';
import type { FilterCotacaoSchema } from '@/lib/validations/compras';

// Cast para PrismaClient: fornece tipagem completa de todos os modelos gerados.
// A extensão (tenant + audit) continua activa em runtime — só o tipo muda.
const db = prisma as unknown as PrismaClient;

// =====================================================================
// Funções puras — exportadas para testes (state machines + quórum)
// =====================================================================

/** Valida transição de estado; lança BusinessRuleError se inválida. */
export function transitar<S extends string>(
  mapa: Record<S, S[]>,
  nome: string,
  atual: S,
  alvo: S,
): void {
  const permitidos = mapa[atual] ?? [];
  if (!permitidos.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de ${nome}: ${atual} → ${alvo}. Permitidos: [${permitidos.join(', ')}]`,
    );
  }
}

/** Verifica quórum de aprovação. Retorna true se o nível está concluído. */
export function verificarQuorum(
  aprovacoes: Array<{ status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' }>,
  tipo: 'QUALQUER_UM' | 'TODOS' | 'MAIORIA',
): boolean {
  const aprovados = aprovacoes.filter((a) => a.status === 'APROVADO').length;
  const total = aprovacoes.length;
  switch (tipo) {
    case 'QUALQUER_UM': return aprovados >= 1;
    case 'TODOS': return aprovados === total;
    case 'MAIORIA': return aprovados >= Math.ceil(total / 2);
  }
}

/** Calcular totais do pedido de compra a partir dos itens. Dinheiro em Prisma.Decimal. */
export function calcularTotaisPedido(itens: Array<{
  quantidade: Prisma.Decimal | number;
  precoUnitario: Prisma.Decimal | number;
  desconto: Prisma.Decimal | number;
  taxaIva: Prisma.Decimal | number;
}>): { valorSubtotal: Prisma.Decimal; valorDesconto: Prisma.Decimal; valorIva: Prisma.Decimal; valorTotal: Prisma.Decimal } {
  let valorSubtotal = new Prisma.Decimal(0);
  let valorDesconto = new Prisma.Decimal(0);
  for (const item of itens) {
    const qty = new Prisma.Decimal(item.quantidade.toString());
    const price = new Prisma.Decimal(item.precoUnitario.toString());
    const disc = new Prisma.Decimal((item.desconto ?? 0).toString());
    valorSubtotal = valorSubtotal.add(qty.mul(price));
    valorDesconto = valorDesconto.add(disc);
  }
  const liquido = valorSubtotal.sub(valorDesconto);
  let valorIva = new Prisma.Decimal(0);
  for (const item of itens) {
    const qty = new Prisma.Decimal(item.quantidade.toString());
    const price = new Prisma.Decimal(item.precoUnitario.toString());
    const disc = new Prisma.Decimal((item.desconto ?? 0).toString());
    const iva = new Prisma.Decimal((item.taxaIva ?? 0.16).toString());
    valorIva = valorIva.add(qty.mul(price).sub(disc).mul(iva));
  }
  return {
    valorSubtotal: valorSubtotal.toDecimalPlaces(2),
    valorDesconto: valorDesconto.toDecimalPlaces(2),
    valorIva: valorIva.toDecimalPlaces(2),
    valorTotal: liquido.add(valorIva).toDecimalPlaces(2),
  };
}

// =====================================================================
// Mappers BD → DTO
// =====================================================================

function toRequisicaoResumo(r: any): RequisicaoCompraResumo {
  const aprovacoes = r.aprovacoes ?? [];
  const nivelActual = aprovacoes.filter((a: any) => a.status === 'APROVADO')
    .reduce((max: number, a: any) => Math.max(max, a.nivel), 0);
  const totalNiveis = aprovacoes.length > 0 ? Math.max(...aprovacoes.map((a: any) => a.nivel)) : 0;
  return {
    id: r.id, numero: r.numero, data: r.data,
    solicitanteId: r.solicitanteId, solicitanteNome: r.solicitanteNome,
    departamento: r.departamento, prioridade: r.prioridade,
    status: r.status, valorTotal: Number(r.valorTotal ?? 0),
    nivelAprovacaoActual: nivelActual, totalNiveis, createdAt: r.createdAt,
  };
}

function toRequisicaoDetalhe(r: any): RequisicaoCompraDetalhe {
  return {
    ...toRequisicaoResumo(r),
    justificativa: r.justificativa, observacoes: r.observacoes ?? null,
    dataEntregaDesejada: r.dataEntregaDesejada ?? null, centroCustoId: r.centroCustoId ?? null,
    itens: (r.itens ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produtoId ?? null, descricao: i.descricao,
      quantidade: Number(i.quantidade), unidadeMedida: i.unidadeMedida,
      precoEstimado: Number(i.precoEstimado), subtotal: Number(i.subtotal),
    })),
    aprovacoes: (r.aprovacoes ?? []).map((a: any) => ({
      id: a.id, nivel: a.nivel, aprovadorId: a.aprovadorId,
      aprovadorNome: a.aprovadorNome, status: a.status,
      data: a.data ?? null, observacoes: a.observacoes ?? null,
    })),
  };
}

function toPedidoResumo(p: any): PedidoCompraResumo {
  return {
    id: p.id, numero: p.numero, data: p.data,
    fornecedorId: p.fornecedorId, fornecedorNome: p.fornecedor?.nome ?? p.fornecedorId,
    status: p.status, valorTotal: Number(p.valorTotal ?? 0),
    dataEntregaPrevista: p.dataEntregaPrevista, dataEntregaReal: p.dataEntregaReal ?? null,
    createdAt: p.createdAt,
  };
}

function toPedidoDetalhe(p: any): PedidoCompraDetalhe {
  return {
    ...toPedidoResumo(p),
    requisicaoCompraId: p.requisicaoCompraId ?? null,
    cotacaoId: p.cotacaoId ?? null,
    valorSubtotal: Number(p.valorSubtotal ?? 0),
    valorDesconto: Number(p.valorDesconto ?? 0),
    valorIva: Number(p.valorIva ?? 0),
    taxaIva: Number(p.taxaIva ?? 0.16),
    condicoesPagamento: p.condicoesPagamento,
    prazoEntregaDias: p.prazoEntregaDias,
    enderecoEntrega: p.enderecoEntrega,
    centroCustoId: p.centroCustoId ?? null,
    observacoes: p.observacoes ?? null,
    itens: (p.itens ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produtoId ?? null, descricao: i.descricao,
      quantidade: Number(i.quantidade), quantidadeRecebida: Number(i.quantidadeRecebida ?? 0),
      unidadeMedida: i.unidadeMedida, precoUnitario: Number(i.precoUnitario),
      desconto: Number(i.desconto ?? 0), taxaIva: Number(i.taxaIva ?? 0.16),
      subtotal: Number(i.subtotal),
    })),
    aprovacoes: (p.aprovacoes ?? []).map((a: any) => ({
      id: a.id, nivel: a.nivel, aprovadorId: a.aprovadorId,
      aprovadorNome: a.aprovadorNome, status: a.status,
      data: a.data ?? null, observacoes: a.observacoes ?? null,
    })),
    recebimentos: (p.recebimentos ?? []).map(toRecebimentoDto),
  };
}

function toRecebimentoDto(r: any): RecebimentoCompraDto {
  return {
    id: r.id, data: r.data, status: r.status,
    responsavelNome: r.responsavelNome,
    itens: (r.itens ?? []).map((i: any): ItemRecebimentoDto => ({
      itemPedidoCompraId: i.itemPedidoCompraId,
      quantidadeRecebida: Number(i.quantidadeRecebida),
      quantidadeAceita: Number(i.quantidadeAceita),
      quantidadeRejeitada: Number(i.quantidadeRejeitada),
      motivoRejeicao: i.motivoRejeicao ?? null,
    })),
  };
}

// =====================================================================
// Lógica de workflow de aprovação (pura, extraída para testabilidade)
// =====================================================================

/**
 * Encontra o ConfiguracaoWorkflow aplicável para o tipo e valor dados.
 *
 * Segurança W5: se o valor exceder todas as bandas configuradas (ex.: 10M com
 * bandas até 1M), usa o nível mais alto em vez de auto-aprovar.
 * Só auto-aprova quando não existe NENHUM workflow activo para o tipo.
 */
async function encontrarWorkflow(tipo: 'REQUISICAO_COMPRA' | 'PEDIDO_COMPRA', valor: number, ctx: Ctx) {
  // Buscar workflow com TODOS os níveis (sem filtro de valor)
  const workflow = await db.configuracaoWorkflow.findFirst({
    where: { tenantId: ctx.tenantId, tipo, ativo: true },
    include: {
      niveis: { include: { aprovadores: true }, orderBy: { nivel: 'asc' } },
    },
  });

  if (!workflow) return null; // Sem workflow → pode auto-aprovar

  // Filtrar níveis que cobrem o valor
  const niveisParaValor = workflow.niveis.filter(
    (n: { valorMinimo: Prisma.Decimal | number | null; valorMaximo: Prisma.Decimal | number | null }) =>
      (n.valorMinimo == null || Number(n.valorMinimo) <= valor) &&
      (n.valorMaximo == null || Number(n.valorMaximo) >= valor),
  );

  if (niveisParaValor.length > 0) {
    return { ...workflow, niveis: niveisParaValor };
  }

  // Valor fora de todas as bandas → usar o nível mais alto (segurança máxima; nunca auto-aprovar)
  if (workflow.niveis.length > 0) {
    const nivelMaisAlto = workflow.niveis[workflow.niveis.length - 1];
    return { ...workflow, niveis: [nivelMaisAlto] };
  }

  return null; // Workflow existe mas sem níveis configurados
}

// =====================================================================
// Implementação do serviço
// =====================================================================

export const comprasService: IComprasService = {
  // ---- Configuração de Workflow ----

  async criarConfiguracaoWorkflow(
    input: CreateConfiguracaoWorkflowInput,
    ctx: Ctx,
  ) {
    const existe = await db.configuracaoWorkflow.findFirst({
      where: { tenantId: ctx.tenantId, nome: input.nome },
    });
    if (existe) throw new BusinessRuleError('WORKFLOW_DUPLICADO', `Workflow "${input.nome}" já existe`);

    const workflow = await db.configuracaoWorkflow.create({
      data: {
        tenantId: ctx.tenantId,
        nome: input.nome, tipo: input.tipo, ativo: input.ativo ?? true,
        niveis: {
          create: input.niveis.map((nivel) => ({
            tenantId: ctx.tenantId,
            nivel: nivel.nivel, nome: nivel.nome,
            valorMinimo: nivel.valorMinimo, valorMaximo: nivel.valorMaximo,
            tipoAprovacao: nivel.tipoAprovacao ?? 'QUALQUER_UM',
            aprovadores: {
              create: nivel.aprovadores.map((ap) => ({
                tenantId: ctx.tenantId,
                usuarioId: ap.usuarioId, email: ap.email,
              })),
            },
          })),
        },
      },
    });
    return { id: workflow.id, nome: workflow.nome };
  },

  // ---- Requisição de Compra ----

  async criarRequisicao(input: CreateRequisicaoCompraInput, ctx: Ctx) {
    const subtotal = (i: any) => i.quantidade * i.precoEstimado;
    const valorTotal = input.itens.reduce((s, i) => s + subtotal(i), 0);

    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'REQUISICAO_COMPRA', ctx),
    );

    const requisicao = await db.requisicaoCompra.create({
      data: {
        tenantId: ctx.tenantId,
        numero, data: input.data ?? new Date(),
        solicitanteId: ctx.userId, solicitanteNome: 'Utilizador ' + ctx.userId.slice(-4),
        departamento: input.departamento, prioridade: input.prioridade ?? 'MEDIA',
        justificativa: input.justificativa, observacoes: input.observacoes,
        dataEntregaDesejada: input.dataEntregaDesejada, centroCustoId: input.centroCustoId,
        valorTotal,
        itens: {
          create: input.itens.map((i) => ({
            tenantId: ctx.tenantId,
            produtoId: i.produtoId, descricao: i.descricao,
            quantidade: i.quantidade, unidadeMedida: i.unidadeMedida,
            precoEstimado: i.precoEstimado,
            subtotal: subtotal(i),
            observacoes: i.observacoes,
          })),
        },
      },
      include: { itens: true, aprovacoes: true },
    });
    return toRequisicaoDetalhe(requisicao);
  },

  async actualizarRequisicao(id: string, input: UpdateRequisicaoCompraInput, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({ where: { id } });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    if (req.status !== 'RASCUNHO') throw new BusinessRuleError('ESTADO_INVALIDO', 'Apenas requisições em rascunho podem ser actualizadas');

    const updated = await db.requisicaoCompra.update({
      where: { id }, data: input,
      include: { itens: true, aprovacoes: true },
    });
    return toRequisicaoDetalhe(updated);
  },

  async submeterRequisicao(id: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({
      where: { id }, include: { itens: true },
    });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');

    transitar(TRANSICOES_REQUISICAO, 'RequisicaoCompra', req.status as StatusRequisicaoCompra, 'PENDENTE');

    const workflow = await encontrarWorkflow('REQUISICAO_COMPRA', Number(req.valorTotal), ctx);

    if (!workflow || workflow.niveis.length === 0) {
      // Sem workflow configurado → aprovar automaticamente
      const aprovada = await db.requisicaoCompra.update({
        where: { id },
        data: { status: 'APROVADA' },
        include: { itens: true, aprovacoes: true },
      });
      return toRequisicaoDetalhe(aprovada);
    }

    const primeiroNivel = workflow.niveis[0];

    // Criar registos de aprovação para o nível 1
    const aprovacoes = await prisma.$transaction(async (tx) => {
      await (tx as unknown as PrismaClient).requisicaoCompra.update({ where: { id }, data: { status: 'EM_APROVACAO' } });
      return (tx as unknown as PrismaClient).aprovacaoCompra.createMany({
        data: primeiroNivel.aprovadores.map((ap: { usuarioId: string; email: string }) => ({
          tenantId: ctx.tenantId,
          requisicaoCompraId: id,
          nivel: primeiroNivel.nivel,
          aprovadorId: ap.usuarioId,
          aprovadorNome: ap.email,
          status: 'PENDENTE',
        })),
      });
    });
    void aprovacoes;

    return toRequisicaoDetalhe(await db.requisicaoCompra.findUnique({
      where: { id }, include: { itens: true, aprovacoes: true },
    }));
  },

  async cancelarRequisicao(id: string, motivo: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({ where: { id } });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    transitar(TRANSICOES_REQUISICAO, 'RequisicaoCompra', req.status as StatusRequisicaoCompra, 'CANCELADA');
    await db.requisicaoCompra.update({ where: { id }, data: { status: 'CANCELADA', observacoes: motivo } });
  },

  async obterRequisicao(id: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({
      where: { id }, include: { itens: true, aprovacoes: true },
    });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    return toRequisicaoDetalhe(req);
  },

  async listarRequisicoes(filtros: FilterRequisicaoCompraInput, ctx: Ctx) {
    const { status, prioridade, q, departamento, cursor, take = 25, orderBy = 'createdAt', orderDir = 'desc' } = filtros;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(prioridade ? { prioridade } : {}),
      ...(departamento ? { departamento: { contains: departamento, mode: 'insensitive' } } : {}),
      ...(q ? {
        OR: [
          { numero: { contains: q, mode: 'insensitive' } },
          { solicitanteNome: { contains: q, mode: 'insensitive' } },
          { departamento: { contains: q, mode: 'insensitive' } },
        ],
      } : {}),
    };
    return paginate(
      (a) => db.requisicaoCompra.findMany({
        ...a, where, include: { aprovacoes: true },
        orderBy: { [orderBy]: orderDir },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toRequisicaoResumo), nextCursor: p.nextCursor }));
  },

  async contarRequisicoesPorStatus(ctx: Ctx) {
    const base = { tenantId: ctx.tenantId };
    const [total, pendentes, emAprovacao, aprovadas, valorAgg] = await Promise.all([
      db.requisicaoCompra.count({ where: base }),
      db.requisicaoCompra.count({ where: { ...base, status: 'PENDENTE' } }),
      db.requisicaoCompra.count({ where: { ...base, status: 'EM_APROVACAO' } }),
      db.requisicaoCompra.count({ where: { ...base, status: 'APROVADA' } }),
      db.requisicaoCompra.aggregate({ where: base, _sum: { valorTotal: true } }),
    ]);
    return {
      total,
      pendentes: pendentes + emAprovacao,
      aprovadas,
      valorTotalProcesso: Number(valorAgg._sum.valorTotal ?? 0),
    };
  },

  // ---- Aprovação Multi-nível ----

  async decidirAprovacao(input: AprovarDocumentoInput, ctx: Ctx) {
    const { documentoId, nivel, status, observacoes } = input;

    // Encontrar o registo de aprovação para este aprovador + nível
    const aprovacao = await db.aprovacaoCompra.findFirst({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ requisicaoCompraId: documentoId }, { pedidoCompraId: documentoId }],
        nivel,
        aprovadorId: ctx.userId,
        status: 'PENDENTE',
      },
    });
    if (!aprovacao) throw new NotFoundError('Aprovação não encontrada ou já decidida');

    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;

      // 1. Registar decisão
      await tx.aprovacaoCompra.update({
        where: { id: aprovacao.id },
        data: { status, observacoes, data: new Date() },
      });

      const isRequisicao = !!aprovacao.requisicaoCompraId;
      const docId = aprovacao.requisicaoCompraId ?? aprovacao.pedidoCompraId;

      const atualizarDocStatus = async (novoStatus: string) => {
        if (isRequisicao) {
          await tx.requisicaoCompra.update({ where: { id: docId! }, data: { status: novoStatus as 'REJEITADA' } });
        } else {
          await tx.pedidoCompra.update({ where: { id: docId! }, data: { status: novoStatus as 'CANCELADO' } });
        }
      };

      if (status === 'REJEITADO') {
        await atualizarDocStatus(isRequisicao ? 'REJEITADA' : 'CANCELADO');
        return;
      }

      // 2. Verificar quórum neste nível
      const todasAprovacoes = await tx.aprovacaoCompra.findMany({
        where: {
          tenantId: ctx.tenantId,
          OR: [{ requisicaoCompraId: docId }, { pedidoCompraId: docId }],
          nivel,
        },
      });

      // Determinar tipoAprovacao do nível (precisa do workflow)
      const doc = isRequisicao
        ? await tx.requisicaoCompra.findUnique({ where: { id: docId! } })
        : await tx.pedidoCompra.findUnique({ where: { id: docId! } });
      if (!doc) return;

      const workflow = await encontrarWorkflow(
        isRequisicao ? 'REQUISICAO_COMPRA' : 'PEDIDO_COMPRA',
        Number((doc as { valorTotal: unknown }).valorTotal ?? 0),
        ctx,
      );

      const nivelConfig = workflow?.niveis?.find((n: { nivel: number }) => n.nivel === nivel);
      const tipoAprovacao = (nivelConfig as { tipoAprovacao?: string } | undefined)?.tipoAprovacao ?? 'QUALQUER_UM';

      // Actualizar a lista com a nova decisão
      const aprovacoesCom = todasAprovacoes.map((a) =>
        a.id === aprovacao.id ? { ...a, status } : a,
      );

      // Verificar rejeição por qualquer um
      if (aprovacoesCom.some((a) => a.status === 'REJEITADO')) {
        await atualizarDocStatus(isRequisicao ? 'REJEITADA' : 'CANCELADO');
        return;
      }

      const quorumAtingido = verificarQuorum(
        aprovacoesCom as Array<{ status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' }>,
        tipoAprovacao as 'QUALQUER_UM' | 'TODOS' | 'MAIORIA',
      );
      if (!quorumAtingido) return;

      // 3. Quórum atingido → avançar para próximo nível ou APROVADO
      const proximoNivel = workflow?.niveis?.find((n: { nivel: number }) => n.nivel === nivel + 1);

      if (!proximoNivel) {
        await atualizarDocStatus(isRequisicao ? 'APROVADA' : 'CONFIRMADO');
        return;
      }

      // Criar registos de aprovação para o próximo nível (NUNCA salta níveis)
      await tx.aprovacaoCompra.createMany({
        data: (proximoNivel as { aprovadores: Array<{ usuarioId: string; email: string }>; nivel: number }).aprovadores.map((ap) => ({
          tenantId: ctx.tenantId,
          ...(isRequisicao ? { requisicaoCompraId: docId! } : { pedidoCompraId: docId! }),
          nivel: (proximoNivel as { nivel: number }).nivel,
          aprovadorId: ap.usuarioId,
          aprovadorNome: ap.email,
          status: 'PENDENTE',
        })),
      });
    });
  },

  // ---- Cotação (RFQ) ----

  async criarCotacao(input: CreateCotacaoInput, ctx: Ctx) {
    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'COTACAO_RFQ', ctx),
    );

    const cotacao = await db.cotacao.create({
      data: {
        tenantId: ctx.tenantId,
        numero, data: new Date(),
        requisicaoCompraId: input.requisicaoCompraId,
        dataValidade: input.dataValidade,
        observacoes: input.observacoes,
        itens: {
          create: input.itens.map((i) => ({
            tenantId: ctx.tenantId,
            produtoId: i.produtoId, descricao: i.descricao,
            quantidade: i.quantidade, unidadeMedida: i.unidadeMedida,
            especificacoes: i.especificacoes,
          })),
        },
        fornecedores: input.fornecedoresIds?.length
          ? {
              create: input.fornecedoresIds.map((fId) => ({
                tenantId: ctx.tenantId,
                fornecedorId: fId, dataEnvio: new Date(), status: 'PENDENTE',
              })),
            }
          : undefined,
      },
      include: { itens: { include: { respostas: true } }, fornecedores: true },
    });
    return toCotacaoDetalhe(cotacao);
  },

  async enviarCotacao(cotacaoId: string, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: cotacaoId } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    transitar(TRANSICOES_COTACAO, 'Cotacao', cot.status as StatusCotacao, 'ENVIADA');
    await db.cotacao.update({ where: { id: cotacaoId }, data: { status: 'ENVIADA' } });
  },

  async registarResposta(input: RegistarRespostaCotacaoInput, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: input.cotacaoId } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    if (cot.status !== 'ENVIADA' && cot.status !== 'RESPONDIDA') {
      throw new BusinessRuleError('ESTADO_INVALIDO', 'Cotação não está em estado de resposta');
    }

    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      // Actualizar CotacaoFornecedor
      const cf = await tx.cotacaoFornecedor.findFirst({
        where: { tenantId: ctx.tenantId, cotacaoId: input.cotacaoId, fornecedorId: input.fornecedorId },
      });
      if (!cf) throw new NotFoundError('Fornecedor não está na cotação');

      const valorTotal = input.respostas.reduce((s, r) => {
        // Calcular subtotal: precisa do item para a quantidade
        return s; // Wave 2: simplificado
      }, 0);

      await tx.cotacaoFornecedor.update({
        where: { id: cf.id },
        data: {
          status: 'RESPONDIDA', dataResposta: new Date(),
          prazoEntregaDias: input.prazoEntregaDias,
          condicoesPagamento: input.condicoesPagamento,
          observacoes: input.observacoes,
        },
      });

      // Registar resposta por item
      for (const r of input.respostas) {
        const item = await tx.itemCotacao.findUnique({ where: { id: r.itemCotacaoId } });
        const subtotal = item ? Number(item.quantidade) * r.precoUnitario : r.precoUnitario;

        await tx.respostaItemCotacao.upsert({
          where: { itemCotacaoId_cotacaoFornecedorId: { itemCotacaoId: r.itemCotacaoId, cotacaoFornecedorId: cf.id } },
          create: {
            tenantId: ctx.tenantId,
            itemCotacaoId: r.itemCotacaoId, cotacaoFornecedorId: cf.id,
            precoUnitario: r.precoUnitario, subtotal,
            prazoEntregaDias: r.prazoEntregaDias, marca: r.marca,
            observacoes: r.observacoes,
          },
          update: {
            precoUnitario: r.precoUnitario, subtotal,
            prazoEntregaDias: r.prazoEntregaDias, marca: r.marca,
          },
        });
      }

      // Avançar cotação para RESPONDIDA se ainda ENVIADA
      if (cot.status === 'ENVIADA') {
        await tx.cotacao.update({ where: { id: input.cotacaoId }, data: { status: 'RESPONDIDA' } });
      }
    });
  },

  async adjudicarCotacao(input: AdjudicarCotacaoInput, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: input.cotacaoId } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    transitar(TRANSICOES_COTACAO, 'Cotacao', cot.status as StatusCotacao, 'ADJUDICADA');
    await db.cotacao.update({
      where: { id: input.cotacaoId },
      data: { status: 'ADJUDICADA', vencedorFornecedorId: input.fornecedorVencedorId },
    });
  },

  async cancelarCotacao(cotacaoId: string, motivo: string, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({ where: { id: cotacaoId } });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    transitar(TRANSICOES_COTACAO, 'Cotacao', cot.status as StatusCotacao, 'CANCELADA');
    await db.cotacao.update({ where: { id: cotacaoId }, data: { status: 'CANCELADA', observacoes: motivo } });
  },

  async expirarCotacoesVencidas(ctx: Ctx) {
    const agora = new Date();
    const result = await db.cotacao.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ENVIADA', 'RESPONDIDA'] },
        dataValidade: { lt: agora },
      },
      data: { status: 'VENCIDA' },
    });
    return result.count;
  },

  async obterCotacao(id: string, ctx: Ctx) {
    const cot = await db.cotacao.findUnique({
      where: { id },
      include: { itens: { include: { respostas: true } }, fornecedores: true },
    });
    if (!cot || cot.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    return toCotacaoDetalhe(cot);
  },

  async listarCotacoes(filtros: z.infer<typeof FilterCotacaoSchema>, ctx: Ctx) {
    const { status, cursor, take = 25, orderBy = 'createdAt', orderDir = 'desc' } = filtros;
    const where: any = { tenantId: ctx.tenantId, ...(status ? { status } : {}) };
    return paginate(
      (a) => db.cotacao.findMany({ ...a, where, orderBy: { [orderBy]: orderDir } }),
      { cursor, take },
    ).then((p: any) => ({
      items: p.items.map((c: any): CotacaoResumo => ({
        id: c.id, numero: c.numero, data: c.data, status: c.status,
        dataValidade: c.dataValidade, totalFornecedores: 0, totalRespostas: 0,
        vencedorFornecedorId: c.vencedorFornecedorId ?? null, createdAt: c.createdAt,
      })),
      nextCursor: p.nextCursor,
    }));
  },

  // ---- Pedido de Compra ----

  async criarPedido(input: CreatePedidoCompraInput, ctx: Ctx) {
    const totais = calcularTotaisPedido(input.itens.map((i) => ({
      quantidade: i.quantidade, precoUnitario: i.precoUnitario,
      desconto: i.desconto ?? 0, taxaIva: i.taxaIva ?? 0.16,
    })));

    const numero = await prisma.$transaction(async (tx) =>
      proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'PEDIDO_COMPRA', ctx),
    );

    const pedido = await db.pedidoCompra.create({
      data: {
        tenantId: ctx.tenantId,
        numero, data: input.data ?? new Date(),
        fornecedorId: input.fornecedorId,
        requisicaoCompraId: input.requisicaoCompraId,
        cotacaoId: input.cotacaoId,
        condicoesPagamento: input.condicoesPagamento,
        prazoEntregaDias: input.prazoEntregaDias,
        dataEntregaPrevista: input.dataEntregaPrevista,
        enderecoEntrega: input.enderecoEntrega,
        centroCustoId: input.centroCustoId,
        observacoes: input.observacoes,
        ...totais,
        itens: {
          create: input.itens.map((i) => ({
            tenantId: ctx.tenantId,
            produtoId: i.produtoId, descricao: i.descricao,
            quantidade: i.quantidade, unidadeMedida: i.unidadeMedida,
            precoUnitario: i.precoUnitario,
            desconto: i.desconto ?? 0, taxaIva: i.taxaIva ?? 0.16,
            subtotal: i.quantidade * i.precoUnitario * (1 - (i.desconto ?? 0) / (i.quantidade * i.precoUnitario || 1)) * (1 + (i.taxaIva ?? 0.16)),
            observacoes: i.observacoes,
          })),
        },
      },
      include: {
        itens: true, aprovacoes: true, recebimentos: { include: { itens: true } },
        fornecedor: { select: { nome: true } },
      },
    });
    return toPedidoDetalhe(pedido);
  },

  async converterRequisicaoEmPedido(requisicaoId: string, cotacaoId: string, ctx: Ctx) {
    const req = await db.requisicaoCompra.findUnique({
      where: { id: requisicaoId }, include: { itens: true },
    });
    if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('Requisição não encontrada');
    if (req.status !== 'APROVADA') throw new BusinessRuleError('ESTADO_INVALIDO', 'Requisição não está aprovada');

    const cotacao = await db.cotacao.findUnique({
      where: { id: cotacaoId }, include: { fornecedores: true, itens: { include: { respostas: true } } },
    });
    if (!cotacao || cotacao.tenantId !== ctx.tenantId) throw new NotFoundError('Cotação não encontrada');
    const vencedorFornecedorId = cotacao.vencedorFornecedorId;
    if (cotacao.status !== 'ADJUDICADA' || !vencedorFornecedorId) {
      throw new BusinessRuleError('ESTADO_INVALIDO', 'Cotação não foi adjudicada');
    }

    const fornecedorVencedor = cotacao.fornecedores.find((f: any) => f.fornecedorId === vencedorFornecedorId);
    const itensPedido = req.itens.map((item: any) => ({
      produtoId: item.produtoId,
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      unidadeMedida: item.unidadeMedida,
      precoUnitario: Number(item.precoEstimado),
      desconto: 0, taxaIva: 0.16,
    }));

    const totais = calcularTotaisPedido(itensPedido);
    const numero = await prisma.$transaction(async (tx) => proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'PEDIDO_COMPRA', ctx));

    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      const pedido = await tx.pedidoCompra.create({
        data: {
          tenantId: ctx.tenantId, numero, data: new Date(),
          fornecedorId: vencedorFornecedorId,
          requisicaoCompraId: requisicaoId, cotacaoId,
          condicoesPagamento: fornecedorVencedor?.condicoesPagamento ?? '30 dias',
          prazoEntregaDias: fornecedorVencedor?.prazoEntregaDias ?? 30,
          dataEntregaPrevista: new Date(Date.now() + (fornecedorVencedor?.prazoEntregaDias ?? 30) * 86400000),
          enderecoEntrega: 'A definir', // Wave 3: buscar endereço do tenant
          ...totais,
          itens: { create: itensPedido.map((i: any) => ({ ...i, tenantId: ctx.tenantId, subtotal: i.quantidade * i.precoUnitario * (1 + i.taxaIva) })) },
        },
        include: { itens: true, aprovacoes: true, recebimentos: { include: { itens: true } } },
      });
      await tx.requisicaoCompra.update({ where: { id: requisicaoId }, data: { status: 'CONVERTIDA' } });
      return toPedidoDetalhe(pedido);
    }) as Promise<PedidoCompraDetalhe>;
  },

  async actualizarPedido(id: string, input: UpdatePedidoCompraInput, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    if (p.status !== 'RASCUNHO') throw new BusinessRuleError('ESTADO_INVALIDO', 'Apenas pedidos em rascunho podem ser actualizados');

    const updated = await db.pedidoCompra.update({
      where: { id }, data: input,
      include: { itens: true, aprovacoes: true, recebimentos: { include: { itens: true } }, fornecedor: { select: { nome: true } } },
    });
    return toPedidoDetalhe(updated);
  },

  async enviarPedido(id: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    transitar(TRANSICOES_PEDIDO_COMPRA, 'PedidoCompra', p.status as StatusPedidoCompra, 'ENVIADO');
    await db.pedidoCompra.update({ where: { id }, data: { status: 'ENVIADO' } });
  },

  async cancelarPedido(id: string, motivo: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({ where: { id } });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    transitar(TRANSICOES_PEDIDO_COMPRA, 'PedidoCompra', p.status as StatusPedidoCompra, 'CANCELADO');
    await db.pedidoCompra.update({ where: { id }, data: { status: 'CANCELADO', observacoes: motivo } });
  },

  async obterPedido(id: string, ctx: Ctx) {
    const p = await db.pedidoCompra.findUnique({
      where: { id },
      include: { itens: true, aprovacoes: true, recebimentos: { include: { itens: true } }, fornecedor: { select: { nome: true } } },
    });
    if (!p || p.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');
    return toPedidoDetalhe(p);
  },

  async listarPedidos(filtros: FilterPedidoCompraInput, ctx: Ctx) {
    const { status, fornecedorId, cursor, take = 25, orderBy = 'createdAt', orderDir = 'desc' } = filtros;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(fornecedorId ? { fornecedorId } : {}),
    };
    return paginate(
      (a) => db.pedidoCompra.findMany({
        ...a, where,
        include: { fornecedor: { select: { nome: true } } },
        orderBy: { [orderBy]: orderDir },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toPedidoResumo), nextCursor: p.nextCursor }));
  },

  // ---- Recebimento de Mercadoria ----

  /**
   * ADR-0003 A8: entradaStock chamado para cada recebimento (parcial OU total).
   * Wave 3: integração real com WS A (entradaStock).
   */
  async registarRecebimento(input: CreateRecebimentoCompraInput, ctx: Ctx) {
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as PrismaClient;
      const pedido = await tx.pedidoCompra.findUnique({
        where: { id: input.pedidoCompraId },
        include: { itens: true },
      });
      if (!pedido || pedido.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');

      const statusValidos: StatusPedidoCompra[] = ['EM_TRANSITO', 'RECEBIDO_PARCIAL'];
      if (!statusValidos.includes(pedido.status as StatusPedidoCompra)) {
        throw new BusinessRuleError('ESTADO_INVALIDO', 'Pedido não está em trânsito');
      }

      // Validar que Σ(recebida) ≤ Σ(pedida) para cada item
      for (const itemInput of input.itens) {
        const itemPedido = pedido.itens.find((i: any) => i.id === itemInput.itemPedidoCompraId);
        if (!itemPedido) throw new NotFoundError(`Item ${itemInput.itemPedidoCompraId} não encontrado no pedido`);

        const jaRecebida = Number(itemPedido.quantidadeRecebida ?? 0);
        const total = jaRecebida + itemInput.quantidadeRecebida;
        if (total > Number(itemPedido.quantidade) + 0.0001) {
          throw new BusinessRuleError(
            'QUANTIDADE_EXCEDIDA',
            `Item "${itemPedido.descricao}": quantidade recebida total (${total}) excede quantidade pedida (${itemPedido.quantidade})`,
          );
        }
      }

      // Determinar status do recebimento
      const totalItens = pedido.itens.length;
      const temDivergencia = input.itens.some((i) => i.quantidadeRejeitada > 0);
      const statusRecebimento = temDivergencia ? 'COM_DIVERGENCIA' : 'COMPLETO';

      // Criar RecebimentoCompra
      const recebimento = await tx.recebimentoCompra.create({
        data: {
          tenantId: ctx.tenantId,
          pedidoCompraId: input.pedidoCompraId,
          data: input.data ?? new Date(),
          numeroDocumento: input.numeroDocumento,
          responsavelId: ctx.userId,
          responsavelNome: 'Utilizador ' + ctx.userId.slice(-4),
          status: statusRecebimento,
          observacoes: input.observacoes,
          itens: {
            create: input.itens.map((i) => ({
              tenantId: ctx.tenantId,
              itemPedidoCompraId: i.itemPedidoCompraId,
              quantidadeRecebida: i.quantidadeRecebida,
              quantidadeAceita: i.quantidadeAceita,
              quantidadeRejeitada: i.quantidadeRejeitada,
              motivoRejeicao: i.motivoRejeicao,
              observacoes: i.observacoes,
            })),
          },
        },
        include: { itens: true },
      });

      // Actualizar quantidadeRecebida em cada ItemPedidoCompra
      for (const itemInput of input.itens) {
        const itemPedido = pedido.itens.find((i: any) => i.id === itemInput.itemPedidoCompraId);
        await tx.itemPedidoCompra.update({
          where: { id: itemInput.itemPedidoCompraId },
          data: { quantidadeRecebida: { increment: itemInput.quantidadeAceita } },
        });

        // ADR-0003 A8: entradaStock para CADA item aceite (parcial OU total)
        if (itemInput.quantidadeAceita > 0 && itemPedido?.produtoId) {
          await entradaStock(
            tx as unknown as Prisma.TransactionClient,
            {
              produtoId: itemPedido.produtoId,
              localizacaoDestinoId: itemInput.localizacaoDestinoId,
              quantidade: itemInput.quantidadeAceita,
              documentoReferenciaId: recebimento.id,
              documentoReferenciaTipo: 'RecebimentoCompra',
            },
            ctx,
          );
        }
      }

      // Verificar se todos os itens foram recebidos na totalidade
      const itensActualizados = await tx.itemPedidoCompra.findMany({
        where: { tenantId: ctx.tenantId, pedidoCompraId: input.pedidoCompraId },
      });
      const todosRecebidos = itensActualizados.every(
        (i: any) => Number(i.quantidadeRecebida) >= Number(i.quantidade) - 0.0001,
      );
      const algumRecebido = itensActualizados.some((i: any) => Number(i.quantidadeRecebida) > 0);

      let novoStatus: StatusPedidoCompra = pedido.status as StatusPedidoCompra;
      if (todosRecebidos) novoStatus = 'RECEBIDO_TOTAL';
      else if (algumRecebido) novoStatus = 'RECEBIDO_PARCIAL';

      await tx.pedidoCompra.update({ where: { id: input.pedidoCompraId }, data: { status: novoStatus } });

      // Se RECEBIDO_TOTAL → criar ContaPagar
      if (novoStatus === 'RECEBIDO_TOTAL') {
        const numCP = await proximoNumeroSerie(tx as unknown as Prisma.TransactionClient, 'CONTA_PAGAR', ctx);
        await tx.contaPagar.create({
          data: {
            tenantId: ctx.tenantId, numero: numCP,
            fornecedorId: pedido.fornecedorId,
            pedidoCompraId: input.pedidoCompraId,
            descricao: `Compra via pedido ${pedido.numero}`,
            valorOriginal: pedido.valorTotal,
            valorPago: 0,
            valorRestante: pedido.valorTotal,
            dataEmissao: new Date(),
            dataVencimento: new Date(Date.now() + pedido.prazoEntregaDias * 86400000),
            status: 'ABERTA',
          },
        });
      }

      return toRecebimentoDto(recebimento);
    }) as Promise<RecebimentoCompraDto>;
  },

  async listarRecebimentos(pedidoId: string, ctx: Ctx) {
    const pedido = await db.pedidoCompra.findUnique({ where: { id: pedidoId } });
    if (!pedido || pedido.tenantId !== ctx.tenantId) throw new NotFoundError('Pedido não encontrado');

    const recebimentos = await db.recebimentoCompra.findMany({
      where: { tenantId: ctx.tenantId, pedidoCompraId: pedidoId },
      include: { itens: true },
      orderBy: { createdAt: 'desc' },
    });
    return recebimentos.map(toRecebimentoDto);
  },
};

// =====================================================================
// Mappers auxiliares para Cotação
// =====================================================================

function toCotacaoDetalhe(c: any): CotacaoDetalhe {
  return {
    id: c.id, numero: c.numero, data: c.data, status: c.status,
    dataValidade: c.dataValidade,
    totalFornecedores: (c.fornecedores ?? []).length,
    totalRespostas: (c.fornecedores ?? []).filter((f: any) => f.status === 'RESPONDIDA').length,
    vencedorFornecedorId: c.vencedorFornecedorId ?? null,
    createdAt: c.createdAt,
    requisicaoCompraId: c.requisicaoCompraId ?? null,
    observacoes: c.observacoes ?? null,
    fornecedores: (c.fornecedores ?? []).map((f: any) => ({
      id: f.id, fornecedorId: f.fornecedorId, fornecedorNome: f.fornecedor?.nome ?? f.fornecedorId,
      status: f.status, dataEnvio: f.dataEnvio ?? null, dataResposta: f.dataResposta ?? null,
      valorTotal: f.valorTotal ? Number(f.valorTotal) : null,
      prazoEntregaDias: f.prazoEntregaDias ?? null, condicoesPagamento: f.condicoesPagamento ?? null,
    })),
    itens: (c.itens ?? []).map((i: any) => ({
      id: i.id, produtoId: i.produtoId ?? null, descricao: i.descricao,
      quantidade: Number(i.quantidade), unidadeMedida: i.unidadeMedida,
      respostas: (i.respostas ?? []).map((r: any) => ({
        cotacaoFornecedorId: r.cotacaoFornecedorId,
        fornecedorId: r.cotacaoFornecedor?.fornecedorId ?? '',
        precoUnitario: Number(r.precoUnitario), subtotal: Number(r.subtotal),
        prazoEntregaDias: r.prazoEntregaDias, marca: r.marca ?? null,
      })),
    })),
  };
}
