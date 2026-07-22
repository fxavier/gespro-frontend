import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const TipoProjetoEnum = z.enum(['INTERNO', 'EXTERNO', 'PESQUISA', 'DESENVOLVIMENTO']);
export const StatusProjetoEnum = z.enum([
  'PLANEAMENTO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO', 'ARQUIVADO',
]);
export const PrioridadeProjetoEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
export const TipoTarefaEnum = z.enum(['TAREFA', 'BUG', 'MELHORIA', 'DOCUMENTACAO', 'TESTE']);
export const StatusTarefaEnum = z.enum([
  'A_FAZER', 'EM_PROGRESSO', 'EM_REVISAO', 'BLOQUEADA', 'CONCLUIDA', 'CANCELADA',
]);
export const PrioridadeTarefaEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
export const StatusEquipaEnum = z.enum(['ATIVA', 'INATIVA']);
export const PapelMembroEquipaEnum = z.enum([
  'GERENTE', 'LIDER', 'DESENVOLVEDOR', 'DESIGNER', 'ANALISTA', 'TESTER', 'OUTRO',
]);
export const StatusMembroEquipaEnum = z.enum(['ATIVO', 'INATIVO', 'FERIAS', 'LICENCA']);
export const TipoTimesheetEnum = z.enum([
  'DESENVOLVIMENTO', 'REUNIAO', 'DOCUMENTACAO', 'TESTE', 'SUPORTE', 'OUTRO',
]);
export const StatusMilestoneEnum = z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO']);
export const StatusOrcamentoEnum = z.enum(['RASCUNHO', 'APROVADO', 'REJEITADO', 'REVISAO']);
export const TipoCategoriaOrcamentoEnum = z.enum([
  'MAO_OBRA', 'MATERIAL', 'EQUIPAMENTO', 'SERVICO', 'OUTRO',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Equipa
// ─────────────────────────────────────────────────────────────────────────────

export const CreateEquipaSchema = z.object({
  nome: z.string().min(1).max(100),
  descricao: z.string().max(500).optional(),
  status: StatusEquipaEnum.default('ATIVA'),
});

export const UpdateEquipaSchema = CreateEquipaSchema.partial();

export const FilterEquipaSchema = z.object({
  search: z.string().optional(),
  status: StatusEquipaEnum.optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export const AddMembroEquipaSchema = z.object({
  equipaId: z.string().cuid(),
  colaboradorId: z.string().cuid(),
  papel: PapelMembroEquipaEnum,
  custoHora: z.number().nonnegative(),
  horasSemanais: z.number().int().min(1).max(80),
  dataEntrada: z.coerce.date(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Projecto
// ─────────────────────────────────────────────────────────────────────────────

const CreateProjetoBaseSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(200),
  descricao: z.string().max(2000).optional(),
  // FK escalar → Cliente no WS C
  clienteId: z.string().cuid().optional(),
  tipo: TipoProjetoEnum,
  prioridade: PrioridadeProjetoEnum.default('MEDIA'),
  dataInicio: z.coerce.date(),
  dataFimPrevista: z.coerce.date(),
  orcamentoPlanejado: z.number().nonnegative().optional(),
  horasEstimadas: z.number().int().positive().optional(),
  // FK escalar → User (cross-WS)
  gerenteId: z.string().cuid().optional(),
  tags: z.array(z.string().max(50)).default([]),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (hex)').optional(),
  observacoes: z.string().max(2000).optional(),
});

export const CreateProjetoSchema = CreateProjetoBaseSchema.refine(
  (d) => d.dataFimPrevista >= d.dataInicio,
  { message: 'Data de fim prevista não pode ser anterior à data de início', path: ['dataFimPrevista'] },
);

export const UpdateProjetoSchema = CreateProjetoBaseSchema.partial().omit({ codigo: true });

export const FilterProjetoSchema = z.object({
  search: z.string().optional(),
  tipo: TipoProjetoEnum.optional(),
  status: StatusProjetoEnum.optional(),
  prioridade: PrioridadeProjetoEnum.optional(),
  clienteId: z.string().cuid().optional(),
  gerenteId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa (kanban com chave fraccional)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateTarefaSchema = z.object({
  projetoId: z.string().cuid(),
  codigo: z.string().min(1).max(20),
  titulo: z.string().min(1).max(200),
  descricao: z.string().max(5000).optional(),
  tipo: TipoTarefaEnum.default('TAREFA'),
  prioridade: PrioridadeTarefaEnum.default('MEDIA'),
  // posicao gerida internamente pelo serviço (chave fraccional)
  dataFimPrevista: z.coerce.date(),
  horasEstimadas: z.number().int().positive().optional(),
  // FK escalar → User (cross-WS)
  responsavelId: z.string().cuid().optional(),
  tarefaPaiId: z.string().cuid().optional(),
  dependencias: z.array(z.string().cuid()).default([]),
  tags: z.array(z.string().max(50)).default([]),
  observacoes: z.string().max(2000).optional(),
});

export const UpdateTarefaSchema = CreateTarefaSchema.partial().omit({ projetoId: true, codigo: true });

/** Reordenação via drag-and-drop: o cliente envia a nova posição fraccional calculada. */
export const ReordenarTarefaSchema = z.object({
  tarefaId: z.string().cuid(),
  novaPosicao: z.string().min(1),
  novoStatus: StatusTarefaEnum.optional(),
});

export const FilterTarefaSchema = z.object({
  projetoId: z.string().cuid().optional(),
  tipo: TipoTarefaEnum.optional(),
  status: StatusTarefaEnum.optional(),
  prioridade: PrioridadeTarefaEnum.optional(),
  responsavelId: z.string().cuid().optional(),
  tarefaPaiId: z.string().cuid().nullish(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Comentário de Tarefa
// ─────────────────────────────────────────────────────────────────────────────

export const CreateComentarioTarefaSchema = z.object({
  tarefaId: z.string().cuid(),
  texto: z.string().min(1).max(5000),
});

export const UpdateComentarioTarefaSchema = z.object({
  texto: z.string().min(1).max(5000),
});

// ─────────────────────────────────────────────────────────────────────────────
// Timesheet
// ─────────────────────────────────────────────────────────────────────────────

export const CreateTimesheetSchema = z.object({
  projetoId: z.string().cuid(),
  tarefaId: z.string().cuid().optional(),
  colaboradorId: z.string().cuid(),
  data: z.coerce.date(),
  horaInicio: z.coerce.date(),
  horaFim: z.coerce.date(),
  descricao: z.string().max(1000).optional(),
  tipo: TipoTimesheetEnum,
  faturavel: z.boolean().default(false),
}).refine(
  (d) => d.horaFim > d.horaInicio,
  { message: 'Hora de fim deve ser posterior à hora de início', path: ['horaFim'] },
);

export const FilterTimesheetSchema = z.object({
  projetoId: z.string().cuid().optional(),
  tarefaId: z.string().cuid().optional(),
  colaboradorId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  faturavel: z.boolean().optional(),
  aprovado: z.boolean().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Marco (Milestone)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateMarcoSchema = z.object({
  projetoId: z.string().cuid(),
  nome: z.string().min(1).max(200),
  descricao: z.string().max(1000).optional(),
  dataPrevista: z.coerce.date(),
});

export const UpdateMarcoSchema = CreateMarcoSchema.partial().omit({ projetoId: true });

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const ItemOrcamentoSchema = z.object({
  descricao: z.string().min(1).max(200),
  quantidade: z.number().positive(),
  valorUnitario: z.number().nonnegative(),
  fornecedor: z.string().max(100).optional(),
  dataCompra: z.coerce.date().optional(),
  observacoes: z.string().max(500).optional(),
});

export const CategoriaOrcamentoSchema = z.object({
  nome: z.string().min(1).max(100),
  tipo: TipoCategoriaOrcamentoEnum,
  valorPlanejado: z.number().nonnegative(),
  itens: z.array(ItemOrcamentoSchema).default([]),
});

export const CreateOrcamentoProjetoSchema = z.object({
  projetoId: z.string().cuid(),
  categorias: z.array(CategoriaOrcamentoSchema).min(1),
  observacoes: z.string().max(1000).optional(),
});

export const FilterOrcamentoSchema = z.object({
  projetoId: z.string().cuid().optional(),
  status: StatusOrcamentoEnum.optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 11 — Riscos, Qualidade, Comunicações, Configuração de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const ProbabilidadeRiscoEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA']);
export const ImpactoRiscoEnum = z.enum(['BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO']);
export const EstrategiaRiscoEnum = z.enum(['EVITAR', 'MITIGAR', 'TRANSFERIR', 'ACEITAR']);
export const StatusRiscoEnum = z.enum(['IDENTIFICADO', 'EM_MITIGACAO', 'FECHADO', 'MATERIALIZADO']);
export const TipoQualidadeEnum = z.enum(['NAO_CONFORMIDADE', 'INSPECAO', 'AUDITORIA', 'REVISAO']);
export const StatusQualidadeEnum = z.enum(['ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'FECHADA']);
export const TipoComunicacaoEnum = z.enum(['REUNIAO', 'ATA', 'DECISAO', 'ANUNCIO', 'RELATORIO']);

// Risco
export const CreateRiscoSchema = z.object({
  projetoId: z.string().cuid(),
  titulo: z.string().min(1).max(200),
  descricao: z.string().max(2000).optional(),
  probabilidade: ProbabilidadeRiscoEnum,
  impacto: ImpactoRiscoEnum,
  // severidade: derivada no serviço — nunca aceite do cliente
  estrategiaResposta: EstrategiaRiscoEnum,
  responsavelId: z.string().cuid().optional(),
  planoMitigacao: z.string().max(5000).optional(),
});

export const UpdateRiscoSchema = CreateRiscoSchema.partial().omit({ projetoId: true });

export const FilterRiscoSchema = z.object({
  projetoId: z.string().cuid().optional(),
  status: StatusRiscoEnum.optional(),
  probabilidade: ProbabilidadeRiscoEnum.optional(),
  impacto: ImpactoRiscoEnum.optional(),
  search: z.string().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export const TransitarRiscoSchema = z.object({
  id: z.string().cuid(),
  novoStatus: StatusRiscoEnum,
});

// Qualidade
export const CreateQualidadeSchema = z.object({
  projetoId: z.string().cuid(),
  tarefaId: z.string().cuid().optional(),
  marcoId: z.string().cuid().optional(),
  tipo: TipoQualidadeEnum,
  descricao: z.string().min(1).max(5000),
  acaoCorretiva: z.string().max(5000).optional(),
  responsavelId: z.string().cuid().optional(),
});

export const UpdateQualidadeSchema = CreateQualidadeSchema.partial().omit({ projetoId: true });

export const FilterQualidadeSchema = z.object({
  projetoId: z.string().cuid().optional(),
  status: StatusQualidadeEnum.optional(),
  tipo: TipoQualidadeEnum.optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export const TransitarQualidadeSchema = z.object({
  id: z.string().cuid(),
  novoStatus: StatusQualidadeEnum,
});

// Comunicação
export const CreateComunicacaoSchema = z.object({
  projetoId: z.string().cuid(),
  tipo: TipoComunicacaoEnum,
  data: z.coerce.date(),
  participantes: z.array(z.string().max(200)).min(1),
  resumo: z.string().min(1).max(10000),
});

export const FilterComunicacaoSchema = z.object({
  projetoId: z.string().cuid().optional(),
  tipo: TipoComunicacaoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// Configuração de Projecto
export const UpdateConfiguracaoProjetoSchema = z.object({
  projetoId: z.string().cuid(),
  politicaAprovacaoTimesheet: z.enum(['MANUAL', 'AUTOMATICA']).default('MANUAL'),
  tiposTarefaAtivos: z.array(TipoTarefaEnum).default(['TAREFA', 'BUG', 'MELHORIA', 'DOCUMENTACAO', 'TESTE']),
  papeisEquipaAtivos: z.array(PapelMembroEquipaEnum).default(['GERENTE', 'LIDER', 'DESENVOLVEDOR', 'DESIGNER', 'ANALISTA', 'TESTER', 'OUTRO']),
  observacoes: z.string().max(2000).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────

export type CreateEquipaInput = z.infer<typeof CreateEquipaSchema>;
export type UpdateEquipaInput = z.infer<typeof UpdateEquipaSchema>;
export type AddMembroEquipaInput = z.infer<typeof AddMembroEquipaSchema>;
export type FilterEquipaInput = z.infer<typeof FilterEquipaSchema>;
export type CreateProjetoInput = z.infer<typeof CreateProjetoSchema>;
export type UpdateProjetoInput = z.infer<typeof UpdateProjetoSchema>;
export type FilterProjetoInput = z.infer<typeof FilterProjetoSchema>;
export type CreateTarefaInput = z.infer<typeof CreateTarefaSchema>;
export type UpdateTarefaInput = z.infer<typeof UpdateTarefaSchema>;
export type ReordenarTarefaInput = z.infer<typeof ReordenarTarefaSchema>;
export type FilterTarefaInput = z.infer<typeof FilterTarefaSchema>;
export type CreateTimesheetInput = z.infer<typeof CreateTimesheetSchema>;
export type FilterTimesheetInput = z.infer<typeof FilterTimesheetSchema>;
export type CreateMarcoInput = z.infer<typeof CreateMarcoSchema>;
export type CreateOrcamentoProjetoInput = z.infer<typeof CreateOrcamentoProjetoSchema>;
export type CreateRiscoInput = z.infer<typeof CreateRiscoSchema>;
export type UpdateRiscoInput = z.infer<typeof UpdateRiscoSchema>;
export type FilterRiscoInput = z.infer<typeof FilterRiscoSchema>;
export type CreateQualidadeInput = z.infer<typeof CreateQualidadeSchema>;
export type UpdateQualidadeInput = z.infer<typeof UpdateQualidadeSchema>;
export type FilterQualidadeInput = z.infer<typeof FilterQualidadeSchema>;
export type CreateComunicacaoInput = z.infer<typeof CreateComunicacaoSchema>;
export type FilterComunicacaoInput = z.infer<typeof FilterComunicacaoSchema>;
export type UpdateConfiguracaoProjetoInput = z.infer<typeof UpdateConfiguracaoProjetoSchema>;
