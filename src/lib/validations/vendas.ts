/**
 * Zod schemas — WS C Comercial (Vendas, POS, Comissões)
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 *
 * DECISÃO PROVISÓRIA #7: Venda unificada — POS, Encomenda e Ecommerce.
 * Ver docs/handoff/ws-c-comercial.md.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (espelham os enums Prisma em SCREAMING_SNAKE)
// ---------------------------------------------------------------------------

export const OrigemVendaEnum = z.enum(['POS', 'ENCOMENDA', 'ECOMMERCE', 'MANUAL']);

export const StatusVendaEnum = z.enum([
  'RASCUNHO',
  'PENDENTE',
  'CONFIRMADA',
  'EM_PREPARACAO',
  'FATURADA',
  'CONCLUIDA',
  'CANCELADA',
  'DEVOLVIDA',
]);

export const MetodoPagamentoTipoEnum = z.enum([
  'DINHEIRO',
  'CARTAO',
  'TRANSFERENCIA',
  'MPESA',
  'EMOLA',
  'CREDITO',
]);

export const StatusSessaoPOSEnum = z.enum(['ABERTA', 'FECHADA', 'SUSPENSA']);

export const TipoRegraComissaoEnum = z.enum([
  'FIXA',
  'ESCALONADA',
  'POR_CATEGORIA',
  'POR_META',
  'POR_PERIODO',
]);

export const StatusComissaoEnum = z.enum(['PENDENTE', 'APROVADA', 'PAGA', 'CANCELADA']);

// ---------------------------------------------------------------------------
// Item de Venda
// ---------------------------------------------------------------------------

export const CreateItemVendaSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteId: z.string().cuid('ID de variante inválido').optional(),
  nomeProduto: z.string().min(1, 'Nome do produto obrigatório').max(200),
  sku: z.string().max(100).optional(),
  quantidade: z
    .number({ required_error: 'Quantidade obrigatória' })
    .positive('Quantidade deve ser positiva'),
  precoUnitario: z
    .number({ required_error: 'Preço unitário obrigatório' })
    .nonnegative('Preço não pode ser negativo'),
  desconto: z
    .number()
    .min(0, 'Desconto não pode ser negativo')
    .max(100, 'Desconto não pode exceder 100%')
    .default(0),
  taxaIva: z
    .number()
    .min(0, 'Taxa de IVA inválida')
    .max(1, 'Taxa de IVA deve estar entre 0 e 1')
    .default(0.16),
});

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

export const CreatePagamentoVendaSchema = z.object({
  tipo: MetodoPagamentoTipoEnum,
  valor: z.number({ required_error: 'Valor do pagamento obrigatório' }).positive('Valor deve ser positivo'),
  referencia: z.string().max(100).optional(),
  troco: z.number().nonnegative('Troco não pode ser negativo').optional(),
});

// ---------------------------------------------------------------------------
// Sessão POS
// ---------------------------------------------------------------------------

export const AbrirSessaoPOSSchema = z.object({
  sessaoCaixaId: z.string().cuid('ID de sessão de caixa inválido'),
  // lojaId removido (ADR-0003 A7 — multi-loja adiado; WS G não modela Loja)
});

export const FecharSessaoPOSSchema = z.object({
  sessaoPOSId: z.string().cuid('ID de sessão POS inválido'),
});

// ---------------------------------------------------------------------------
// Venda (DECISÃO PROVISÓRIA #7: unificada)
// ---------------------------------------------------------------------------

export const CreateVendaSchema = z
  .object({
    origem: OrigemVendaEnum.default('POS'),
    clienteId: z.string().cuid('ID de cliente inválido').optional(),
    vendedorId: z.string().cuid('ID de vendedor inválido'),
    sessaoPOSId: z.string().cuid('ID de sessão POS inválido').optional(),
    sessaoCaixaId: z.string().cuid('ID de sessão de caixa inválido').optional(),
    // ADR-0003 A10: localização de origem (serviço resolve default por tenant na Wave 2)
    localizacaoOrigemId: z.string().cuid('ID de localização inválido').optional(),
    // ADR-0003 A10 / decisão #7: campos de encomenda (origem=ENCOMENDA)
    dataEntregaPrevista: z.coerce.date().optional(),
    enderecoEntregaId: z.string().cuid('ID de endereço de entrega inválido').optional(),
    observacoes: z.string().max(1000).optional(),
    itens: z
      .array(CreateItemVendaSchema)
      .min(1, 'A venda deve ter pelo menos um item'),
    pagamentos: z
      .array(CreatePagamentoVendaSchema)
      .min(1, 'A venda deve ter pelo menos um pagamento'),
    dataVenda: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      // POS exige sessão de POS e de caixa vinculadas
      if (data.origem === 'POS') {
        return Boolean(data.sessaoPOSId && data.sessaoCaixaId);
      }
      return true;
    },
    {
      message: 'Venda POS requer sessaoPOSId e sessaoCaixaId',
      path: ['sessaoPOSId'],
    },
  );

export const UpdateVendaSchema = z.object({
  clienteId: z.string().cuid().optional().nullable(),
  observacoes: z.string().max(1000).optional().nullable(),
});

export const TransitarVendaSchema = z.object({
  vendaId: z.string().cuid('ID de venda inválido'),
  paraStatus: StatusVendaEnum,
  motivo: z.string().max(500).optional(),
});

export const FilterVendaSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  /** Busca por número de venda ou nome do cliente */
  q: z.string().max(200).optional(),
  origem: OrigemVendaEnum.optional(),
  status: StatusVendaEnum.optional(),
  clienteId: z.string().cuid().optional(),
  vendedorId: z.string().cuid().optional(),
  sessaoPOSId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  orderBy: z.enum(['dataVenda', 'total', 'createdAt']).default('dataVenda'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ---------------------------------------------------------------------------
// Regra de Comissão
// ---------------------------------------------------------------------------

export const CreateRegraComissaoSchema = z
  .object({
    nome: z.string().min(2, 'Nome obrigatório').max(100),
    tipo: TipoRegraComissaoEnum,
    vendedorId: z.string().cuid('ID de vendedor inválido').optional(),
    categoriaId: z.string().cuid('ID de categoria inválido').optional(),
    percentualBase: z
      .number()
      .min(0, 'Percentual não pode ser negativo')
      .max(100, 'Percentual não pode exceder 100'),
    percentualBonus: z
      .number()
      .min(0)
      .max(100)
      .optional(),
    valorMinimo: z.number().nonnegative().optional(),
    valorMaximo: z.number().nonnegative().optional(),
    quantidadeMinima: z.number().nonnegative().optional(),
    metaPercentual: z.number().min(0).max(100).optional(),
    dataInicio: z.coerce.date().optional(),
    dataFim: z.coerce.date().optional(),
    prioridade: z.number().int().min(1).max(99).default(1),
    descricao: z.string().max(500),
    ativa: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.valorMinimo !== undefined && data.valorMaximo !== undefined) {
        return data.valorMinimo <= data.valorMaximo;
      }
      return true;
    },
    {
      message: 'Valor mínimo deve ser menor ou igual ao valor máximo',
      path: ['valorMaximo'],
    },
  )
  .refine(
    (data) => {
      if (data.dataInicio && data.dataFim) {
        return data.dataInicio <= data.dataFim;
      }
      return true;
    },
    {
      message: 'Data de início deve ser anterior à data de fim',
      path: ['dataFim'],
    },
  );

