/**
 * Server Actions de Compras — WS B (Wave 2)
 * Todas as mutações de RequisicaoCompra, Cotacao (RFQ), PedidoCompra
 * e RecebimentoCompra passam por aqui.
 *
 * Padrão: createSafeAction({ schema, permission, revalidate, handler })
 * tenantId NUNCA vem do input — vem do ctx (session).
 */
'use server';

import {
  CreateRequisicaoCompraSchema,
  UpdateRequisicaoCompraSchema,
  AprovarDocumentoSchema,
  CreateCotacaoSchema,
  AdjudicarCotacaoSchema,
  RegistarRespostaCotacaoSchema,
  CreatePedidoCompraSchema,
  UpdatePedidoCompraSchema,
  CreateRecebimentoCompraSchema,
  CreateConfiguracaoWorkflowSchema,
} from '@/lib/validations/compras';
import { createSafeAction } from '@/server/safe-action';
import { comprasService } from '@/server/services/compras/compras.service';
import { z } from 'zod';

// =====================================================================
// Workflow de Aprovação
// =====================================================================

export const criarConfiguracaoWorkflowAction = createSafeAction({
  schema: CreateConfiguracaoWorkflowSchema,
  permission: 'compras:configurar',
  revalidate: { tags: ['compras:workflow'] },
  handler: async (input, ctx) => comprasService.criarConfiguracaoWorkflow(input, ctx),
});

// =====================================================================
// Requisição de Compra
// =====================================================================

export const criarRequisicaoAction = createSafeAction({
  schema: CreateRequisicaoCompraSchema,
  permission: 'compras:requisicao:criar',
  revalidate: {
    paths: ['/compras/requisicoes'],
    tags: ['compras:requisicoes'],
  },
  handler: async (input, ctx) => comprasService.criarRequisicao(input, ctx),
});

export const actualizarRequisicaoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateRequisicaoCompraSchema,
  }),
  permission: 'compras:requisicao:editar',
  revalidate: { tags: ['compras:requisicoes'] },
  handler: async ({ id, dados }, ctx) => comprasService.actualizarRequisicao(id, dados, ctx),
});

export const submeterRequisicaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'compras:requisicao:submeter',
  revalidate: {
    paths: ['/compras/requisicoes'],
    tags: ['compras:requisicoes'],
  },
  handler: async ({ id }, ctx) => comprasService.submeterRequisicao(id, ctx),
});

export const cancelarRequisicaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'compras:requisicao:cancelar',
  revalidate: { tags: ['compras:requisicoes'] },
  handler: async ({ id, motivo }, ctx) => comprasService.cancelarRequisicao(id, motivo, ctx),
});

export const decidirAprovacaoAction = createSafeAction({
  schema: AprovarDocumentoSchema,
  permission: 'compras:aprovacao:decidir',
  revalidate: {
    paths: ['/compras/requisicoes'],
    tags: ['compras:requisicoes', 'compras:pedidos'],
  },
  handler: async (input, ctx) => comprasService.decidirAprovacao(input, ctx),
});

// =====================================================================
// Cotação (RFQ)
// =====================================================================

export const criarCotacaoAction = createSafeAction({
  schema: CreateCotacaoSchema,
  permission: 'compras:cotacao:criar',
  revalidate: {
    paths: ['/compras/cotacoes'],
    tags: ['compras:cotacoes'],
  },
  handler: async (input, ctx) => comprasService.criarCotacao(input, ctx),
});

export const enviarCotacaoAction = createSafeAction({
  schema: z.object({ cotacaoId: z.string().cuid() }),
  permission: 'compras:cotacao:enviar',
  revalidate: { tags: ['compras:cotacoes'] },
  handler: async ({ cotacaoId }, ctx) => comprasService.enviarCotacao(cotacaoId, ctx),
});

export const registarRespostaCotacaoAction = createSafeAction({
  schema: RegistarRespostaCotacaoSchema,
  permission: 'compras:cotacao:resposta',
  revalidate: { tags: ['compras:cotacoes'] },
  handler: async (input, ctx) => comprasService.registarResposta(input, ctx),
});

export const adjudicarCotacaoAction = createSafeAction({
  schema: AdjudicarCotacaoSchema,
  permission: 'compras:cotacao:adjudicar',
  revalidate: {
    paths: ['/compras/cotacoes'],
    tags: ['compras:cotacoes', 'compras:pedidos'],
  },
  handler: async (input, ctx) => comprasService.adjudicarCotacao(input, ctx),
});

export const cancelarCotacaoAction = createSafeAction({
  schema: z.object({ cotacaoId: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'compras:cotacao:cancelar',
  revalidate: { tags: ['compras:cotacoes'] },
  handler: async ({ cotacaoId, motivo }, ctx) => comprasService.cancelarCotacao(cotacaoId, motivo, ctx),
});

// =====================================================================
// Pedido de Compra
// =====================================================================

export const criarPedidoCompraAction = createSafeAction({
  schema: CreatePedidoCompraSchema,
  permission: 'compras:pedido:criar',
  revalidate: {
    paths: ['/compras/pedidos'],
    tags: ['compras:pedidos'],
  },
  handler: async (input, ctx) => comprasService.criarPedido(input, ctx),
});

export const converterRequisicaoEmPedidoAction = createSafeAction({
  schema: z.object({
    requisicaoId: z.string().cuid(),
    cotacaoId: z.string().cuid(),
  }),
  permission: 'compras:pedido:criar',
  revalidate: {
    paths: ['/compras/pedidos', '/compras/requisicoes'],
    tags: ['compras:pedidos', 'compras:requisicoes'],
  },
  handler: async ({ requisicaoId, cotacaoId }, ctx) =>
    comprasService.converterRequisicaoEmPedido(requisicaoId, cotacaoId, ctx),
});

export const actualizarPedidoCompraAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdatePedidoCompraSchema,
  }),
  permission: 'compras:pedido:editar',
  revalidate: { tags: ['compras:pedidos'] },
  handler: async ({ id, dados }, ctx) => comprasService.actualizarPedido(id, dados, ctx),
});

export const enviarPedidoCompraAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'compras:pedido:enviar',
  revalidate: { tags: ['compras:pedidos'] },
  handler: async ({ id }, ctx) => comprasService.enviarPedido(id, ctx),
});

export const cancelarPedidoCompraAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'compras:pedido:cancelar',
  revalidate: { tags: ['compras:pedidos'] },
  handler: async ({ id, motivo }, ctx) => comprasService.cancelarPedido(id, motivo, ctx),
});

// =====================================================================
// Recebimento de Mercadoria
// =====================================================================

export const registarRecebimentoAction = createSafeAction({
  schema: CreateRecebimentoCompraSchema,
  permission: 'compras:recebimento:registar',
  revalidate: {
    paths: ['/compras/pedidos'],
    tags: ['compras:pedidos', 'compras:recebimentos'],
  },
  handler: async (input, ctx) => comprasService.registarRecebimento(input, ctx),
});
