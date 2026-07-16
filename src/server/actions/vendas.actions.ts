'use server';
/**
 * Server Actions — Vendas + POS (WS C)
 * Permissões: vendas:criar, vendas:editar, vendas:cancelar, pos:operar
 */
import { createSafeAction } from '@/server/safe-action';
import { vendaService, sessaoPOSService } from '@/server/services/comercial/index';
import {
  CreateVendaSchema,
  UpdateVendaSchema,
  TransitarVendaSchema,
  AbrirSessaoPOSSchema,
  FecharSessaoPOSSchema,
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
