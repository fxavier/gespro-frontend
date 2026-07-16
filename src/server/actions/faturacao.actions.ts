'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  CriarSerieDocumentoSchema,
  EmitirFaturaSchema,
  RegistarPagamentoFaturaSchema,
  FiltroFaturaSchema,
  EmitirNotaCreditoSchema,
  FiltroNotaCreditoSchema,
  EmitirNotaDebitoSchema,
  FiltroNotaDebitoSchema,
  CriarProformaSchema,
  FiltroProformaSchema,
  CriarCotacaoComercialSchema,
  FiltroCotacaoComercialSchema,
} from '@/lib/validations/faturacao';
import * as faturacao from '@/server/services/financas/faturacao.service';
import { z } from 'zod';

// --- Séries ---

export const criarSerieDocumento = createSafeAction({
  schema: CriarSerieDocumentoSchema,
  permission: 'faturacao:series:escrita',
  revalidate: { tags: ['faturacao', 'series'] },
  handler: (input, ctx) => faturacao.criarSerie(input, ctx),
});

export const listarSeriesDocumento = createSafeAction({
  permission: 'faturacao:leitura',
  handler: (_, ctx) => faturacao.listarSeries(ctx),
});

// --- Facturas ---

export const emitirFatura = createSafeAction({
  schema: EmitirFaturaSchema,
  permission: 'faturacao:fatura:emitir',
  revalidate: { tags: ['faturacao', 'faturas'] },
  handler: (input, ctx) => faturacao.emitirFatura(input, ctx),
});

export const listarFaturas = createSafeAction({
  schema: FiltroFaturaSchema,
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.listarFaturas(input, ctx),
});

export const obterFatura = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.obterFatura(input.id, ctx),
});

export const registarPagamentoFatura = createSafeAction({
  schema: RegistarPagamentoFaturaSchema,
  permission: 'faturacao:fatura:pagar',
  revalidate: { tags: ['faturacao', 'faturas'] },
  handler: (input, ctx) => faturacao.registarPagamento(input, ctx),
});

export const marcarFaturaVencida = createSafeAction({
  schema: z.object({ faturaId: z.string().cuid() }),
  permission: 'faturacao:fatura:gerir',
  revalidate: { tags: ['faturacao', 'faturas'] },
  handler: (input, ctx) => faturacao.marcarVencida(input.faturaId, ctx),
});

// --- Notas de crédito ---

export const emitirNotaCredito = createSafeAction({
  schema: EmitirNotaCreditoSchema,
  permission: 'faturacao:nc:emitir',
  revalidate: { tags: ['faturacao', 'notas-credito'] },
  handler: (input, ctx) => faturacao.emitirNotaCredito(input, ctx),
});

export const listarNotasCredito = createSafeAction({
  schema: FiltroNotaCreditoSchema,
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.listarNotasCredito(input, ctx),
});

export const obterNotaCredito = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.obterNotaCredito(input.id, ctx),
});

export const liquidarNotaCredito = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:nc:liquidar',
  revalidate: { tags: ['faturacao', 'notas-credito'] },
  handler: (input, ctx) => faturacao.liquidarNotaCredito(input.id, ctx),
});

export const cancelarNotaCredito = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'faturacao:nc:cancelar',
  revalidate: { tags: ['faturacao', 'notas-credito'] },
  handler: (input, ctx) => faturacao.cancelarNotaCredito(input.id, input.motivo, ctx),
});

// --- Notas de débito ---

export const emitirNotaDebito = createSafeAction({
  schema: EmitirNotaDebitoSchema,
  permission: 'faturacao:nd:emitir',
  revalidate: { tags: ['faturacao', 'notas-debito'] },
  handler: (input, ctx) => faturacao.emitirNotaDebito(input, ctx),
});

export const listarNotasDebito = createSafeAction({
  schema: FiltroNotaDebitoSchema,
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.listarNotasDebito(input, ctx),
});

