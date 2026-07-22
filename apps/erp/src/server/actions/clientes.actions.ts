'use server';
/**
 * Server Actions — Clientes (WS C)
 * Todas as mutações via createSafeAction.
 * Leituras: Server Components chamam clienteService directamente.
 *
 * Permissões: clientes:criar, clientes:editar, clientes:desativar
 */
import { createSafeAction } from '@/server/safe-action';
import { clienteService } from '@/server/services/comercial/cliente.service';
import {
  CreateClienteSchema,
  UpdateClienteSchema,
  CreateEnderecoClienteSchema,
  UpdateEnderecoClienteSchema,
  CreateContactoClienteSchema,
  UpdateContactoClienteSchema,
  CreateSegmentacaoClienteSchema,
} from '@/lib/validations/clientes';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// CRUD principal
// ---------------------------------------------------------------------------

export const criarCliente = createSafeAction({
  schema: CreateClienteSchema,
  permission: 'clientes:criar',
  revalidate: {
    paths: ['/clientes'],
    tags: ['clientes'],
  },
  handler: async (input, ctx) => {
    return clienteService.criar(input, ctx);
  },
});

export const atualizarCliente = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
    data: UpdateClienteSchema,
  }),
  permission: 'clientes:editar',
  revalidate: {
    paths: ['/clientes'],
    tags: ['clientes'],
  },
  handler: async ({ id, data }, ctx) => {
    return clienteService.atualizar(id, data, ctx);
  },
});

export const desativarCliente = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID inválido'),
  }),
  permission: 'clientes:desativar',
  revalidate: {
    paths: ['/clientes'],
    tags: ['clientes'],
  },
  handler: async ({ id }, ctx) => {
    await clienteService.desativar(id, ctx);
    return { id };
  },
});

// ---------------------------------------------------------------------------
// Endereços
// ---------------------------------------------------------------------------

export const adicionarEnderecoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid('ID de cliente inválido'),
    endereco: CreateEnderecoClienteSchema,
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, endereco }, ctx) => {
    return clienteService.adicionarEndereco(clienteId, endereco, ctx);
  },
});

export const atualizarEnderecoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid('ID de cliente inválido'),
    enderecoId: z.string().cuid('ID de endereço inválido'),
    data: UpdateEnderecoClienteSchema,
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, enderecoId, data }, ctx) => {
    return clienteService.atualizarEndereco(clienteId, enderecoId, data, ctx);
  },
});

export const removerEnderecoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid(),
    enderecoId: z.string().cuid(),
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, enderecoId }, ctx) => {
    await clienteService.removerEndereco(clienteId, enderecoId, ctx);
    return { enderecoId };
  },
});

export const definirEnderecoPrincipal = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid(),
    enderecoId: z.string().cuid(),
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, enderecoId }, ctx) => {
    await clienteService.definirEnderecoPrincipal(clienteId, enderecoId, ctx);
    return { enderecoId };
  },
});

// ---------------------------------------------------------------------------
// Contactos
// ---------------------------------------------------------------------------

export const adicionarContactoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid(),
    contacto: CreateContactoClienteSchema,
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, contacto }, ctx) => {
    return clienteService.adicionarContacto(clienteId, contacto, ctx);
  },
});

export const atualizarContactoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid(),
    contactoId: z.string().cuid(),
    data: UpdateContactoClienteSchema,
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, contactoId, data }, ctx) => {
    return clienteService.atualizarContacto(clienteId, contactoId, data, ctx);
  },
});

export const removerContactoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid(),
    contactoId: z.string().cuid(),
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, contactoId }, ctx) => {
    await clienteService.removerContacto(clienteId, contactoId, ctx);
    return { contactoId };
  },
});

// ---------------------------------------------------------------------------
// Segmentação
// ---------------------------------------------------------------------------

export const atualizarSegmentacaoCliente = createSafeAction({
  schema: z.object({
    clienteId: z.string().cuid(),
    data: CreateSegmentacaoClienteSchema,
  }),
  permission: 'clientes:editar',
  revalidate: {
    tags: ['clientes'],
  },
  handler: async ({ clienteId, data }, ctx) => {
    return clienteService.atualizarSegmentacao(clienteId, data, ctx);
  },
});
