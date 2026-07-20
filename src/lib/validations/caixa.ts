import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const StatusSessaoCaixaEnum = z.enum([
  'ABERTA',
  'FECHADA',
  'CANCELADA',
]);

export const TipoMovimentoCaixaEnum = z.enum([
  'ABERTURA',
  'VENDA',
  'RECEBIMENTO',
  'SANGRIA',
  'REFORCO',
  'DEVOLUCAO',
  'FECHAMENTO',
  'AJUSTE',
]);

// ---------------------------------------------------------------------------
// SessaoCaixa
// ---------------------------------------------------------------------------

export const AbrirSessaoCaixaSchema = z.object({
  fundoInicial: z
    .number({ required_error: 'Fundo inicial obrigatório' })
    .nonnegative('Fundo inicial não pode ser negativo')
    .multipleOf(0.01, 'Máximo 2 casas decimais'),
  observacoes: z.string().max(500).optional(),
});

export type AbrirSessaoCaixaInput = z.infer<typeof AbrirSessaoCaixaSchema>;

export const FecharSessaoCaixaSchema = z.object({
  sessaoCaixaId: z.string().cuid('ID de sessão inválido'),
  fundoFinal: z
    .number({ required_error: 'Fundo final obrigatório' })
    .nonnegative('Fundo final não pode ser negativo')
    .multipleOf(0.01, 'Máximo 2 casas decimais'),
  observacoes: z.string().max(500).optional(),
});

export type FecharSessaoCaixaInput = z.infer<typeof FecharSessaoCaixaSchema>;

export const FiltroSessaoCaixaSchema = z.object({
  status: StatusSessaoCaixaEnum.optional(),
  responsavelId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroSessaoCaixaInput = z.infer<typeof FiltroSessaoCaixaSchema>;

// ---------------------------------------------------------------------------
// MovimentoCaixa
// ---------------------------------------------------------------------------

export const RegistarMovimentoCaixaSchema = z.object({
  sessaoCaixaId: z.string().cuid('ID de sessão inválido'),
  tipo: TipoMovimentoCaixaEnum,
  valor: z
    .number({ required_error: 'Valor obrigatório' })
    .positive('Valor deve ser positivo')
    .multipleOf(0.01, 'Máximo 2 casas decimais'),
  descricao: z.string().min(1, 'Descrição obrigatória').max(255),
  documentoOrigemId: z.string().optional(),
  documentoOrigemTipo: z.string().max(50).optional(),
  observacoes: z.string().max(500).optional(),
});

/**
 * Tipo Zod para validação de formulário UI (valor como number).
 * Para o contrato cross-domínio com Decimal seguro, importar
 * RegistarMovimentoCaixaInput de '@/server/services/financas/caixa.interface'.
 */
export type RegistarMovimentoCaixaFormInput = z.infer<typeof RegistarMovimentoCaixaSchema>;

export const SangriaSchema = z.object({
  sessaoCaixaId: z.string().cuid('ID de sessão inválido'),
  valor: z
    .number({ required_error: 'Valor de sangria obrigatório' })
    .positive('Valor deve ser positivo')
    .multipleOf(0.01),
  motivo: z.string().min(1, 'Motivo obrigatório').max(255),
});

export type SangriaInput = z.infer<typeof SangriaSchema>;

export const ReforcoSchema = z.object({
  sessaoCaixaId: z.string().cuid('ID de sessão inválido'),
  valor: z
    .number({ required_error: 'Valor de reforço obrigatório' })
    .positive('Valor deve ser positivo')
    .multipleOf(0.01),
  motivo: z.string().min(1, 'Motivo obrigatório').max(255),
});

export type ReforcoInput = z.infer<typeof ReforcoSchema>;

export const FiltroMovimentoCaixaSchema = z.object({
  sessaoCaixaId: z.string().cuid().optional(),
  tipo: TipoMovimentoCaixaEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroMovimentoCaixaInput = z.infer<typeof FiltroMovimentoCaixaSchema>;
