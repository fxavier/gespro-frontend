/**
 * Server Actions de Tickets & Suporte — WS F (Wave 2)
 * Mutações de Ticket, CategoriaTicket, EquipeSuporte e BaseConhecimento.
 *
 * Padrão: createSafeAction({ schema, permission, revalidate, handler })
 * tenantId NUNCA vem do input — vem do ctx (session).
 */
'use server';

import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import {
  ticketService,
  categoriaTicketService,
  equipeSuporteService,
  baseConhecimentoService,
} from '@/server/services/operacoes/ticket.service';
import {
  CriarTicketSchema,
  AtualizarTicketSchema,
  TransitarTicketSchema,
  AtribuirTicketSchema,
  AvaliarTicketSchema,
  FiltrarTicketsSchema,
  AdicionarComentarioTicketSchema,
  CriarCategoriaTicketSchema,
  AtualizarCategoriaTicketSchema,
  CriarEquipeSuporteSchema,
  AtualizarEquipeSuporteSchema,
  CriarArtigoBaseConhecimentoSchema,
  AtualizarArtigoBaseConhecimentoSchema,
  FiltrarBaseConhecimentoSchema,
} from '@/lib/validations/tickets';
import { prisma } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';

// ============================================================
// Ticket
// ============================================================

export const criarTicketAction = createSafeAction({
  schema: CriarTicketSchema.extend({
    /** Dados do solicitante vêm da sessão na maioria dos casos; aqui aceita-se override. */
    solicitanteNome: z.string().min(1).max(200).optional(),
    solicitanteEmail: z.string().email().optional(),
    solicitanteTelefone: z.string().max(30).optional(),
  }),
  permission: 'tickets:criar',
  revalidate: { paths: ['/tickets'], tags: ['tickets'] },
  handler: async (input, ctx) => {
    // Obter dados do utilizador da sessão
    const user = await prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { id: true, nome: true, email: true },
    });
    if (!user) throw new NotFoundError('Utilizador não encontrado.');

    const solicitante = {
      id: user.id,
      nome: input.solicitanteNome ?? user.nome,
      email: input.solicitanteEmail ?? user.email,
      telefone: input.solicitanteTelefone,
    };

    const { solicitanteNome: _n, solicitanteEmail: _e, solicitanteTelefone: _t, ...ticketInput } = input;
    return ticketService.criarTicket(ticketInput, solicitante, ctx);
  },
});

export const atualizarTicketAction = createSafeAction({
  schema: AtualizarTicketSchema.extend({ id: z.string().cuid() }),
  permission: 'tickets:editar',
  revalidate: { tags: ['tickets'] },
  handler: async ({ id, ...input }, ctx) => ticketService.atualizarTicket(id, input, ctx),
});

export const transitarTicketAction = createSafeAction({
  schema: TransitarTicketSchema,
  permission: 'tickets:transitar',
  revalidate: { tags: ['tickets'] },
  handler: async (input, ctx) => {
    const user = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { nome: true } });
    return ticketService.transitarTicket(input, user?.nome ?? 'Sistema', ctx);
  },
});

export const atribuirTicketAction = createSafeAction({
  schema: AtribuirTicketSchema,
  permission: 'tickets:atribuir',
  revalidate: { tags: ['tickets'] },
  handler: async (input, ctx) => {
    const user = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { nome: true } });
    return ticketService.atribuirTicket(input, user?.nome ?? 'Sistema', ctx);
  },
});

export const adicionarComentarioTicketAction = createSafeAction({
  schema: AdicionarComentarioTicketSchema,
  permission: 'tickets:comentar',
  revalidate: { tags: ['tickets'] },
  handler: async (input, ctx) => {
    const user = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { id: true, nome: true } });
    if (!user) throw new NotFoundError('Utilizador não encontrado.');
    return ticketService.adicionarComentario(input, { id: user.id, nome: user.nome }, ctx);
  },
});

export const avaliarTicketAction = createSafeAction({
  schema: AvaliarTicketSchema,
  permission: 'tickets:avaliar',
  revalidate: { tags: ['tickets'] },
  handler: async (input, ctx) => ticketService.avaliarTicket(input, ctx.userId, ctx),
});

export const listarTicketsAction = createSafeAction({
  schema: FiltrarTicketsSchema,
  permission: 'tickets:listar',
  handler: async (input, ctx) => ticketService.listarTickets(input, ctx),
});

// ============================================================
// Categoria de Ticket
// ============================================================

export const criarCategoriaTicketAction = createSafeAction({
  schema: CriarCategoriaTicketSchema,
  permission: 'tickets:categoria:criar',
  revalidate: { tags: ['tickets:categorias'] },
  handler: async (input, ctx) => categoriaTicketService.criarCategoria(input, ctx),
});

export const atualizarCategoriaTicketAction = createSafeAction({
  schema: AtualizarCategoriaTicketSchema.extend({ id: z.string().cuid() }),
  permission: 'tickets:categoria:editar',
  revalidate: { tags: ['tickets:categorias'] },
  handler: async ({ id, ...input }, ctx) => categoriaTicketService.atualizarCategoria(id, input, ctx),
});

// ============================================================
// Equipe de Suporte
// ============================================================

export const criarEquipeSuporteAction = createSafeAction({
  schema: CriarEquipeSuporteSchema,
  permission: 'tickets:equipe:criar',
  revalidate: { tags: ['tickets:equipes'] },
  handler: async (input, ctx) => equipeSuporteService.criarEquipe(input, ctx),
});

export const atualizarEquipeSuporteAction = createSafeAction({
  schema: AtualizarEquipeSuporteSchema.extend({ id: z.string().cuid() }),
  permission: 'tickets:equipe:editar',
  revalidate: { tags: ['tickets:equipes'] },
  handler: async ({ id, ...input }, ctx) => equipeSuporteService.atualizarEquipe(id, input, ctx),
});

// ============================================================
// Base de Conhecimento
// ============================================================

export const criarArtigoBaseConhecimentoAction = createSafeAction({
  schema: CriarArtigoBaseConhecimentoSchema,
  permission: 'tickets:base-conhecimento:criar',
  revalidate: { paths: ['/tickets/base-conhecimento'], tags: ['tickets:base-conhecimento'] },
  handler: async (input, ctx) => {
    const user = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { id: true, nome: true } });
    if (!user) throw new NotFoundError('Utilizador não encontrado.');
    return baseConhecimentoService.criarArtigo(input, { id: user.id, nome: user.nome }, ctx);
  },
});

export const atualizarArtigoBaseConhecimentoAction = createSafeAction({
  schema: AtualizarArtigoBaseConhecimentoSchema.extend({ id: z.string().cuid() }),
  permission: 'tickets:base-conhecimento:editar',
  revalidate: { tags: ['tickets:base-conhecimento'] },
  handler: async ({ id, ...input }, ctx) => baseConhecimentoService.atualizarArtigo(id, input, ctx),
});

export const listarArtigosBaseConhecimentoAction = createSafeAction({
  schema: FiltrarBaseConhecimentoSchema,
  permission: 'tickets:base-conhecimento:listar',
  handler: async (input, ctx) => baseConhecimentoService.listarArtigos(input, ctx),
});
