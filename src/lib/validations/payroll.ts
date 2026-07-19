import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Payroll (Spec 06) — schemas partilhados cliente/servidor
// ─────────────────────────────────────────────────────────────────────────────

export const StatusPayrollEnum = z.enum(['PENDENTE', 'PROCESSADO', 'PAGO', 'CANCELADO']);
export const TipoLinhaPayrollEnum = z.enum(['PROVENTO', 'DESCONTO']);
export const NaturezaLinhaPayrollEnum = z.enum([
  'BASE', 'SUBSIDIO', 'HORAS_EXTRAS', 'COMISSAO', 'BONUS',
  'INSS', 'IRPS', 'FALTA', 'ADIANTAMENTO', 'PENHORA', 'OUTRO',
]);

/** Valor monetário de formulário (2 casas decimais). */
const valorMonetario = z
  .number({ required_error: 'Valor obrigatório' })
  .multipleOf(0.01, 'Máximo 2 casas decimais');

// ---------------------------------------------------------------------------
// Processamento da folha mensal (lote)
// ---------------------------------------------------------------------------

export const ProcessarFolhaSchema = z.object({
  mes: z.coerce.number().int().min(1, 'Mês inválido').max(12, 'Mês inválido'),
  ano: z.coerce.number().int().min(2020, 'Ano inválido').max(2100, 'Ano inválido'),
});
export type ProcessarFolhaInput = z.infer<typeof ProcessarFolhaSchema>;

export const MarcarProcessadaSchema = z.object({
  folhaId: z.string().cuid('ID de folha inválido'),
});
export type MarcarProcessadaInput = z.infer<typeof MarcarProcessadaSchema>;

export const MarcarPagaSchema = z.object({
  folhaId: z.string().cuid('ID de folha inválido'),
  dataPagamento: z.coerce.date().optional(),
  /** sessão de caixa aberta — só quando o pagamento sai do caixa físico */
  sessaoCaixaId: z.string().cuid().optional(),
});
export type MarcarPagaInput = z.infer<typeof MarcarPagaSchema>;

export const CancelarFolhaSchema = z.object({
  folhaId: z.string().cuid('ID de folha inválido'),
  motivo: z.string().min(1, 'Motivo obrigatório').max(500),
});
export type CancelarFolhaInput = z.infer<typeof CancelarFolhaSchema>;

export const RecalcularPayrollSchema = z.object({
  payrollId: z.string().cuid('ID de payroll inválido'),
});
export type RecalcularPayrollInput = z.infer<typeof RecalcularPayrollSchema>;

// Ajuste manual de linha (extensão: adiantamentos, penhoras, bónus, benefícios
// do spec 08). Só permitido com o payroll PENDENTE; força recálculo estatutário.
export const AjusteLinhaSchema = z.object({
  payrollId: z.string().cuid('ID de payroll inválido'),
  tipo: TipoLinhaPayrollEnum,
  natureza: z.enum(['BONUS', 'ADIANTAMENTO', 'PENHORA', 'OUTRO']),
  descricao: z.string().min(1, 'Descrição obrigatória').max(255),
  valor: valorMonetario.positive('Valor deve ser positivo'),
});
export type AjusteLinhaInput = z.infer<typeof AjusteLinhaSchema>;

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export const FilterPayrollSchema = z.object({
  status: StatusPayrollEnum.optional(),
  colaboradorId: z.string().cuid().optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  ano: z.coerce.number().int().min(2020).max(2100).optional(),
  folhaId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});
export type FilterPayrollInput = z.infer<typeof FilterPayrollSchema>;

export const FilterFolhaSchema = z.object({
  status: StatusPayrollEnum.optional(),
  ano: z.coerce.number().int().min(2020).max(2100).optional(),
  cursor: z.string().cuid().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});
export type FilterFolhaInput = z.infer<typeof FilterFolhaSchema>;

// ---------------------------------------------------------------------------
// Tabelas paramétricas (admin) — versionadas por vigência
// ---------------------------------------------------------------------------

/** Taxa em fracção (0.03 = 3%), máx. 6 casas decimais. */
const taxaFraccao = z
  .number()
  .min(0, 'Taxa não pode ser negativa')
  .max(1, 'Taxa em fracção (ex.: 0.03 para 3%)');

export const TabelaINSSSchema = z.object({
  vigenciaInicio: z.coerce.date(),
  taxaTrabalhador: taxaFraccao,
  taxaEntidade: taxaFraccao,
  tetoIncidencia: valorMonetario.positive().optional(),
  descricao: z.string().max(255).optional(),
});
export type TabelaINSSInput = z.infer<typeof TabelaINSSSchema>;

export const EscalaoIRPSSchema = z.object({
  ordem: z.number().int().min(1),
  limiteInferior: valorMonetario.nonnegative(),
  limiteSuperior: valorMonetario.positive().nullable(),
  taxa: taxaFraccao,
  parcelaAbater: valorMonetario.nonnegative(),
  numeroDependentes: z.number().int().min(0).default(0),
});

export const CriarEscaloesIRPSSchema = z
  .object({
    vigenciaInicio: z.coerce.date(),
    descricao: z.string().max(255).optional(),
    escaloes: z.array(EscalaoIRPSSchema).min(1, 'Pelo menos um escalão'),
  })
  .refine(
    (v) => {
      const ordenados = [...v.escaloes].sort((a, b) => a.ordem - b.ordem);
      return ordenados.every((e, i) => {
        if (i === ordenados.length - 1) return e.limiteSuperior === null || e.limiteSuperior > e.limiteInferior;
        return e.limiteSuperior !== null && e.limiteSuperior > e.limiteInferior;
      });
    },
    { message: 'Escalões inválidos: limites não contíguos ou limite superior em falta' },
  );
export type CriarEscaloesIRPSInput = z.infer<typeof CriarEscaloesIRPSSchema>;
