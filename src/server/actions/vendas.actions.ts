'use server';
/**
 * Server Actions — Vendas + POS + Encomendas + Devoluções + Trocas + Vendedores (WS C + WS-10)
 */
import { createSafeAction } from '@/server/safe-action';
import {
  vendaService,
  sessaoPOSService,
  encomendaService,
  devolucaoService,
  trocaService,
  vendedorService,
} from '@/server/services/comercial/index';
import {
  CreateVendaSchema,
  UpdateVendaSchema,
  TransitarVendaSchema,
  AbrirSessaoPOSSchema,
  FecharSessaoPOSSchema,
  CreateEncomendaSchema,
  UpdateEncomendaSchema,
  TransitarEncomendaSchema,
  ConverterEncomendaEmVendaSchema,
  CreateDevolucaoSchema,
  CreateTrocaSchema,
  CreateVendedorSchema,
  UpdateVendedorSchema,
} from '@/lib/validations/vendas';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

export const criarVenda = createSafeAction({
  schema: CreateVendaSchema,
  permission: 'vendas:criar',
  revalidate: {
    paths: ['/vendas'],
    tags: ['vendas'],
  },
  handler: async (input, ctx) => {
    return vendaService.criar(input, ctx);
  },
});

export const atualizarVenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateVendaSchema,
  }),
  permission: 'vendas:editar',
  revalidate: {
    tags: ['vendas'],
  },
  handler: async ({ id, data }, ctx) => {
    return vendaService.atualizar(id, data, ctx);
  },
});

export const transitarVendaAction = createSafeAction({
  schema: TransitarVendaSchema,
  permission: 'vendas:editar',
  revalidate: {
    tags: ['vendas'],
  },
  handler: async (input, ctx) => {
    return vendaService.transitar(input, ctx);
  },
});

export const cancelarVenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    motivo: z.string().max(500).optional(),
  }),
  permission: 'vendas:cancelar',
  revalidate: {
    paths: ['/vendas'],
    tags: ['vendas'],
  },
  handler: async ({ id, motivo }, ctx) => {
    return vendaService.transitar({ vendaId: id, paraStatus: 'CANCELADA', motivo }, ctx);
  },
});

// ---------------------------------------------------------------------------
// POS
// ---------------------------------------------------------------------------

export const abrirSessaoPOS = createSafeAction({
  schema: AbrirSessaoPOSSchema,
  permission: 'pos:operar',
  revalidate: {
    tags: ['sessao-pos'],
  },
  handler: async (input, ctx) => {
    return sessaoPOSService.abrir(input, ctx);
  },
});

export const fecharSessaoPOS = createSafeAction({
  schema: FecharSessaoPOSSchema,
  permission: 'pos:operar',
  revalidate: {
    paths: ['/pos'],
    tags: ['sessao-pos'],
  },
  handler: async (input, ctx) => {
    return sessaoPOSService.fechar(input, ctx);
  },
});

export const suspenderSessaoPOS = createSafeAction({
  schema: z.object({ sessaoPOSId: z.string().cuid() }),
  permission: 'pos:operar',
  revalidate: {
    tags: ['sessao-pos'],
  },
  handler: async ({ sessaoPOSId }, ctx) => {
    return sessaoPOSService.suspender(sessaoPOSId, ctx);
  },
});

export const retomarSessaoPOS = createSafeAction({
  schema: z.object({ sessaoPOSId: z.string().cuid() }),
  permission: 'pos:operar',
  revalidate: {
    tags: ['sessao-pos'],
  },
  handler: async ({ sessaoPOSId }, ctx) => {
    return sessaoPOSService.retomar(sessaoPOSId, ctx);
  },
});

// ---------------------------------------------------------------------------
// Encomendas (WS-10)
// ---------------------------------------------------------------------------

export const criarEncomenda = createSafeAction({
  schema: CreateEncomendaSchema,
  permission: 'vendas:encomendas:criar',
  revalidate: {
    paths: ['/vendas/pedidos'],
    tags: ['encomendas'],
  },
  handler: async (input, ctx) => {
    return encomendaService.criar(input, ctx);
  },
});

export const atualizarEncomenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateEncomendaSchema,
  }),
  permission: 'vendas:encomendas:editar',
  revalidate: {
    tags: ['encomendas'],
  },
  handler: async ({ id, data }, ctx) => {
    return encomendaService.atualizar(id, data, ctx);
  },
});

