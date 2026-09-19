'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  ApurarIvaSchema,
  EstornarApuramentoSchema,
  MarcarDeclaradoSchema,
} from '@/lib/validations/apuramento-iva';
import {
  apurarIva,
  estornarApuramentoIva,
  marcarDeclarado,
  obterApuramento,
} from '@/server/services/financas/apuramento-iva.service';

// ---------------------------------------------------------------------------
// Apurar IVA do período (ADR-0034 §2)
// ---------------------------------------------------------------------------

export const apurarIvaAction = createSafeAction({
  schema: ApurarIvaSchema,
  permission: 'financas:iva:apurar',
  revalidate: { tags: ['financas-iva', 'periodos-contabeis'] },
  handler: async (input, ctx) => apurarIva(input, ctx),
});

// ---------------------------------------------------------------------------
// Estornar apuramento (ADR-0034 §7) — só se ainda não declarado
// ---------------------------------------------------------------------------

export const estornarApuramentoAction = createSafeAction({
  schema: EstornarApuramentoSchema,
  permission: 'financas:iva:apurar',
  revalidate: { tags: ['financas-iva', 'periodos-contabeis'] },
  handler: async (input, ctx) => estornarApuramentoIva(input, ctx),
});

// ---------------------------------------------------------------------------
// Marcar apuramento como declarado à AT (ADR-0034 §7)
// ---------------------------------------------------------------------------

export const marcarDeclaradoAction = createSafeAction({
  schema: MarcarDeclaradoSchema,
  permission: 'financas:iva:declarar',
  revalidate: { tags: ['financas-iva', 'periodos-contabeis'] },
  handler: async (input, ctx) => marcarDeclarado(input, ctx),
});

// ---------------------------------------------------------------------------
// Obter apuramento de um período (leitura)
// ---------------------------------------------------------------------------

export const obterApuramentoAction = createSafeAction({
  schema: ApurarIvaSchema, // só precisa do periodoId
  permission: 'financas:iva:mapas',
  permiteEmLeitura: true,
  revalidate: { tags: [] },
  handler: async (input, ctx) => obterApuramento(input.periodoId, ctx),
});
