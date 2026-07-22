/**
 * Server Actions de Fornecedores — WS B (Wave 2)
 * Mutações de Fornecedor, Contacto, Documento e Avaliação.
 */
'use server';

import {
  CreateFornecedorSchema,
  UpdateFornecedorSchema,
  CreateContactoFornecedorSchema,
  UpdateContactoFornecedorSchema,
  CreateDocumentoFornecedorSchema,
  CreateAvaliacaoFornecedorSchema,
} from '@/lib/validations/fornecedores';
import {
  CreateContaPagarSchema,
  CreatePagamentoSchema,
} from '@/lib/validations/compras';
import { createSafeAction } from '@/server/safe-action';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { contaPagarService } from '@/server/services/compras/conta-pagar.service';
import { z } from 'zod';

// =====================================================================
// Fornecedor — CRUD
// =====================================================================

export const criarFornecedorAction = createSafeAction({
  schema: CreateFornecedorSchema,
  permission: 'fornecedores:criar',
  revalidate: {
    paths: ['/fornecedores'],
    tags: ['fornecedores'],
  },
  handler: async (input, ctx) => fornecedorService.criar(input, ctx),
});

export const actualizarFornecedorAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateFornecedorSchema,
  }),
  permission: 'fornecedores:editar',
  revalidate: { tags: ['fornecedores'] },
  handler: async ({ id, dados }, ctx) => fornecedorService.actualizar(id, dados, ctx),
});

export const arquivarFornecedorAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'fornecedores:arquivar',
  revalidate: {
    paths: ['/fornecedores'],
    tags: ['fornecedores'],
  },
  handler: async ({ id }, ctx) => fornecedorService.arquivar(id, ctx),
});

// =====================================================================
// Contactos
// =====================================================================

export const adicionarContactoFornecedorAction = createSafeAction({
  schema: z.object({
    fornecedorId: z.string().cuid(),
    dados: CreateContactoFornecedorSchema,
  }),
  permission: 'fornecedores:editar',
  revalidate: { tags: ['fornecedores'] },
  handler: async ({ fornecedorId, dados }, ctx) =>
    fornecedorService.adicionarContacto(fornecedorId, dados, ctx),
});

export const actualizarContactoFornecedorAction = createSafeAction({
  schema: z.object({
    contactoId: z.string().cuid(),
    dados: UpdateContactoFornecedorSchema,
  }),
  permission: 'fornecedores:editar',
  revalidate: { tags: ['fornecedores'] },
  handler: async ({ contactoId, dados }, ctx) =>
    fornecedorService.actualizarContacto(contactoId, dados, ctx),
});

export const removerContactoFornecedorAction = createSafeAction({
  schema: z.object({ contactoId: z.string().cuid() }),
  permission: 'fornecedores:editar',
  revalidate: { tags: ['fornecedores'] },
  handler: async ({ contactoId }, ctx) => fornecedorService.removerContacto(contactoId, ctx),
});

// =====================================================================
// Documentos
// =====================================================================

export const adicionarDocumentoFornecedorAction = createSafeAction({
  schema: CreateDocumentoFornecedorSchema,
  permission: 'fornecedores:editar',
  revalidate: { tags: ['fornecedores'] },
  handler: async (input, ctx) => fornecedorService.adicionarDocumento(input, ctx),
});

export const removerDocumentoFornecedorAction = createSafeAction({
  schema: z.object({ documentoId: z.string().cuid() }),
  permission: 'fornecedores:editar',
  revalidate: { tags: ['fornecedores'] },
  handler: async ({ documentoId }, ctx) => fornecedorService.removerDocumento(documentoId, ctx),
});

// =====================================================================
// Avaliação
// =====================================================================

export const registarAvaliacaoFornecedorAction = createSafeAction({
  schema: CreateAvaliacaoFornecedorSchema,
  permission: 'fornecedores:avaliar',
  revalidate: { tags: ['fornecedores'] },
  handler: async (input, ctx) => fornecedorService.registarAvaliacao(input, ctx),
});

// =====================================================================
// Contas a Pagar (acedidas via painel de fornecedor)
// =====================================================================

export const criarContaPagarAction = createSafeAction({
  schema: CreateContaPagarSchema,
  permission: 'compras:conta-pagar:criar',
  revalidate: {
    paths: ['/fornecedores/contas-pagar'],
    tags: ['compras:contas-pagar'],
  },
  handler: async (input, ctx) => contaPagarService.criar(input, ctx),
});

export const cancelarContaPagarAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'compras:conta-pagar:cancelar',
  revalidate: { tags: ['compras:contas-pagar'] },
  handler: async ({ id, motivo }, ctx) => contaPagarService.cancelar(id, motivo, ctx),
});

export const registarPagamentoAction = createSafeAction({
  schema: CreatePagamentoSchema,
  permission: 'compras:pagamento:registar',
  revalidate: {
    paths: ['/fornecedores/contas-pagar'],
    tags: ['compras:contas-pagar', 'compras:pagamentos'],
  },
  handler: async (input, ctx) => contaPagarService.registarPagamento(input, ctx),
});
