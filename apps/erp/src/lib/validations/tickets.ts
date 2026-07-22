// Zod schemas — Módulo de Tickets & Suporte (WS F)
// Partilhado cliente/servidor. Nunca aceitar `where` cru do cliente.

import { z } from 'zod';

// ============================================================
// Enums (espelham os enums Prisma de operacoes.prisma)
// ============================================================

export const TipoTicketEnum = z.enum([
  'INCIDENTE',
  'REQUISICAO',
  'PROBLEMA',
  'MUDANCA',
  'CONSULTA',
]);

export const PrioridadeTicketEnum = z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']);

export const EstadoTicketEnum = z.enum([
  'ABERTO',
  'EM_PROGRESSO',
  'AGUARDANDO_CLIENTE',
  'AGUARDANDO_TERCEIRO',
  'RESOLVIDO',
  'FECHADO',
  'CANCELADO',
]);

export const TipoAtividadeTicketEnum = z.enum([
  'COMENTARIO',
  'MUDANCA_STATUS',
  'ATRIBUICAO',
  'ANEXO',
  'SISTEMA',
]);

export const VisibilidadeAtividadeTicketEnum = z.enum(['PUBLICA', 'INTERNA']);

export const EstadoBaseConhecimentoEnum = z.enum(['RASCUNHO', 'PUBLICADO', 'ARQUIVADO']);

export const EstadoEquipeSuporteEnum = z.enum(['ATIVA', 'INATIVA']);

export const PapelMembroEquipeEnum = z.enum(['LIDER', 'AGENTE', 'SUPERVISOR']);

// ============================================================
// Ticket
// ============================================================

export const CriarTicketSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter pelo menos 3 caracteres').max(300),
  descricao: z.string().min(10, 'Descrição deve ter pelo menos 10 caracteres').max(5000),
  tipo: TipoTicketEnum,
  categoriaId: z.string().cuid().optional(),
  subcategoria: z.string().max(100).optional(),
  prioridade: PrioridadeTicketEnum.default('NORMAL'),
  /// Polimorfismo opcional (conflito #18): tipo da entidade de origem
  origemTipo: z.string().max(50).optional(),
  /// Polimorfismo opcional (conflito #18): ID da entidade de origem
  origemId: z.string().optional(),
  tags: z.array(z.string().max(50)).default([]),
  observacoes: z.string().max(2000).optional(),
});

