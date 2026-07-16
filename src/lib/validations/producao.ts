import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const TipoCentroTrabalhoEnum = z.enum(['MAQUINA', 'PESSOA', 'CELULA', 'LINHA']);
export const StatusBOMEnum = z.enum(['RASCUNHO', 'ATIVO', 'INATIVO', 'SUBSTITUIDO']);
export const CategoriaBOMEnum = z.enum([
  'MATERIA_PRIMA', 'COMPONENTE', 'SUBCONJUNTO', 'PRODUTO_ACABADO',
]);
export const ComplexidadeBOMEnum = z.enum(['BAIXO', 'MEDIO', 'ALTO']);
export const StatusRoteiroEnum = z.enum([
  'RASCUNHO', 'ATIVO', 'INATIVO', 'SUBSTITUIDO', 'EM_REVISAO',
]);
export const StatusOperacaoRoteiroEnum = z.enum(['ATIVO', 'INATIVO', 'EM_REVISAO']);
export const StatusOrdemProducaoEnum = z.enum([
  'PLANEADA', 'LIBERADA', 'EM_PRODUCAO', 'CONCLUIDA', 'CANCELADA', 'PAUSADA',
]);
export const PrioridadeOrdemProducaoEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);
export const StatusOperacaoOrdemEnum = z.enum([
  'PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'PAUSADA', 'CANCELADA',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Centro de Trabalho
// ─────────────────────────────────────────────────────────────────────────────

export const CreateCentroTrabalhoSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(100),
  tipo: TipoCentroTrabalhoEnum,
  descricao: z.string().max(500).optional(),
  capacidadeHorasDia: z.number().positive().optional(),
  custoHora: z.number().nonnegative(),
  ativo: z.boolean().default(true),
});

export const UpdateCentroTrabalhoSchema = CreateCentroTrabalhoSchema.partial();

