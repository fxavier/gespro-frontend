// Validações Zod — Contagem e Reconciliação de Stock (WS A — Spec 05)
// Partilhado cliente/servidor.

import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const StatusContagemStockEnum = z.enum([
  'RASCUNHO',
  'EM_CONTAGEM',
  'RECONCILIADA',
  'CONCLUIDA',
  'CANCELADA',
]);

export const StatusItemContagemEnum = z.enum([
  'PENDENTE',
  'CONTADO',
  'AJUSTADO',
  'JUSTIFICADO',
]);

export type StatusContagemStock = z.infer<typeof StatusContagemStockEnum>;
export type StatusItemContagem = z.infer<typeof StatusItemContagemEnum>;

// ─── Abertura de contagem ─────────────────────────────────────────────────────

export const AbrirContagemSchema = z.object({
  localizacaoId: z.string().cuid('ID de localização inválido').optional(),
  categoriaId: z.string().cuid('ID de categoria inválido').optional(),
  cega: z.boolean().default(false),
  responsavelId: z.string().cuid('ID de responsável inválido'),
  observacoes: z.string().max(2000).optional(),
});

export type AbrirContagemInput = z.infer<typeof AbrirContagemSchema>;

// ─── Registo de item de contagem ──────────────────────────────────────────────

export const RegistarItemSchema = z.object({
  contagemId: z.string().cuid('ID de contagem inválido'),
  itemId: z.string().cuid('ID de item inválido'),
  quantidadeContada: z
    .string()
    .refine(
      (v) => {
        try {
          const n = parseFloat(v);
          return !isNaN(n) && n >= 0;
        } catch {
          return false;
        }
      },
      'Quantidade tem de ser um número não negativo',
    ),
});

export type RegistarItemInput = z.infer<typeof RegistarItemSchema>;

// ─── Justificação de discrepância ─────────────────────────────────────────────

export const JustificarItemSchema = z.object({
  contagemId: z.string().cuid('ID de contagem inválido'),
  itemId: z.string().cuid('ID de item inválido'),
  justificativa: z.string().min(5, 'Justificativa deve ter pelo menos 5 caracteres').max(2000),
});

export type JustificarItemInput = z.infer<typeof JustificarItemSchema>;

// ─── Reconciliação ────────────────────────────────────────────────────────────

export const ReconciliarSchema = z.object({
  contagemId: z.string().cuid('ID de contagem inválido'),
  aprovadoPorId: z.string().cuid('ID de aprovador inválido').optional(),
  // Limiar: percentagem máxima de discrepância que não exige aprovação (0-100)
  limiarDiscrepanciaPct: z
    .number()
    .min(0)
    .max(100)
    .default(5),
  gerarLancamentoContabilistico: z.boolean().default(false),
  contaExistenciasCodigo: z.string().optional(),   // código PGC da conta de existências (classe 3)
  contaVariacaoCodigo: z.string().optional(),       // código PGC da conta de regularização
});

export type ReconciliarInput = z.infer<typeof ReconciliarSchema>;

// ─── Conclusão / Cancelamento ─────────────────────────────────────────────────

export const ConcluirContagemSchema = z.object({
  contagemId: z.string().cuid('ID de contagem inválido'),
  observacoes: z.string().max(2000).optional(),
});

export type ConcluirContagemInput = z.infer<typeof ConcluirContagemSchema>;

export const CancelarContagemSchema = z.object({
  contagemId: z.string().cuid('ID de contagem inválido'),
  motivo: z.string().min(5, 'Motivo deve ter pelo menos 5 caracteres').max(2000),
});

export type CancelarContagemInput = z.infer<typeof CancelarContagemSchema>;

// ─── Filtros ──────────────────────────────────────────────────────────────────

export const FilterContagemSchema = z.object({
  search: z.string().optional(),
  status: StatusContagemStockEnum.optional(),
  localizacaoId: z.string().optional(),
  responsavelId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type FilterContagem = z.infer<typeof FilterContagemSchema>;
