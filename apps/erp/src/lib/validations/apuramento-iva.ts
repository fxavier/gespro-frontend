/**
 * Validações Zod para o apuramento periódico de IVA (ADR-0034).
 * Partilhado cliente/servidor — sem 'server-only'.
 */
import { z } from 'zod';
import { idEntidade } from './common';

export const ApurarIvaSchema = z.object({
  periodoId: idEntidade('ID do período inválido'),
});
export type ApurarIvaInput = z.infer<typeof ApurarIvaSchema>;

export const EstornarApuramentoSchema = z.object({
  apuramentoId: idEntidade('ID do apuramento inválido'),
  motivo: z.string().min(10, 'Motivo deve ter pelo menos 10 caracteres'),
});
export type EstornarApuramentoInput = z.infer<typeof EstornarApuramentoSchema>;

export const MarcarDeclaradoSchema = z.object({
  apuramentoId: idEntidade('ID do apuramento inválido'),
  declaradoEm: z.coerce.date({ required_error: 'Data de entrega obrigatória' }),
  referenciaEntrega: z
    .string()
    .min(1, 'Referência da entrega obrigatória')
    .max(100, 'Referência demasiado longa'),
});
export type MarcarDeclaradoInput = z.infer<typeof MarcarDeclaradoSchema>;

export const ObterMapaIvaSchema = z.object({
  periodo: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Período deve estar no formato AAAA-MM'),
  tipo: z
    .enum(['declaracao', 'clientes', 'fornecedores', 'antiguidade'])
    .default('declaracao'),
});
export type ObterMapaIvaInput = z.infer<typeof ObterMapaIvaSchema>;
