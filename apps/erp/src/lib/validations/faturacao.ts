import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const StatusFaturaEnum = z.enum([
  'RASCUNHO',
  'EMITIDA',
  'PAGA',
  'PARCIALMENTE_PAGA',
  'VENCIDA',
  'CANCELADA',
]);

export const StatusNotaCreditoEnum = z.enum([
  'RASCUNHO',
  'EMITIDA',
  'LIQUIDADA',
  'CANCELADA',
]);

export const StatusNotaDebitoEnum = z.enum([
  'RASCUNHO',
  'EMITIDA',
  'LIQUIDADA',
  'CANCELADA',
]);

export const StatusProformaEnum = z.enum([
  'RASCUNHO',
  'ENVIADA',
  'ACEITE',
  'CONVERTIDA',
  'EXPIRADA',
  'CANCELADA',
]);

export const StatusCotacaoComercialEnum = z.enum([
  'RASCUNHO',
  'ENVIADA',
  'ACEITE',
  'REJEITADA',
  'CONVERTIDA',
  'EXPIRADA',
  'CANCELADA',
]);

export const TipoSerieDocumentoEnum = z.enum([
  'FATURA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'PROFORMA',
  'COTACAO_COMERCIAL',
  'RECIBO',
]);

// ---------------------------------------------------------------------------
// Helpers de linha (partilhado por Fatura, NC, ND, Proforma, Cotacao)
// ---------------------------------------------------------------------------

/** IVA moçambicano: 16% padrão ou 0% isento. */
const taxaIvaValida = (taxa: number) => taxa === 0 || Math.abs(taxa - 0.16) < 0.0001;

export const LinhaDocumentoSchema = z
  .object({
    produtoId: z.string().cuid().optional(),
    descricao: z.string().min(1, 'Descrição obrigatória').max(500),
    quantidade: z
      .number({ required_error: 'Quantidade obrigatória' })
      .positive('Quantidade deve ser positiva'),
    precoUnitario: z
      .number({ required_error: 'Preço unitário obrigatório' })
      .nonnegative('Preço não pode ser negativo')
      .multipleOf(0.01),
    desconto: z.number().nonnegative().multipleOf(0.01).default(0),
    taxaIva: z
      .number()
      .refine(taxaIvaValida, 'Taxa de IVA inválida — use 0.16 (16%) ou 0 (isento)')
      .default(0.16),
    ordemLinha: z.number().int().nonnegative().default(0),
  })
  .transform((l) => {
    const base = l.quantidade * l.precoUnitario - l.desconto;
    const subtotal = Math.round(base * 100) / 100;
    const ivaItem = Math.round(subtotal * l.taxaIva * 100) / 100;
    const total = Math.round((subtotal + ivaItem) * 100) / 100;
    return { ...l, subtotal, ivaItem, total };
  });

export type LinhaDocumentoInput = z.infer<typeof LinhaDocumentoSchema>;

// ---------------------------------------------------------------------------
// SerieDocumento
// ---------------------------------------------------------------------------

export const CriarSerieDocumentoSchema = z.object({
  tipo: TipoSerieDocumentoEnum,
  prefixo: z.string().min(1).max(10).toUpperCase(),
  ano: z.number().int().min(2020).max(2100),
  formatoNumero: z.string().max(100).optional(),
});

export type CriarSerieDocumentoInput = z.infer<typeof CriarSerieDocumentoSchema>;

// ---------------------------------------------------------------------------
// Fatura
// ---------------------------------------------------------------------------

export const EmitirFaturaSchema = z
  .object({
    serieDocumentoId: z.string().cuid('ID de série inválido'),
    clienteId: z.string().min(1, 'Cliente obrigatório'),
    vendaId: z.string().optional(),
    moeda: z.string().length(3).default('MZN'),
    dataEmissao: z.coerce.date(),
    dataVencimento: z.coerce.date(),
    linhas: z.array(LinhaDocumentoSchema).min(1, 'Mínimo 1 linha de factura'),
    observacoes: z.string().max(1000).optional(),
  })
  .refine(
    (d) => d.dataVencimento >= d.dataEmissao,
    { message: 'Data de vencimento não pode ser anterior à data de emissão', path: ['dataVencimento'] },
  );

export type EmitirFaturaInput = z.infer<typeof EmitirFaturaSchema>;

export const RegistarPagamentoFaturaSchema = z.object({
  faturaId: z.string().cuid('ID de factura inválido'),
  valor: z
    .number({ required_error: 'Valor de pagamento obrigatório' })
    .positive('Valor deve ser positivo')
    .multipleOf(0.01),
  dataPagamento: z.coerce.date().default(() => new Date()),
  sessaoCaixaId: z.string().cuid().optional(),
  observacoes: z.string().max(500).optional(),
});

