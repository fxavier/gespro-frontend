/**
 * Zod schemas — Serviços (CategoriaServico, Servico, TecnicoServico,
 * AgendamentoServico, AvaliacaoServico, ContratoServico) — WS B
 * Partilhado cliente/servidor. Sem imports de @prisma/client.
 */
import { z } from 'zod';

// ---- Enums ----

export const TipoServicoEnum = z.enum([
  'INSTALACAO',
  'MANUTENCAO',
  'REPARACAO',
  'CONSULTORIA',
  'LIMPEZA',
  'TRANSPORTE',
  'OUTRO',
]);

export const NivelTecnicoServicoEnum = z.enum(['BASICO', 'INTERMEDIARIO', 'AVANCADO']);

export const StatusAgendamentoEnum = z.enum([
  'PENDENTE',
  'CONFIRMADO',
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'CANCELADO',
  'NAO_COMPARECEU',
]);

export const StatusContratoServicoEnum = z.enum(['ATIVO', 'PAUSADO', 'ENCERRADO', 'CANCELADO']);

export const PeriodicidadeContratoEnum = z.enum([
  'MENSAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
]);

// ---- Dias da semana (domínio moçambicano, português) ----
const diasSemana = z.enum([
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
  'domingo',
]);

// ---- Hora no formato HH:MM ----
const horaSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Hora inválida — formato HH:MM')
  .optional();

const positivoDecimal = z.number().positive('Valor deve ser positivo');

// =====================================================================
// CATEGORIA DE SERVIÇO
// =====================================================================

export const CreateCategoriaServicoSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida — use formato hexadecimal #RRGGBB')
    .default('#6B7280'),
  icone: z.string().max(50).optional(),
  ativo: z.boolean().default(true),
  ordem: z.number().int().optional(),
});

export type CreateCategoriaServicoInput = z.infer<typeof CreateCategoriaServicoSchema>;

export const UpdateCategoriaServicoSchema = CreateCategoriaServicoSchema.partial();

// =====================================================================
// SERVIÇO
// =====================================================================

export const CreateServicoSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório').max(50),
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  categoriaServicoId: z.string().cuid().optional(),
  subcategoria: z.string().max(100).optional(),
  preco: positivoDecimal,
  precoMinimo: z.number().positive().optional(),
  precoMaximo: z.number().positive().optional(),
  duracaoEstimada: z.number().int().positive('Duração deve ser positiva (minutos)'),
  unidadeMedida: z.string().min(1).max(30).default('un'),
  taxaIva: z.number().min(0).max(1).default(0.16),
  tipoServico: TipoServicoEnum.default('OUTRO'),
  incluiMaterial: z.boolean().default(false),
  materialIncluido: z.string().max(500).optional(),
  requerAgendamento: z.boolean().default(true),
  requerTecnico: z.boolean().default(false),
  nivelTecnicoRequerido: NivelTecnicoServicoEnum.optional(),
  disponivel: z.boolean().default(true),
  diasDisponibilidade: z.array(diasSemana).default([]),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  imagem: z.string().url().optional(),
  observacoes: z.string().max(2000).optional(),
})
  .refine(
    (d) => !d.precoMinimo || !d.precoMaximo || d.precoMinimo <= d.precoMaximo,
    { message: 'precoMinimo deve ser menor ou igual a precoMaximo' },
  )
  .refine(
    (d) => !d.requerTecnico || d.nivelTecnicoRequerido !== undefined || true,
    // Opcional — nível de técnico é só informativo
    { message: '' },
  );

export type CreateServicoInput = z.infer<typeof CreateServicoSchema>;

export const UpdateServicoSchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  categoriaServicoId: z.string().cuid().optional(),
  subcategoria: z.string().max(100).optional(),
  preco: positivoDecimal.optional(),
  precoMinimo: z.number().positive().optional(),
  precoMaximo: z.number().positive().optional(),
  duracaoEstimada: z.number().int().positive().optional(),
  unidadeMedida: z.string().min(1).max(30).optional(),
  taxaIva: z.number().min(0).max(1).optional(),
  tipoServico: TipoServicoEnum.optional(),
  incluiMaterial: z.boolean().optional(),
  materialIncluido: z.string().max(500).optional(),
  requerAgendamento: z.boolean().optional(),
  requerTecnico: z.boolean().optional(),
  nivelTecnicoRequerido: NivelTecnicoServicoEnum.optional(),
  disponivel: z.boolean().optional(),
  diasDisponibilidade: z.array(diasSemana).optional(),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  imagem: z.string().url().optional(),
  observacoes: z.string().max(2000).optional(),
  ativo: z.boolean().optional(),
});

export type UpdateServicoInput = z.infer<typeof UpdateServicoSchema>;

export const FilterServicoSchema = z.object({
  termo: z.string().max(200).optional(),
  categoriaServicoId: z.string().optional(),
  tipoServico: TipoServicoEnum.optional(),
  ativo: z.boolean().optional(),
  disponivel: z.boolean().optional(),
  requerTecnico: z.boolean().optional(),
  precoMin: z.number().positive().optional(),
  precoMax: z.number().positive().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['nome', 'preco', 'totalVendas', 'createdAt']).default('nome'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});

export type FilterServicoInput = z.infer<typeof FilterServicoSchema>;

// =====================================================================
// TÉCNICO DE SERVIÇO
// =====================================================================

