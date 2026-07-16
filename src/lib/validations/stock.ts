// Validações Zod — Stock & Movimentos (WS A)
// Partilhado cliente/servidor.

import { z } from 'zod';

// ─── Localização ──────────────────────────────────────────────────────────────

export const TipoLocalizacaoEnum = z.enum([
  'ARMAZEM',
  'ESCRITORIO',
  'DEPARTAMENTO',
  'FILIAL',
  'PRATELEIRA',
  'SALA',
  'ANDAR',
  'AREA_TECNICA',
]);

export const LocalizacaoCreateSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(100),
  tipo: TipoLocalizacaoEnum,
  endereco: z.string().max(300).optional(),
  descricao: z.string().max(500).optional(),
  capacidade: z.coerce.number().positive().optional(),
  responsavelId: z.string().cuid().optional(),
  ativa: z.boolean().default(true),
  localizacaoPaiId: z.string().cuid().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const LocalizacaoUpdateSchema = LocalizacaoCreateSchema.partial().omit({
  codigo: true,
});

export const LocalizacaoFilterSchema = z.object({
  search: z.string().optional(),
  tipo: TipoLocalizacaoEnum.optional(),
  ativa: z.boolean().optional(),
  localizacaoPaiId: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type LocalizacaoCreate = z.infer<typeof LocalizacaoCreateSchema>;
export type LocalizacaoUpdate = z.infer<typeof LocalizacaoUpdateSchema>;
export type LocalizacaoFilter = z.infer<typeof LocalizacaoFilterSchema>;

// ─── Contrato: Entrada de Stock ───────────────────────────────────────────────

export const EntradaStockSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteProdutoId: z.string().cuid().optional(),
  localizacaoDestinoId: z.string().cuid('ID de localização inválido'),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva'),
  documentoReferenciaId: z.string().optional(),
  documentoReferenciaTipo: z
    .enum([
      'RecebimentoCompra',
      'AjusteInventario',
      'DevolucaoVenda',
      'ProducaoOutput',
      'Manual',
    ])
    .optional(),
  motivo: z.string().max(500).optional(),
  observacoes: z.string().max(2000).optional(),
});

export type EntradaStockInput = z.infer<typeof EntradaStockSchema>;

// ─── Contrato: Baixa de Stock ─────────────────────────────────────────────────

export const BaixaStockSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteProdutoId: z.string().cuid().optional(),
  localizacaoOrigemId: z.string().cuid('ID de localização inválido'),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva'),
  documentoReferenciaId: z.string().optional(),
  documentoReferenciaTipo: z
    .enum(['Venda', 'OrdemProducao', 'Perda', 'AjusteInventario', 'Manual'])
    .optional(),
  motivo: z.string().max(500).optional(),
  observacoes: z.string().max(2000).optional(),
});

export type BaixaStockInput = z.infer<typeof BaixaStockSchema>;

// ─── Contrato: Reserva de Stock ───────────────────────────────────────────────

export const ReservaStockSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteProdutoId: z.string().cuid().optional(),
  localizacaoId: z.string().cuid('ID de localização inválido'),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva'),
  documentoReferenciaId: z.string().optional(),
  documentoReferenciaTipo: z
    .enum(['Venda', 'PedidoCompra', 'OrdemProducao'])
    .optional(),
  expiradoEm: z.coerce.date().optional(),
});

export type ReservaStockInput = z.infer<typeof ReservaStockSchema>;

// ─── Transferência de Stock ───────────────────────────────────────────────────

export const TransferenciaStockSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteProdutoId: z.string().cuid().optional(),
  localizacaoOrigemId: z.string().cuid('ID de localização de origem inválido'),
  localizacaoDestinoId: z.string().cuid('ID de localização de destino inválido'),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva'),
  motivo: z.string().min(1, 'Motivo é obrigatório').max(500),
  observacoes: z.string().max(2000).optional(),
}).refine(
  (v) => v.localizacaoOrigemId !== v.localizacaoDestinoId,
  'Localização de origem e destino não podem ser iguais',
);

export type TransferenciaStockInput = z.infer<typeof TransferenciaStockSchema>;

// ─── Filtros de Movimentos ────────────────────────────────────────────────────

export const MovimentoStockFilterSchema = z.object({
  produtoId: z.string().optional(),
  localizacaoId: z.string().optional(),
  tipo: z
    .enum([
      'ENTRADA',
      'SAIDA',
      'AJUSTE',
      'TRANSFERENCIA_ENTRADA',
      'TRANSFERENCIA_SAIDA',
    ])
    .optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type MovimentoStockFilter = z.infer<typeof MovimentoStockFilterSchema>;

// ─── Filtros de Saldo ─────────────────────────────────────────────────────────

export const SaldoStockFilterSchema = z.object({
  produtoId: z.string().optional(),
  localizacaoId: z.string().optional(),
  stockBaixo: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type SaldoStockFilter = z.infer<typeof SaldoStockFilterSchema>;