export type RegistarPagamentoFaturaInput = z.infer<typeof RegistarPagamentoFaturaSchema>;

export const FiltroFaturaSchema = z.object({
  clienteId: z.string().optional(),
  status: StatusFaturaEnum.optional(),
  dataEmissaoInicio: z.coerce.date().optional(),
  dataEmissaoFim: z.coerce.date().optional(),
  dataVencimentoInicio: z.coerce.date().optional(),
  dataVencimentoFim: z.coerce.date().optional(),
  search: z.string().max(100).optional(), // número ou nome de cliente
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroFaturaInput = z.infer<typeof FiltroFaturaSchema>;

// ---------------------------------------------------------------------------
// NotaCredito
// ---------------------------------------------------------------------------

export const EmitirNotaCreditoSchema = z.object({
  serieDocumentoId: z.string().cuid('ID de série inválido'),
  faturaOriginalId: z.string().cuid('ID de factura original inválido'),
  motivo: z.string().min(1, 'Motivo obrigatório').max(500),
  moeda: z.string().length(3).default('MZN'),
  dataEmissao: z.coerce.date(),
  linhas: z.array(LinhaDocumentoSchema).min(1, 'Mínimo 1 linha'),
  observacoes: z.string().max(1000).optional(),
});

export type EmitirNotaCreditoInput = z.infer<typeof EmitirNotaCreditoSchema>;

export const FiltroNotaCreditoSchema = z.object({
  faturaOriginalId: z.string().cuid().optional(),
  status: StatusNotaCreditoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroNotaCreditoInput = z.infer<typeof FiltroNotaCreditoSchema>;

// ---------------------------------------------------------------------------
// NotaDebito
// ---------------------------------------------------------------------------

export const EmitirNotaDebitoSchema = z.object({
  serieDocumentoId: z.string().cuid('ID de série inválido'),
  clienteId: z.string().min(1, 'Cliente obrigatório'),
  faturaReferenciaId: z.string().cuid().optional(),
  motivo: z.string().min(1, 'Motivo obrigatório').max(500),
  moeda: z.string().length(3).default('MZN'),
  dataEmissao: z.coerce.date(),
  linhas: z.array(LinhaDocumentoSchema).min(1, 'Mínimo 1 linha'),
  observacoes: z.string().max(1000).optional(),
});

export type EmitirNotaDebitoInput = z.infer<typeof EmitirNotaDebitoSchema>;

export const FiltroNotaDebitoSchema = z.object({
  clienteId: z.string().optional(),
  status: StatusNotaDebitoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroNotaDebitoInput = z.infer<typeof FiltroNotaDebitoSchema>;

// ---------------------------------------------------------------------------
// Proforma
// ---------------------------------------------------------------------------

export const CriarProformaSchema = z
  .object({
    serieDocumentoId: z.string().cuid('ID de série inválido'),
    clienteId: z.string().min(1, 'Cliente obrigatório'),
    moeda: z.string().length(3).default('MZN'),
    dataEmissao: z.coerce.date(),
    dataValidade: z.coerce.date(),
    linhas: z.array(LinhaDocumentoSchema).min(1, 'Mínimo 1 linha'),
    observacoes: z.string().max(1000).optional(),
  })
  .refine(
    (d) => d.dataValidade > d.dataEmissao,
    { message: 'Data de validade deve ser posterior à data de emissão', path: ['dataValidade'] },
  );

export type CriarProformaInput = z.infer<typeof CriarProformaSchema>;

export const FiltroProformaSchema = z.object({
  clienteId: z.string().optional(),
  status: StatusProformaEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroProformaInput = z.infer<typeof FiltroProformaSchema>;

// ---------------------------------------------------------------------------
// CotacaoComercial
// ---------------------------------------------------------------------------

export const CriarCotacaoComercialSchema = z
  .object({
    serieDocumentoId: z.string().cuid('ID de série inválido'),
    clienteId: z.string().min(1, 'Cliente obrigatório'),
    moeda: z.string().length(3).default('MZN'),
    dataEmissao: z.coerce.date(),
    dataValidade: z.coerce.date(),
    linhas: z.array(LinhaDocumentoSchema).min(1, 'Mínimo 1 linha'),
    condicoesComerciais: z.string().max(2000).optional(),
    observacoes: z.string().max(1000).optional(),
  })
  .refine(
    (d) => d.dataValidade > d.dataEmissao,
    { message: 'Data de validade deve ser posterior à data de emissão', path: ['dataValidade'] },
  );

export type CriarCotacaoComercialInput = z.infer<typeof CriarCotacaoComercialSchema>;

export const FiltroCotacaoComercialSchema = z.object({
  clienteId: z.string().optional(),
  status: StatusCotacaoComercialEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type FiltroCotacaoComercialInput = z.infer<typeof FiltroCotacaoComercialSchema>;
