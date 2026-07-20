/**
 * Server Actions de Serviços — WS B (Wave 2)
 * Mutações de CategoriaServico, Servico, TecnicoServico,
 * AgendamentoServico, AvaliacaoServico, ContratoServico.
 */
'use server';

import {
  CreateCategoriaServicoSchema,
  UpdateCategoriaServicoSchema,
  CreateServicoSchema,
  UpdateServicoSchema,
  CreateTecnicoServicoSchema,
  UpdateTecnicoServicoSchema,
  CreateAgendamentoServicoSchema,
  UpdateAgendamentoServicoSchema,
  TransitarAgendamentoSchema,
  CreateAvaliacaoServicoSchema,
  CreateContratoServicoSchema,
  UpdateContratoServicoSchema,
} from '@/lib/validations/servicos';
import { createSafeAction } from '@/server/safe-action';
import { servicoService } from '@/server/services/compras/servico.service';
import { z } from 'zod';

// =====================================================================
// Categorias
// =====================================================================

export const criarCategoriaServicoAction = createSafeAction({
  schema: CreateCategoriaServicoSchema,
  permission: 'servicos:configurar',
  revalidate: { tags: ['servicos:categorias'] },
  handler: async (input, ctx) => servicoService.criarCategoria(input, ctx),
});

export const actualizarCategoriaServicoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateCategoriaServicoSchema,
  }),
  permission: 'servicos:configurar',
  revalidate: { tags: ['servicos:categorias'] },
  handler: async ({ id, dados }, ctx) => servicoService.actualizarCategoria(id, dados, ctx),
});

// =====================================================================
// Serviços
// =====================================================================

export const criarServicoAction = createSafeAction({
  schema: CreateServicoSchema,
  permission: 'servicos:criar',
  revalidate: {
    paths: ['/servicos'],
    tags: ['servicos'],
  },
  handler: async (input, ctx) => servicoService.criarServico(input, ctx),
});

export const actualizarServicoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateServicoSchema,
  }),
  permission: 'servicos:editar',
  revalidate: { tags: ['servicos'] },
  handler: async ({ id, dados }, ctx) => servicoService.actualizarServico(id, dados, ctx),
});

export const arquivarServicoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'servicos:arquivar',
  revalidate: {
    paths: ['/servicos'],
    tags: ['servicos'],
  },
  handler: async ({ id }, ctx) => servicoService.arquivarServico(id, ctx),
});

// =====================================================================
// Técnicos
// =====================================================================

export const criarTecnicoServicoAction = createSafeAction({
  schema: CreateTecnicoServicoSchema,
  permission: 'servicos:tecnicos:criar',
  revalidate: { tags: ['servicos:tecnicos'] },
  handler: async (input, ctx) => servicoService.criarTecnico(input, ctx),
});

export const actualizarTecnicoServicoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateTecnicoServicoSchema,
  }),
  permission: 'servicos:tecnicos:editar',
  revalidate: { tags: ['servicos:tecnicos'] },
  handler: async ({ id, dados }, ctx) => servicoService.actualizarTecnico(id, dados, ctx),
});

// =====================================================================
// Agendamentos
// =====================================================================

export const criarAgendamentoAction = createSafeAction({
  schema: CreateAgendamentoServicoSchema,
  permission: 'servicos:agendamento:criar',
  revalidate: {
    paths: ['/servicos/agendamentos'],
    tags: ['servicos:agendamentos'],
  },
  handler: async (input, ctx) => servicoService.criarAgendamento(input, ctx),
});

export const actualizarAgendamentoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateAgendamentoServicoSchema,
  }),
  permission: 'servicos:agendamento:editar',
  revalidate: { tags: ['servicos:agendamentos'] },
  handler: async ({ id, dados }, ctx) => servicoService.actualizarAgendamento(id, dados, ctx),
});

export const transitarAgendamentoAction = createSafeAction({
  schema: TransitarAgendamentoSchema,
  permission: 'servicos:agendamento:transitar',
  revalidate: {
    paths: ['/servicos/agendamentos'],
    tags: ['servicos:agendamentos'],
  },
  handler: async ({ agendamentoId, novoStatus, notasConclusao }, ctx) =>
    servicoService.transitarAgendamento(agendamentoId, novoStatus, notasConclusao, ctx),
});

// =====================================================================
// Avaliações
// =====================================================================

export const registarAvaliacaoServicoAction = createSafeAction({
  schema: CreateAvaliacaoServicoSchema,
  permission: 'servicos:avaliar',
  revalidate: { tags: ['servicos', 'servicos:agendamentos'] },
  handler: async (input, ctx) => servicoService.registarAvaliacao(input, ctx),
});

// =====================================================================
// Contratos de Serviço
// =====================================================================

export const criarContratoServicoAction = createSafeAction({
  schema: CreateContratoServicoSchema,
  permission: 'servicos:contrato:criar',
  revalidate: {
    paths: ['/servicos/contratos'],
    tags: ['servicos:contratos'],
  },
  handler: async (input, ctx) => servicoService.criarContrato(input, ctx),
});

export const actualizarContratoServicoAction = createSafeAction({
  schema: z.object({
    id: z.string().cuid(),
    dados: UpdateContratoServicoSchema,
  }),
  permission: 'servicos:contrato:editar',
  revalidate: { tags: ['servicos:contratos'] },
  handler: async ({ id, dados }, ctx) => servicoService.actualizarContrato(id, dados, ctx),
});

export const renovarContratoServicoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'servicos:contrato:renovar',
  revalidate: { tags: ['servicos:contratos'] },
  handler: async ({ id }, ctx) => servicoService.renovarContrato(id, ctx),
});
