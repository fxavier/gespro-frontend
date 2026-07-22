import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const TipoBeneficioEnum = z.enum([
  'SEGURO_SAUDE',
  'SEGURO_VIDA',
  'SUBSIDIO_ALIMENTACAO',
  'SUBSIDIO_TRANSPORTE',
  'SUBSIDIO_HABITACAO',
  'SUBSIDIO_COMUNICACOES',
  'PLANO_PENSOES',
  'OUTRO',
]);

export const PeriodicidadeBeneficioEnum = z.enum([
  'MENSAL',
  'TRIMESTRAL',
  'ANUAL',
  'PONTUAL',
]);

export const StatusBeneficioColaboradorEnum = z.enum([
  'ACTIVO',
  'SUSPENSO',
  'TERMINADO',
]);

export type TipoBeneficio = z.infer<typeof TipoBeneficioEnum>;
export type PeriodicidadeBeneficio = z.infer<typeof PeriodicidadeBeneficioEnum>;
export type StatusBeneficioColaborador = z.infer<typeof StatusBeneficioColaboradorEnum>;

// ─────────────────────────────────────────────────────────────────────────────
// Beneficio (catálogo)
// ─────────────────────────────────────────────────────────────────────────────

export const BeneficioSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome não pode exceder 100 caracteres'),
  tipo: TipoBeneficioEnum,
  descricao: z.string().max(500).optional(),
  fornecedor: z.string().max(200).optional(),
  custoTotal: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Custo total deve ser um valor decimal válido')
    .or(z.number().nonnegative()),
  comparticipacaoEmpresa: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Comparticipação empresa deve ser um valor decimal válido')
    .or(z.number().nonnegative())
    .optional()
    .default('0'),
  descontoColaborador: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Desconto colaborador deve ser um valor decimal válido')
    .or(z.number().nonnegative())
    .optional()
    .default('0'),
  periodicidade: PeriodicidadeBeneficioEnum,
  tributavel: z.boolean().default(false),
  ativo: z.boolean().default(true),
  departamentosElegiveis: z.array(z.string()).default([]),
  cargosElegiveis: z.array(z.string()).default([]),
});

export const UpdateBeneficioSchema = BeneficioSchema.partial();

export type CreateBeneficioInput = z.infer<typeof BeneficioSchema>;
export type UpdateBeneficioInput = z.infer<typeof UpdateBeneficioSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Atribuir benefício a colaborador
// ─────────────────────────────────────────────────────────────────────────────

export const AtribuirBeneficioSchema = z.object({
  beneficioId: z.string().cuid('ID de benefício inválido'),
  colaboradorId: z.string().cuid('ID de colaborador inválido'),
  dataInicio: z.coerce.date({ required_error: 'Data de início é obrigatória' }),
  dataFim: z.coerce.date().optional(),
  comparticipacaoEmpresa: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Comparticipação empresa deve ser um valor decimal válido')
    .or(z.number().nonnegative())
    .optional(),
  descontoColaborador: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Desconto colaborador deve ser um valor decimal válido')
    .or(z.number().nonnegative())
    .optional(),
  observacoes: z.string().max(500).optional(),
});

export type AtribuirBeneficioInput = z.infer<typeof AtribuirBeneficioSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Terminar / Suspender atribuição
// ─────────────────────────────────────────────────────────────────────────────

export const TerminarBeneficioSchema = z.object({
  id: z.string().cuid('ID de atribuição inválido'),
  dataFim: z.coerce.date().optional(),
  observacoes: z.string().max(500).optional(),
});

export type TerminarBeneficioInput = z.infer<typeof TerminarBeneficioSchema>;

export const SuspenderBeneficioSchema = z.object({
  id: z.string().cuid('ID de atribuição inválido'),
  observacoes: z.string().max(500).optional(),
});

export type SuspenderBeneficioInput = z.infer<typeof SuspenderBeneficioSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────────────────────

export const FilterBeneficioSchema = z.object({
  search: z.string().optional(),
  tipo: TipoBeneficioEnum.optional(),
  ativo: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.number().int().positive().max(100).default(25),
});

export const FilterAtribuicaoSchema = z.object({
  colaboradorId: z.string().cuid().optional(),
  beneficioId: z.string().cuid().optional(),
  status: StatusBeneficioColaboradorEnum.optional(),
  cursor: z.string().optional(),
  take: z.number().int().positive().max(100).default(25),
});

export type FilterBeneficioInput = z.infer<typeof FilterBeneficioSchema>;
export type FilterAtribuicaoInput = z.infer<typeof FilterAtribuicaoSchema>;
