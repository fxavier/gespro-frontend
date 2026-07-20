'use server';
/**
 * Server Actions — Comissões (WS C)
 * Permissões: comissoes:gerir, comissoes:pagar
 */
import { createSafeAction } from '@/server/safe-action';
import { comissaoService } from '@/server/services/comercial/comissao.service';
import {
  CreateRegraComissaoSchema,
  UpdateRegraComissaoSchema,
} from '@/lib/validations/vendas';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Regras de comissão
// ---------------------------------------------------------------------------

export const criarRegraComissao = createSafeAction({
  schema: CreateRegraComissaoSchema,
  permission: 'comissoes:gerir',
  revalidate: {
    paths: ['/comissoes/regras'],
    tags: ['regras-comissao'],
  },
  handler: async (input, ctx) => {
    return comissaoService.criarRegra(input, ctx);
  },
});

export const atualizarRegraComissao = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateRegraComissaoSchema,
  }),
  permission: 'comissoes:gerir',
  revalidate: {
    tags: ['regras-comissao'],
  },
  handler: async ({ id, data }, ctx) => {
    return comissaoService.atualizarRegra(id, data, ctx);
  },
});

export const ativarDesativarRegraComissao = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    ativa: z.boolean(),
  }),
  permission: 'comissoes:gerir',
  revalidate: {
    tags: ['regras-comissao'],
  },
  handler: async ({ id, ativa }, ctx) => {
    return comissaoService.ativarDesativarRegra(id, ativa, ctx);
  },
});

// ---------------------------------------------------------------------------
// Gestão de comissões
// ---------------------------------------------------------------------------

export const aprovarComissao = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'comissoes:gerir',
  revalidate: {
    tags: ['comissoes'],
  },
  handler: async ({ id }, ctx) => {
    return comissaoService.aprovar(id, ctx);
  },
});

export const marcarComissaoPaga = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'comissoes:pagar',
  revalidate: {
    paths: ['/comissoes'],
    tags: ['comissoes'],
  },
  handler: async ({ id }, ctx) => {
    return comissaoService.marcarPaga(id, ctx);
  },
});

export const cancelarComissao = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    motivo: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres').max(500),
  }),
  permission: 'comissoes:gerir',
  revalidate: {
    tags: ['comissoes'],
  },
  handler: async ({ id, motivo }, ctx) => {
    return comissaoService.cancelar(id, motivo, ctx);
  },
});