export const FilterCentroTrabalhoSchema = z.object({
  search: z.string().optional(),
  tipo: TipoCentroTrabalhoEnum.optional(),
  ativo: z.boolean().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura de Produto (BOM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Componente BOM. Recursivo — validar ausência de ciclos no serviço.
 * componenteProdutoId é FK escalar → Produto no WS A.
 */
export const CreateComponenteBOMSchema = z.object({
  // FK escalar → Produto no WS A
  componenteProdutoId: z.string().cuid(),
  codigoComponente: z.string().min(1).max(50),
  nomeComponente: z.string().min(1).max(200),
  categoria: CategoriaBOMEnum,
  quantidade: z.number().positive(),
  unidadeMedida: z.string().min(1).max(20),
  custoUnitario: z.number().nonnegative(),
  perdaPrevista: z.number().min(0).max(1).default(0),
  tempoLead: z.number().int().nonnegative().optional(),
  // FK escalar → Fornecedor no WS B
  fornecedorPrincipalId: z.string().cuid().optional(),
  componentePaiId: z.string().cuid().optional(),
  ativo: z.boolean().default(true),
  observacoes: z.string().max(500).optional(),
});

export const CreateEstruturaProdutoSchema = z.object({
  // FK escalar → Produto no WS A
  produtoId: z.string().cuid(),
  codigo: z.string().min(1).max(30),
  nome: z.string().min(1).max(200),
  versao: z.string().min(1).max(20),
  status: StatusBOMEnum.default('RASCUNHO'),
  categoria: z.string().max(100).optional(),
  unidadeProducao: z.string().min(1).max(20),
  tempoProducao: z.number().int().positive().optional(),
  nivelComplexidade: ComplexidadeBOMEnum.optional(),
  // FK escalar → User (cross-WS)
  responsavelId: z.string().cuid().optional(),
  observacoes: z.string().max(1000).optional(),
  componentes: z.array(CreateComponenteBOMSchema).default([]),
});

export const UpdateEstruturaProdutoSchema = CreateEstruturaProdutoSchema.partial().omit({
  produtoId: true,
  codigo: true,
});

export const FilterEstruturaProdutoSchema = z.object({
  search: z.string().optional(),
  produtoId: z.string().cuid().optional(),
  status: StatusBOMEnum.optional(),
  nivelComplexidade: ComplexidadeBOMEnum.optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Roteiro de Produção
// ─────────────────────────────────────────────────────────────────────────────

export const CreateOperacaoRoteiroSchema = z.object({
  sequencia: z.number().int().positive(),
  nome: z.string().min(1).max(200),
  descricao: z.string().max(1000).optional(),
  centroTrabalhoId: z.string().cuid().optional(),
  maquina: z.string().max(100).optional(),
  tempoPreparacao: z.number().int().nonnegative(),
  tempoOperacao: z.number().int().positive(),
  tempoLimpeza: z.number().int().nonnegative(),
  custoHora: z.number().nonnegative(),
  eficienciaEsperada: z.number().min(0).max(1),
  dependencias: z.array(z.string().cuid()).default([]),
  paralela: z.boolean().default(false),
  obrigatoria: z.boolean().default(true),
  instrucoes: z.string().max(2000).optional(),
  ferramentasNecessarias: z.array(z.string().max(100)).default([]),
  qualificacoesRequeridas: z.array(z.string().max(100)).default([]),
  status: StatusOperacaoRoteiroEnum.default('ATIVO'),
});

export const CreateRoteiroSchema = z.object({
  codigo: z.string().min(1).max(30),
  nome: z.string().min(1).max(200),
  estruturaProdutoId: z.string().cuid().optional(),
  versao: z.string().min(1).max(20),
  status: StatusRoteiroEnum.default('RASCUNHO'),
  categoria: z.string().max(100).optional(),
  // FK escalar → User (cross-WS)
  responsavelId: z.string().cuid().optional(),
  observacoes: z.string().max(1000).optional(),
  operacoes: z.array(CreateOperacaoRoteiroSchema).default([]),
});

export const UpdateRoteiroSchema = CreateRoteiroSchema.partial().omit({ codigo: true });

export const FilterRoteiroSchema = z.object({
  search: z.string().optional(),
  status: StatusRoteiroEnum.optional(),
  estruturaProdutoId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Ordem de Produção
// ─────────────────────────────────────────────────────────────────────────────

const CreateOrdemProducaoBaseSchema = z.object({
  // FK escalar → Produto no WS A
  produtoId: z.string().cuid(),
  codigoProduto: z.string().min(1).max(50),
  nomeProduto: z.string().min(1).max(200),
  quantidade: z.number().positive(),
  unidadeMedida: z.string().min(1).max(20),
  prioridade: PrioridadeOrdemProducaoEnum.default('MEDIA'),
  roteiroId: z.string().cuid().optional(),
  lote: z.string().max(50).optional(),
  numeroSerie: z.string().max(50).optional(),
  // Conflito #15: operador é Colaborador
  responsavelId: z.string().cuid().optional(),
  dataPrevisaoInicio: z.coerce.date(),
  dataPrevisaoFim: z.coerce.date(),
  custoEstimado: z.number().nonnegative().default(0),
  // FKs escalares cross-WS
  pedidoVendaId: z.string().cuid().optional(),
  clienteId: z.string().cuid().optional(),
  observacoes: z.string().max(2000).optional(),
});

export const CreateOrdemProducaoSchema = CreateOrdemProducaoBaseSchema.refine(
  (d) => d.dataPrevisaoFim >= d.dataPrevisaoInicio,
  { message: 'Data de fim não pode ser anterior ao início previsto', path: ['dataPrevisaoFim'] },
);

export const UpdateOrdemProducaoSchema = CreateOrdemProducaoBaseSchema.partial().omit({
  produtoId: true,
  codigoProduto: true,
});

export const FilterOrdemProducaoSchema = z.object({
  search: z.string().optional(),
  status: StatusOrdemProducaoEnum.optional(),
  prioridade: PrioridadeOrdemProducaoEnum.optional(),
  produtoId: z.string().cuid().optional(),
  roteiroId: z.string().cuid().optional(),
  responsavelId: z.string().cuid().optional(),
  clienteId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Consumo de Produção (append-only)
// ─────────────────────────────────────────────────────────────────────────────

export const RegistarConsumoSchema = z.object({
  ordemProducaoId: z.string().cuid(),
  // FK escalar → Produto no WS A
  produtoId: z.string().cuid(),
  codigoProduto: z.string().min(1).max(50),
  nomeProduto: z.string().min(1).max(200),
  quantidadePrevista: z.number().positive(),
  quantidadeReal: z.number().positive(),
  unidadeMedida: z.string().min(1).max(20),
  custoUnitario: z.number().nonnegative(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Explosão de BOM (input para o serviço de explosão)
// ─────────────────────────────────────────────────────────────────────────────

export const ExplodirBOMSchema = z.object({
  estruturaProdutoId: z.string().cuid(),
  quantidade: z.number().positive(),
  // Se true, expande recursivamente todos os subconjuntos até ao nível mais baixo
  explosaoTotal: z.boolean().default(false),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────

export type CreateCentroTrabalhoInput = z.infer<typeof CreateCentroTrabalhoSchema>;
export type UpdateCentroTrabalhoInput = z.infer<typeof UpdateCentroTrabalhoSchema>;
export type CreateEstruturaProdutoInput = z.infer<typeof CreateEstruturaProdutoSchema>;
export type UpdateEstruturaProdutoInput = z.infer<typeof UpdateEstruturaProdutoSchema>;
export type FilterEstruturaProdutoInput = z.infer<typeof FilterEstruturaProdutoSchema>;
export type CreateComponenteBOMInput = z.infer<typeof CreateComponenteBOMSchema>;
export type CreateRoteiroInput = z.infer<typeof CreateRoteiroSchema>;
export type UpdateRoteiroInput = z.infer<typeof UpdateRoteiroSchema>;
export type FilterRoteiroInput = z.infer<typeof FilterRoteiroSchema>;
export type CreateOrdemProducaoInput = z.infer<typeof CreateOrdemProducaoSchema>;
export type UpdateOrdemProducaoInput = z.infer<typeof UpdateOrdemProducaoSchema>;
export type FilterOrdemProducaoInput = z.infer<typeof FilterOrdemProducaoSchema>;
export type RegistarConsumoInput = z.infer<typeof RegistarConsumoSchema>;
export type ExplodirBOMInput = z.infer<typeof ExplodirBOMSchema>;