export const AtualizarTicketSchema = z.object({
  titulo: z.string().min(3).max(300).optional(),
  descricao: z.string().min(10).max(5000).optional(),
  tipo: TipoTicketEnum.optional(),
  categoriaId: z.string().cuid().nullable().optional(),
  subcategoria: z.string().max(100).nullable().optional(),
  prioridade: PrioridadeTicketEnum.optional(),
  atribuidoParaId: z.string().nullable().optional(),
  atribuidoParaNome: z.string().max(200).nullable().optional(),
  equipeId: z.string().cuid().nullable().optional(),
  origemTipo: z.string().max(50).nullable().optional(),
  origemId: z.string().nullable().optional(),
  tags: z.array(z.string().max(50)).optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

export const TransitarTicketSchema = z.object({
  ticketId: z.string().cuid(),
  estadoAlvo: EstadoTicketEnum,
  descricao: z.string().min(1, 'Descrição da transição obrigatória').max(500),
  visibilidade: VisibilidadeAtividadeTicketEnum.default('PUBLICA'),
});

export const AtribuirTicketSchema = z.object({
  ticketId: z.string().cuid(),
  atribuidoParaId: z.string().min(1),
  atribuidoParaNome: z.string().min(1).max(200),
  equipeId: z.string().cuid().optional(),
  descricao: z.string().max(500).optional(),
});

export const AvaliarTicketSchema = z.object({
  ticketId: z.string().cuid(),
  nota: z.number().int().min(1).max(5),
  comentario: z.string().max(1000).optional(),
});

export const FiltrarTicketsSchema = z.object({
  estado: EstadoTicketEnum.optional(),
  tipo: TipoTicketEnum.optional(),
  prioridade: PrioridadeTicketEnum.optional(),
  categoriaId: z.string().cuid().optional(),
  solicitanteId: z.string().optional(),
  atribuidoParaId: z.string().optional(),
  equipeId: z.string().cuid().optional(),
  slaEmAtraso: z.boolean().optional(),
  origemTipo: z.string().optional(),
  origemId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  pesquisa: z.string().max(200).optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['createdAt', 'prioridade', 'slaDataLimiteResolucao']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriarTicketInput = z.infer<typeof CriarTicketSchema>;
export type AtualizarTicketInput = z.infer<typeof AtualizarTicketSchema>;
export type TransitarTicketInput = z.infer<typeof TransitarTicketSchema>;
export type AtribuirTicketInput = z.infer<typeof AtribuirTicketSchema>;
export type AvaliarTicketInput = z.infer<typeof AvaliarTicketSchema>;
export type FiltrarTicketsInput = z.infer<typeof FiltrarTicketsSchema>;

// ============================================================
// Atividade de Ticket (comentário / log)
// ============================================================

export const AdicionarComentarioTicketSchema = z.object({
  ticketId: z.string().cuid(),
  descricao: z.string().min(1, 'Comentário não pode ser vazio').max(5000),
  visibilidade: VisibilidadeAtividadeTicketEnum.default('PUBLICA'),
});

export type AdicionarComentarioTicketInput = z.infer<typeof AdicionarComentarioTicketSchema>;

// ============================================================
// Categoria de Ticket
// ============================================================

export const CriarCategoriaTicketSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  icone: z.string().max(50).optional(),
  cor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser hex válido (ex: #3b82f6)').optional(),
  subcategorias: z.array(z.string().max(100)).default([]),
  slaTempoResposta: z.number().int().positive('Tempo de resposta deve ser positivo'),
  slaTempoResolucao: z.number().int().positive('Tempo de resolução deve ser positivo'),
});

export const AtualizarCategoriaTicketSchema = CriarCategoriaTicketSchema.partial().extend({
  ativa: z.boolean().optional(),
});

export const FiltrarCategoriasTicketSchema = z.object({
  ativa: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(50),
});

export type CriarCategoriaTicketInput = z.infer<typeof CriarCategoriaTicketSchema>;
export type AtualizarCategoriaTicketInput = z.infer<typeof AtualizarCategoriaTicketSchema>;

// ============================================================
// Equipe de Suporte
// ============================================================

export const MembroEquipeInputSchema = z.object({
  usuarioId: z.string().min(1),
  nome: z.string().min(1).max(200),
  email: z.string().email(),
  cargo: z.string().min(1).max(100),
  papel: PapelMembroEquipeEnum,
  especialidades: z.array(z.string().max(100)).default([]),
});

export const CriarEquipeSuporteSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(500).optional(),
  categorias: z.array(z.string()).default([]),
  horarioInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  horarioFim: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  diasSemana: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Pelo menos um dia obrigatório'),
  membros: z.array(MembroEquipeInputSchema).default([]),
});

export const AtualizarEquipeSuporteSchema = CriarEquipeSuporteSchema.partial().extend({
  estado: EstadoEquipeSuporteEnum.optional(),
});

export const FiltrarEquipesSuporteSchema = z.object({
  estado: EstadoEquipeSuporteEnum.optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type CriarEquipeSuporteInput = z.infer<typeof CriarEquipeSuporteSchema>;
export type AtualizarEquipeSuporteInput = z.infer<typeof AtualizarEquipeSuporteSchema>;

// ============================================================
// Base de Conhecimento
// ============================================================

export const CriarArtigoBaseConhecimentoSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter pelo menos 3 caracteres').max(300),
  conteudo: z.string().min(10, 'Conteúdo obrigatório'),
  resumo: z.string().max(500).optional(),
  categoria: z.string().min(1, 'Categoria obrigatória').max(100),
  tags: z.array(z.string().max(50)).default([]),
  visibilidade: VisibilidadeAtividadeTicketEnum.default('PUBLICA'),
});

export const AtualizarArtigoBaseConhecimentoSchema = CriarArtigoBaseConhecimentoSchema.partial().extend({
  estado: EstadoBaseConhecimentoEnum.optional(),
});

export const FiltrarBaseConhecimentoSchema = z.object({
  estado: EstadoBaseConhecimentoEnum.optional(),
  visibilidade: VisibilidadeAtividadeTicketEnum.optional(),
  categoria: z.string().optional(),
  pesquisa: z.string().max(200).optional(),
  tags: z.array(z.string()).optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['createdAt', 'visualizacoes', 'util']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriarArtigoBaseConhecimentoInput = z.infer<typeof CriarArtigoBaseConhecimentoSchema>;
export type AtualizarArtigoBaseConhecimentoInput = z.infer<typeof AtualizarArtigoBaseConhecimentoSchema>;
export type FiltrarBaseConhecimentoInput = z.infer<typeof FiltrarBaseConhecimentoSchema>;