export const CreateTecnicoServicoSchema = z.object({
  colaboradorId: z.string().min(1, 'ID do colaborador obrigatório'),
  nome: z.string().min(2).max(150),
  email: z.string().email('Email inválido'),
  telefone: z.string().min(1).max(30),
  especialidades: z.array(z.string().max(100)).min(1, 'Pelo menos uma especialidade'),
  nivelTecnico: NivelTecnicoServicoEnum.default('BASICO'),
  custoHora: positivoDecimal,
});

export type CreateTecnicoServicoInput = z.infer<typeof CreateTecnicoServicoSchema>;

export const UpdateTecnicoServicoSchema = z.object({
  email: z.string().email().optional(),
  telefone: z.string().max(30).optional(),
  especialidades: z.array(z.string().max(100)).optional(),
  nivelTecnico: NivelTecnicoServicoEnum.optional(),
  custoHora: positivoDecimal.optional(),
  disponivel: z.boolean().optional(),
});

export const FilterTecnicoServicoSchema = z.object({
  disponivel: z.boolean().optional(),
  nivelTecnico: NivelTecnicoServicoEnum.optional(),
  especialidade: z.string().max(100).optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
});

// =====================================================================
// AGENDAMENTO DE SERVIÇO
// =====================================================================

export const CreateAgendamentoServicoSchema = z.object({
  servicoId: z.string().cuid('ID de serviço inválido'),
  clienteId: z.string().min(1, 'ID de cliente obrigatório'),
  clienteNome: z.string().min(2).max(150),
  clienteEmail: z.string().email('Email inválido'),
  clienteTelefone: z.string().min(1).max(30),
  tecnicoId: z.string().cuid().optional(),
  dataAgendamento: z.coerce.date(),
  horaInicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Hora inválida — formato HH:MM'),
  horaFim: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Hora inválida — formato HH:MM'),
  duracaoEstimada: z.number().int().positive('Duração em minutos'),
  local: z.string().min(1).max(200),
  endereco: z.string().min(1).max(300),
  cidade: z.string().min(1).max(100),
  provincia: z.string().min(1).max(100),
  precoServico: positivoDecimal,
  desconto: z.number().min(0).optional(),
  taxaIva: z.number().min(0).max(1).default(0.16),
  observacoes: z.string().max(2000).optional(),
});

export type CreateAgendamentoServicoInput = z.infer<typeof CreateAgendamentoServicoSchema>;

export const UpdateAgendamentoServicoSchema = z.object({
  tecnicoId: z.string().cuid().optional(),
  dataAgendamento: z.coerce.date().optional(),
  horaInicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  horaFim: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  local: z.string().max(200).optional(),
  endereco: z.string().max(300).optional(),
  observacoes: z.string().max(2000).optional(),
  notasConclusao: z.string().max(2000).optional(),
});

export const FilterAgendamentoServicoSchema = z.object({
  status: StatusAgendamentoEnum.optional(),
  servicoId: z.string().optional(),
  tecnicoId: z.string().optional(),
  clienteId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['dataAgendamento', 'createdAt']).default('dataAgendamento'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});

export type FilterAgendamentoServicoInput = z.infer<typeof FilterAgendamentoServicoSchema>;

// ---- Transição de estado de agendamento ----

export const TransitarAgendamentoSchema = z.object({
  agendamentoId: z.string().cuid(),
  novoStatus: StatusAgendamentoEnum,
  notasConclusao: z.string().max(2000).optional(),
  observacoes: z.string().max(1000).optional(),
});

// =====================================================================
// AVALIAÇÃO DE SERVIÇO
// =====================================================================

export const CreateAvaliacaoServicoSchema = z.object({
  agendamentoServicoId: z.string().cuid(),
  servicoId: z.string().cuid(),
  nota: z
    .number()
    .min(1, 'Nota mínima: 1')
    .max(5, 'Nota máxima: 5'),
  comentario: z.string().max(2000).optional(),
  aspectosPositivos: z.array(z.string().max(200)).default([]),
  aspectosNegativos: z.array(z.string().max(200)).default([]),
  recomendaria: z.boolean(),
});

export type CreateAvaliacaoServicoInput = z.infer<typeof CreateAvaliacaoServicoSchema>;

// =====================================================================
// CONTRATO DE SERVIÇO
// =====================================================================

export const CreateContratoServicoSchema = z
  .object({
    codigo: z.string().min(1, 'Código obrigatório').max(50),
    clienteId: z.string().min(1, 'ID de cliente obrigatório'),
    clienteNome: z.string().min(2).max(150),
    servicosIds: z.array(z.string().cuid()).min(1, 'Pelo menos um serviço'),
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date(),
    renovacaoAutomatica: z.boolean().default(false),
    periodicidade: PeriodicidadeContratoEnum.default('MENSAL'),
    valorMensal: positivoDecimal,
    observacoes: z.string().max(2000).optional(),
  })
  .refine((d) => d.dataFim > d.dataInicio, {
    message: 'Data de fim deve ser posterior à data de início',
  });

export type CreateContratoServicoInput = z.infer<typeof CreateContratoServicoSchema>;

export const UpdateContratoServicoSchema = z.object({
  dataFim: z.coerce.date().optional(),
  renovacaoAutomatica: z.boolean().optional(),
  periodicidade: PeriodicidadeContratoEnum.optional(),
  valorMensal: positivoDecimal.optional(),
  observacoes: z.string().max(2000).optional(),
  status: StatusContratoServicoEnum.optional(),
});

export const FilterContratoServicoSchema = z.object({
  status: StatusContratoServicoEnum.optional(),
  clienteId: z.string().optional(),
  expirandoEm: z.number().int().positive().optional(), // dias
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['dataFim', 'valorMensal', 'createdAt']).default('dataFim'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});