export const UpdateRegraComissaoSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  percentualBase: z.number().min(0).max(100).optional(),
  percentualBonus: z.number().min(0).max(100).optional().nullable(),
  valorMinimo: z.number().nonnegative().optional().nullable(),
  valorMaximo: z.number().nonnegative().optional().nullable(),
  quantidadeMinima: z.number().nonnegative().optional().nullable(),
  metaPercentual: z.number().min(0).max(100).optional().nullable(),
  dataInicio: z.coerce.date().optional().nullable(),
  dataFim: z.coerce.date().optional().nullable(),
  prioridade: z.number().int().min(1).max(99).optional(),
  descricao: z.string().max(500).optional(),
  ativa: z.boolean().optional(),
});

export const FilterRegraComissaoSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  tipo: TipoRegraComissaoEnum.optional(),
  vendedorId: z.string().cuid().optional(),
  ativa: z.boolean().optional(),
});

export const FilterComissaoSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  vendedorId: z.string().cuid().optional(),
  status: StatusComissaoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  orderBy: z.enum(['createdAt', 'valorComissao', 'pagoEm']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type CreateVendaInput = z.infer<typeof CreateVendaSchema>;
export type UpdateVendaInput = z.infer<typeof UpdateVendaSchema>;
export type FilterVendaInput = z.infer<typeof FilterVendaSchema>;
export type TransitarVendaInput = z.infer<typeof TransitarVendaSchema>;
export type CreateItemVendaInput = z.infer<typeof CreateItemVendaSchema>;
export type CreatePagamentoVendaInput = z.infer<typeof CreatePagamentoVendaSchema>;
export type AbrirSessaoPOSInput = z.infer<typeof AbrirSessaoPOSSchema>;
export type FecharSessaoPOSInput = z.infer<typeof FecharSessaoPOSSchema>;
export type CreateRegraComissaoInput = z.infer<typeof CreateRegraComissaoSchema>;
export type UpdateRegraComissaoInput = z.infer<typeof UpdateRegraComissaoSchema>;
export type FilterRegraComissaoInput = z.infer<typeof FilterRegraComissaoSchema>;
export type FilterComissaoInput = z.infer<typeof FilterComissaoSchema>;