export const obterNotaDebito = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.obterNotaDebito(input.id, ctx),
});

export const liquidarNotaDebito = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:nd:liquidar',
  revalidate: { tags: ['faturacao', 'notas-debito'] },
  handler: (input, ctx) => faturacao.liquidarNotaDebito(input.id, ctx),
});

export const cancelarNotaDebito = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'faturacao:nd:cancelar',
  revalidate: { tags: ['faturacao', 'notas-debito'] },
  handler: (input, ctx) => faturacao.cancelarNotaDebito(input.id, input.motivo, ctx),
});

// --- Proformas ---

export const criarProforma = createSafeAction({
  schema: CriarProformaSchema,
  permission: 'faturacao:proforma:criar',
  revalidate: { tags: ['faturacao', 'proformas'] },
  handler: (input, ctx) => faturacao.criarProforma(input, ctx),
});

export const enviarProforma = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:proforma:gerir',
  revalidate: { tags: ['faturacao', 'proformas'] },
  handler: (input, ctx) => faturacao.enviarProforma(input.id, ctx),
});

export const aceitarProforma = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:proforma:gerir',
  revalidate: { tags: ['faturacao', 'proformas'] },
  handler: (input, ctx) => faturacao.aceitarProforma(input.id, ctx),
});

export const converterProformaEmFatura = createSafeAction({
  schema: z.object({ id: z.string().cuid(), serieDocumentoId: z.string().cuid() }),
  permission: 'faturacao:proforma:converter',
  revalidate: { tags: ['faturacao', 'proformas', 'faturas'] },
  handler: (input, ctx) => faturacao.converterProformaEmFatura(input.id, input.serieDocumentoId, ctx),
});

export const cancelarProforma = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'faturacao:proforma:cancelar',
  revalidate: { tags: ['faturacao', 'proformas'] },
  handler: (input, ctx) => faturacao.cancelarProforma(input.id, input.motivo, ctx),
});

export const listarProformas = createSafeAction({
  schema: FiltroProformaSchema,
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.listarProformas(input, ctx),
});

// --- Cotações comerciais ---

export const criarCotacaoComercial = createSafeAction({
  schema: CriarCotacaoComercialSchema,
  permission: 'faturacao:cotacao:criar',
  revalidate: { tags: ['faturacao', 'cotacoes'] },
  handler: (input, ctx) => faturacao.criarCotacaoComercial(input, ctx),
});

export const enviarCotacaoComercial = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:cotacao:gerir',
  revalidate: { tags: ['faturacao', 'cotacoes'] },
  handler: (input, ctx) => faturacao.enviarCotacaoComercial(input.id, ctx),
});

export const aceitarCotacaoComercial = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'faturacao:cotacao:gerir',
  revalidate: { tags: ['faturacao', 'cotacoes'] },
  handler: (input, ctx) => faturacao.aceitarCotacaoComercial(input.id, ctx),
});

export const rejeitarCotacaoComercial = createSafeAction({
  schema: z.object({ id: z.string().cuid(), motivo: z.string().min(1).max(500) }),
  permission: 'faturacao:cotacao:gerir',
  revalidate: { tags: ['faturacao', 'cotacoes'] },
  handler: (input, ctx) => faturacao.rejeitarCotacaoComercial(input.id, input.motivo, ctx),
});

export const converterCotacaoEmProforma = createSafeAction({
  schema: z.object({ id: z.string().cuid(), serieProformaId: z.string().cuid() }),
  permission: 'faturacao:cotacao:converter',
  revalidate: { tags: ['faturacao', 'cotacoes', 'proformas'] },
  handler: (input, ctx) => faturacao.converterCotacaoEmProforma(input.id, input.serieProformaId, ctx),
});

export const listarCotacoesComerciais = createSafeAction({
  schema: FiltroCotacaoComercialSchema,
  permission: 'faturacao:leitura',
  handler: (input, ctx) => faturacao.listarCotacoesComerciais(input, ctx),
});