export const transitarEncomenda = createSafeAction({
  schema: TransitarEncomendaSchema,
  permission: 'vendas:encomendas:confirmar',
  revalidate: {
    tags: ['encomendas'],
  },
  handler: async (input, ctx) => {
    return encomendaService.transitar(input, ctx);
  },
});

export const converterEncomendaEmVenda = createSafeAction({
  schema: ConverterEncomendaEmVendaSchema,
  permission: 'vendas:encomendas:converter',
  revalidate: {
    paths: ['/vendas/pedidos', '/vendas'],
    tags: ['encomendas', 'vendas'],
  },
  handler: async ({ encomendaId, pagamentos, sessaoCaixaId }, ctx) => {
    return encomendaService.converterEmVenda(
      encomendaId,
      pagamentos,
      ctx,
      sessaoCaixaId,
    );
  },
});

export const cancelarEncomenda = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    localizacaoId: z.string().cuid().optional(),
  }),
  permission: 'vendas:encomendas:cancelar',
  revalidate: {
    tags: ['encomendas'],
  },
  handler: async ({ id, localizacaoId }, ctx) => {
    return encomendaService.transitar(
      { encomendaId: id, paraStatus: 'CANCELADA', localizacaoId },
      ctx,
    );
  },
});

// ---------------------------------------------------------------------------
// Devoluções (WS-10)
// ---------------------------------------------------------------------------

export const criarDevolucao = createSafeAction({
  schema: CreateDevolucaoSchema,
  permission: 'vendas:devolucoes:criar',
  revalidate: {
    paths: ['/vendas/devolucoes'],
    tags: ['devolucoes'],
  },
  handler: async (input, ctx) => {
    return devolucaoService.criar(input, ctx);
  },
});

export const aprovarDevolucao = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID inválido') }),
  permission: 'vendas:devolucoes:aprovar',
  revalidate: {
    tags: ['devolucoes'],
  },
  handler: async ({ id }, ctx) => {
    return devolucaoService.aprovar(id, ctx);
  },
});

export const processarDevolucao = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    localizacaoId: z.string().cuid().optional(),
    sessaoCaixaId: z.string().cuid().optional(),
    serieNotaCreditoId: z.string().cuid().optional(),
  }),
  permission: 'vendas:devolucoes:processar',
  revalidate: {
    paths: ['/vendas/devolucoes'],
    tags: ['devolucoes'],
  },
  handler: async ({ id, localizacaoId, sessaoCaixaId, serieNotaCreditoId }, ctx) => {
    return devolucaoService.processar(id, ctx, {
      localizacaoId,
      sessaoCaixaId,
      serieNotaCreditoId,
    });
  },
});

export const rejeitarDevolucao = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID inválido') }),
  permission: 'vendas:devolucoes:rejeitar',
  revalidate: {
    tags: ['devolucoes'],
  },
  handler: async ({ id }, ctx) => {
    return devolucaoService.rejeitar(id, ctx);
  },
});

// ---------------------------------------------------------------------------
// Trocas (WS-10)
// ---------------------------------------------------------------------------

export const criarTroca = createSafeAction({
  schema: CreateTrocaSchema,
  permission: 'vendas:trocas:criar',
  revalidate: {
    paths: ['/vendas/trocas', '/vendas/devolucoes'],
    tags: ['trocas', 'devolucoes'],
  },
  handler: async (input, ctx) => {
    return trocaService.criar(input, ctx);
  },
});

// ---------------------------------------------------------------------------
// Vendedores (WS-10)
// ---------------------------------------------------------------------------

export const criarVendedor = createSafeAction({
  schema: CreateVendedorSchema,
  permission: 'vendas:vendedores:criar',
  revalidate: {
    paths: ['/vendas/vendedores'],
    tags: ['vendedores'],
  },
  handler: async (input, ctx) => {
    return vendedorService.criar(input, ctx);
  },
});

export const atualizarVendedor = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateVendedorSchema,
  }),
  permission: 'vendas:vendedores:editar',
  revalidate: {
    tags: ['vendedores'],
  },
  handler: async ({ id, data }, ctx) => {
    return vendedorService.atualizar(id, data, ctx);
  },
});

export const excluirVendedor = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID inválido') }),
  permission: 'vendas:vendedores:excluir',
  revalidate: {
    paths: ['/vendas/vendedores'],
    tags: ['vendedores'],
  },
  handler: async ({ id }, ctx) => {
    return vendedorService.excluir(id, ctx);
  },
});
