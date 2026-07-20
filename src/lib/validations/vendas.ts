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
// WS-10: Encomendas, Devoluções, Trocas, Vendedores
// ---------------------------------------------------------------------------

export const StatusEncomendaEnum = z.enum([
  'RASCUNHO',
  'CONFIRMADA',
  'PARCIALMENTE_ENTREGUE',
  'CONCLUIDA',
  'CANCELADA',
]);

export const StatusDevolucaoEnum = z.enum([
  'PENDENTE',
  'APROVADA',
  'PROCESSADA',
  'REJEITADA',
]);

export const MotivoDevolucaoEnum = z.enum([
  'DEFEITO',
  'PRODUTO_ERRADO',
  'INSATISFACAO',
  'EXCESSO_PEDIDO',
  'AVARIA_TRANSPORTE',
  'OUTRO',
]);

export const StatusVendedorEnum = z.enum(['ATIVO', 'INATIVO', 'SUSPENSO']);

// Vendedor
export const CreateVendedorSchema = z.object({
  colaboradorId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  nome: z.string().min(2, 'Nome obrigatório').max(200),
  email: z.string().email('Email inválido').optional(),
  telefone: z.string().max(30).optional(),
  metaMensal: z.number().nonnegative('Meta não pode ser negativa').optional(),
  observacoes: z.string().max(1000).optional(),
});

export const UpdateVendedorSchema = z.object({
  nome: z.string().min(2).max(200).optional(),
  email: z.string().email().optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
  metaMensal: z.number().nonnegative().optional().nullable(),
  status: StatusVendedorEnum.optional(),
  observacoes: z.string().max(1000).optional().nullable(),
});

export const FilterVendedorSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  q: z.string().max(200).optional(),
  status: StatusVendedorEnum.optional(),
  orderBy: z.enum(['nome', 'createdAt']).default('nome'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// Item de Encomenda
export const CreateItemEncomendaSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteId: z.string().cuid().optional(),
  nomeProduto: z.string().min(1).max(200),
  sku: z.string().max(100).optional(),
  quantidade: z.number().positive('Quantidade deve ser positiva'),
  precoUnitario: z.number().nonnegative('Preço não pode ser negativo'),
  desconto: z.number().min(0).max(100).default(0),
  taxaIva: z.number().min(0).max(1).default(0.16),
});

// Encomenda
export const CreateEncomendaSchema = z.object({
  clienteId: z.string().cuid('ID de cliente inválido'),
  vendedorId: z.string().cuid().optional(),
  dataPrevista: z.coerce.date().optional(),
  enderecoEntregaId: z.string().cuid().optional(),
  notas: z.string().max(2000).optional(),
  itens: z.array(CreateItemEncomendaSchema).min(1, 'Encomenda deve ter pelo menos um item'),
});

export const UpdateEncomendaSchema = z.object({
  dataPrevista: z.coerce.date().optional().nullable(),
  enderecoEntregaId: z.string().cuid().optional().nullable(),
  notas: z.string().max(2000).optional().nullable(),
  vendedorId: z.string().cuid().optional().nullable(),
});

export const FilterEncomendaSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  q: z.string().max(200).optional(),
  status: StatusEncomendaEnum.optional(),
  clienteId: z.string().cuid().optional(),
  vendedorId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  orderBy: z.enum(['dataPrevista', 'total', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const TransitarEncomendaSchema = z.object({
  encomendaId: z.string().cuid('ID de encomenda inválido'),
  paraStatus: StatusEncomendaEnum,
  motivo: z.string().max(500).optional(),
  localizacaoId: z.string().cuid().optional(), // para reservarStock ao confirmar
});

export const ConverterEncomendaEmVendaSchema = z.object({
  encomendaId: z.string().cuid('ID de encomenda inválido'),
  sessaoCaixaId: z.string().cuid().optional(),
  /** Localização de stock para baixa directa (fallback se não houver reservas) */
  localizacaoId: z.string().cuid().optional(),
  pagamentos: z
    .array(CreatePagamentoVendaSchema)
    .min(1, 'A venda deve ter pelo menos um pagamento'),
});

// Item de Devolução
export const CreateItemDevolucaoSchema = z.object({
  produtoId: z.string().cuid('ID de produto inválido'),
  varianteId: z.string().cuid().optional(),
  nomeProduto: z.string().min(1).max(200),
  sku: z.string().max(100).optional(),
  quantidade: z.number().positive('Quantidade deve ser positiva'),
  valorUnitario: z.number().nonnegative('Valor não pode ser negativo'),
  taxaIva: z.number().min(0).max(1).default(0.16),
});

// Devolução
export const CreateDevolucaoSchema = z.object({
  clienteId: z.string().cuid('ID de cliente inválido'),
  vendaId: z.string().cuid().optional(),
  faturaId: z.string().cuid().optional(),
  motivo: MotivoDevolucaoEnum,
  reembolso: z.boolean().default(false),
  sessaoCaixaId: z.string().cuid().optional(), // para reembolso em caixa
  observacoes: z.string().max(2000).optional(),
  itens: z.array(CreateItemDevolucaoSchema).min(1, 'Devolução deve ter pelo menos um item'),
  localizacaoId: z.string().cuid().optional(), // destino do stock devolvido
});

export const FilterDevolucaoSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  q: z.string().max(200).optional(),
  status: StatusDevolucaoEnum.optional(),
  motivo: MotivoDevolucaoEnum.optional(),
  clienteId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  orderBy: z.enum(['createdAt', 'valorTotal']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// Troca
export const CreateTrocaSchema = z.object({
  devolucaoId: z.string().cuid('ID de devolução inválido'),
  // Novo item para substituição
  novoItem: CreateItemEncomendaSchema,
  sessaoCaixaId: z.string().cuid().optional(),
  pagamentos: z
    .array(CreatePagamentoVendaSchema)
    .default([]),
  observacoes: z.string().max(2000).optional(),
  localizacaoId: z.string().cuid().optional(),
  /** Série de NC para estornar os bens devolvidos (obrigatório se devolucao tem fatura) */
  serieNotaCreditoId: z.string().cuid().optional(),
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

// WS-10
export type CreateVendedorInput = z.infer<typeof CreateVendedorSchema>;
export type UpdateVendedorInput = z.infer<typeof UpdateVendedorSchema>;
export type FilterVendedorInput = z.infer<typeof FilterVendedorSchema>;
export type CreateItemEncomendaInput = z.infer<typeof CreateItemEncomendaSchema>;
export type CreateEncomendaInput = z.infer<typeof CreateEncomendaSchema>;
export type UpdateEncomendaInput = z.infer<typeof UpdateEncomendaSchema>;
export type FilterEncomendaInput = z.infer<typeof FilterEncomendaSchema>;
export type TransitarEncomendaInput = z.infer<typeof TransitarEncomendaSchema>;
export type ConverterEncomendaEmVendaInput = z.infer<typeof ConverterEncomendaEmVendaSchema>;
export type CreateItemDevolucaoInput = z.infer<typeof CreateItemDevolucaoSchema>;
export type CreateDevolucaoInput = z.infer<typeof CreateDevolucaoSchema>;
export type FilterDevolucaoInput = z.infer<typeof FilterDevolucaoSchema>;
export type CreateTrocaInput = z.infer<typeof CreateTrocaSchema>;
