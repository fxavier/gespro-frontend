/**
 * Zod schemas — Compras (RequisicaoCompra, Cotacao/RFQ, PedidoCompra,
 * RecebimentoCompra, ContaPagar, Pagamento, AprovacaoWorkflow) — WS B
 * Partilhado cliente/servidor. Sem imports de @prisma/client.
 */
import { z } from 'zod';

// ---- Enums ----

export const PrioridadeRequisicaoEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);
export const StatusRequisicaoCompraEnum = z.enum([
  'RASCUNHO',
  'PENDENTE',
  'EM_APROVACAO',
  'APROVADA',
  'REJEITADA',
  'CANCELADA',
  'CONVERTIDA',
]);
export const StatusAprovacaoEnum = z.enum(['PENDENTE', 'APROVADO', 'REJEITADO']);
export const TipoAprovacaoEnum = z.enum(['QUALQUER_UM', 'TODOS', 'MAIORIA']);
export const TipoAprovacaoWorkflowEnum = z.enum(['REQUISICAO_COMPRA', 'PEDIDO_COMPRA']);
export const StatusCotacaoEnum = z.enum([
  'RASCUNHO',
  'ENVIADA',
  'RESPONDIDA',
  'ADJUDICADA',
  'VENCIDA',
  'CANCELADA',
]);
export const StatusCotacaoFornecedorEnum = z.enum(['PENDENTE', 'RESPONDIDA', 'RECUSADA']);
export const StatusPedidoCompraEnum = z.enum([
  'RASCUNHO',
  'ENVIADO',
  'CONFIRMADO',
  'EM_TRANSITO',
  'RECEBIDO_PARCIAL',
  'RECEBIDO_TOTAL',
  'CANCELADO',
]);
export const StatusRecebimentoEnum = z.enum(['COMPLETO', 'PARCIAL', 'COM_DIVERGENCIA']);
export const StatusContaPagarEnum = z.enum([
  'ABERTA',
  'PARCIALMENTE_PAGA',
  'PAGA',
  'CANCELADA',
  'VENCIDA',
]);
export const StatusPagamentoEnum = z.enum([
  'PENDENTE',
  'PROCESSANDO',
  'CONCLUIDO',
  'CANCELADO',
]);

// ---- Sub-schemas reutilizáveis ----

const positivoDecimal = z.number().positive('Valor deve ser positivo');
const naoNegativoDecimal = z.number().min(0, 'Valor não pode ser negativo');

// =====================================================================
// CONFIGURAÇÃO DE WORKFLOW DE APROVAÇÃO
// =====================================================================

export const CreateAprovadorNivelSchema = z.object({
  usuarioId: z.string().min(1, 'ID do utilizador obrigatório'),
  email: z.string().email('Email inválido'),
});

export const CreateNivelAprovacaoSchema = z.object({
  nivel: z.number().int().positive('Nível deve ser positivo'),
  nome: z.string().min(1).max(100),
  valorMinimo: naoNegativoDecimal,
  valorMaximo: positivoDecimal,
  tipoAprovacao: TipoAprovacaoEnum.default('QUALQUER_UM'),
  aprovadores: z.array(CreateAprovadorNivelSchema).min(1, 'Pelo menos um aprovador'),
});

export const CreateConfiguracaoWorkflowSchema = z
  .object({
    nome: z.string().min(1, 'Nome obrigatório').max(100),
    tipo: TipoAprovacaoWorkflowEnum,
    ativo: z.boolean().default(true),
    niveis: z
      .array(CreateNivelAprovacaoSchema)
      .min(1, 'Pelo menos um nível de aprovação')
      .refine(
        (niveis) => {
          const nums = niveis.map((n) => n.nivel);
          return new Set(nums).size === nums.length;
        },
        { message: 'Níveis de aprovação devem ter números únicos' },
      )
      .refine(
        (niveis) =>
          niveis.every((n) => n.valorMaximo > n.valorMinimo),
        { message: 'valorMaximo deve ser maior que valorMinimo em cada nível' },
      ),
  });

export type CreateConfiguracaoWorkflowInput = z.infer<typeof CreateConfiguracaoWorkflowSchema>;

// =====================================================================
// REQUISIÇÃO DE COMPRA
// =====================================================================

export const CreateItemRequisicaoSchema = z.object({
  produtoId: z.string().optional(),
  descricao: z.string().min(1, 'Descrição obrigatória').max(500),
  quantidade: positivoDecimal,
  unidadeMedida: z.string().min(1).max(30),
  precoEstimado: naoNegativoDecimal,
  observacoes: z.string().max(500).optional(),
});

export const CreateRequisicaoCompraSchema = z.object({
  data: z.coerce.date(),
  departamento: z.string().min(1, 'Departamento obrigatório').max(100),
  prioridade: PrioridadeRequisicaoEnum.default('MEDIA'),
  justificativa: z.string().min(10, 'Justificativa obrigatória (mín. 10 caracteres)').max(2000),
  observacoes: z.string().max(2000).optional(),
  dataEntregaDesejada: z.coerce.date().optional(),
  centroCustoId: z.string().optional(),
  itens: z
    .array(CreateItemRequisicaoSchema)
    .min(1, 'Pelo menos um item obrigatório'),
});

export type CreateRequisicaoCompraInput = z.infer<typeof CreateRequisicaoCompraSchema>;

export const UpdateRequisicaoCompraSchema = CreateRequisicaoCompraSchema.partial().omit({
  itens: true,
});

export type UpdateRequisicaoCompraInput = z.infer<typeof UpdateRequisicaoCompraSchema>;

export const FilterRequisicaoCompraSchema = z.object({
  status: StatusRequisicaoCompraEnum.optional(),
  prioridade: PrioridadeRequisicaoEnum.optional(),
  solicitanteId: z.string().optional(),
  centroCustoId: z.string().optional(),
  departamento: z.string().max(100).optional(),
  /** Pesquisa de texto livre: número, nome do solicitante ou departamento (OR). */
  q: z.string().max(200).optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['createdAt', 'valorTotal', 'prioridade']).default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export type FilterRequisicaoCompraInput = z.infer<typeof FilterRequisicaoCompraSchema>;

// ---- Decisão de aprovação ----

export const AprovarDocumentoSchema = z.object({
  documentoId: z.string().cuid('ID inválido'),
  nivel: z.number().int().positive(),
  status: z.enum(['APROVADO', 'REJEITADO']),
  observacoes: z.string().max(1000).optional(),
});

export type AprovarDocumentoInput = z.infer<typeof AprovarDocumentoSchema>;

// =====================================================================
// COTAÇÃO (RFQ)
// =====================================================================

export const CreateItemCotacaoSchema = z.object({
  produtoId: z.string().optional(),
  descricao: z.string().min(1, 'Descrição obrigatória').max(500),
  quantidade: positivoDecimal,
  unidadeMedida: z.string().min(1).max(30),
  especificacoes: z.string().max(2000).optional(),
});

export const CreateCotacaoSchema = z.object({
  requisicaoCompraId: z.string().cuid().optional(),
  dataValidade: z.coerce.date(),
  observacoes: z.string().max(2000).optional(),
  itens: z.array(CreateItemCotacaoSchema).min(1, 'Pelo menos um item'),
  // Fornecedores a convidar (IDs)
  fornecedoresIds: z.array(z.string()).optional(),
});

export type CreateCotacaoInput = z.infer<typeof CreateCotacaoSchema>;

export const UpdateCotacaoSchema = z.object({
  dataValidade: z.coerce.date().optional(),
  observacoes: z.string().max(2000).optional(),
});

export const FilterCotacaoSchema = z.object({
  status: StatusCotacaoEnum.optional(),
  requisicaoCompraId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['createdAt', 'dataValidade']).default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

// ---- Resposta de fornecedor à RFQ ----

export const CreateRespostaItemCotacaoSchema = z.object({
  itemCotacaoId: z.string().cuid(),
  precoUnitario: positivoDecimal,
  prazoEntregaDias: z.number().int().positive(),
  marca: z.string().max(100).optional(),
  observacoes: z.string().max(500).optional(),
});

export const RegistarRespostaCotacaoSchema = z.object({
  cotacaoId: z.string().cuid(),
  fornecedorId: z.string().cuid(),
  prazoEntregaDias: z.number().int().positive(),
  condicoesPagamento: z.string().max(200).optional(),
  observacoes: z.string().max(1000).optional(),
  respostas: z.array(CreateRespostaItemCotacaoSchema).min(1),
});

export type RegistarRespostaCotacaoInput = z.infer<typeof RegistarRespostaCotacaoSchema>;

// ---- Adjudicação ----

export const AdjudicarCotacaoSchema = z.object({
  cotacaoId: z.string().cuid(),
  fornecedorVencedorId: z.string().cuid(),
  observacoes: z.string().max(1000).optional(),
});

export type AdjudicarCotacaoInput = z.infer<typeof AdjudicarCotacaoSchema>;

// =====================================================================
// PEDIDO DE COMPRA
// =====================================================================

export const CreateItemPedidoCompraSchema = z.object({
  produtoId: z.string().optional(),
  descricao: z.string().min(1).max(500),
  quantidade: positivoDecimal,
  unidadeMedida: z.string().min(1).max(30),
  precoUnitario: positivoDecimal,
  desconto: naoNegativoDecimal.default(0),
  taxaIva: z.number().min(0).max(1).default(0.16),
  observacoes: z.string().max(500).optional(),
});

export const CreatePedidoCompraSchema = z.object({
  requisicaoCompraId: z.string().cuid().optional(),
  cotacaoId: z.string().cuid().optional(),
  fornecedorId: z.string().cuid('ID de fornecedor inválido'),
  data: z.coerce.date(),
  condicoesPagamento: z.string().min(1, 'Condições de pagamento obrigatórias').max(200),
  prazoEntregaDias: z.number().int().positive(),
  dataEntregaPrevista: z.coerce.date(),
  enderecoEntrega: z.string().min(1, 'Endereço de entrega obrigatório').max(500),
  centroCustoId: z.string().optional(),
  observacoes: z.string().max(2000).optional(),
  itens: z.array(CreateItemPedidoCompraSchema).min(1, 'Pelo menos um item'),
});

export type CreatePedidoCompraInput = z.infer<typeof CreatePedidoCompraSchema>;

export const UpdatePedidoCompraSchema = z.object({
  condicoesPagamento: z.string().max(200).optional(),
  prazoEntregaDias: z.number().int().positive().optional(),
  dataEntregaPrevista: z.coerce.date().optional(),
  enderecoEntrega: z.string().max(500).optional(),
  centroCustoId: z.string().optional(),
  observacoes: z.string().max(2000).optional(),
});

export type UpdatePedidoCompraInput = z.infer<typeof UpdatePedidoCompraSchema>;

export const FilterPedidoCompraSchema = z.object({
  status: StatusPedidoCompraEnum.optional(),
  fornecedorId: z.string().optional(),
  requisicaoCompraId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['createdAt', 'valorTotal', 'dataEntregaPrevista']).default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export type FilterPedidoCompraInput = z.infer<typeof FilterPedidoCompraSchema>;

// =====================================================================
// RECEBIMENTO DE MERCADORIA
// =====================================================================

export const CreateItemRecebimentoSchema = z.object({
  itemPedidoCompraId: z.string().cuid(),
  /** ID da localização de destino no armazém (passado ao entradaStock de WS A) */
  localizacaoDestinoId: z.string().cuid('ID de localização inválido'),
  quantidadeRecebida: positivoDecimal,
  quantidadeAceita: naoNegativoDecimal,
  quantidadeRejeitada: naoNegativoDecimal,
  motivoRejeicao: z.string().max(500).optional(),
  observacoes: z.string().max(500).optional(),
}).refine(
  (d) => Math.abs(d.quantidadeAceita + d.quantidadeRejeitada - d.quantidadeRecebida) < 0.0001,
  { message: 'quantidadeAceita + quantidadeRejeitada deve igualar quantidadeRecebida' },
);

export const CreateRecebimentoCompraSchema = z.object({
  pedidoCompraId: z.string().cuid(),
  data: z.coerce.date(),
  numeroDocumento: z.string().max(100).optional(),
  observacoes: z.string().max(2000).optional(),
  itens: z.array(CreateItemRecebimentoSchema).min(1, 'Pelo menos um item'),
});

export type CreateRecebimentoCompraInput = z.infer<typeof CreateRecebimentoCompraSchema>;

export const FilterRecebimentoCompraSchema = z.object({
  pedidoCompraId: z.string().optional(),
  status: StatusRecebimentoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
});

// =====================================================================
// CONTAS A PAGAR
// =====================================================================

export const CreateContaPagarSchema = z.object({
  fornecedorId: z.string().cuid(),
  pedidoCompraId: z.string().cuid().optional(),
  descricao: z.string().min(1).max(500),
  valorOriginal: positivoDecimal,
  dataEmissao: z.coerce.date(),
  dataVencimento: z.coerce.date(),
  centroCustoId: z.string().optional(),
  contaContabilId: z.string().optional(),
  observacoes: z.string().max(2000).optional(),
}).refine(
  (d) => d.dataVencimento >= d.dataEmissao,
  { message: 'Data de vencimento deve ser igual ou posterior à data de emissão' },
);

export type CreateContaPagarInput = z.infer<typeof CreateContaPagarSchema>;

export const UpdateContaPagarSchema = z.object({
  dataVencimento: z.coerce.date().optional(),
  centroCustoId: z.string().optional(),
  contaContabilId: z.string().optional(),
  observacoes: z.string().max(2000).optional(),
});

export const FilterContaPagarSchema = z.object({
  status: StatusContaPagarEnum.optional(),
  fornecedorId: z.string().optional(),
  dataVencimentoInicio: z.coerce.date().optional(),
  dataVencimentoFim: z.coerce.date().optional(),
  vencidas: z.boolean().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z.enum(['dataVencimento', 'valorOriginal', 'createdAt']).default('dataVencimento'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});

export type FilterContaPagarInput = z.infer<typeof FilterContaPagarSchema>;

// =====================================================================
// PAGAMENTO (liquidação de conta a pagar)
// =====================================================================

export const CreatePagamentoSchema = z.object({
  contaPagarId: z.string().cuid(),
  dataPagamento: z.coerce.date(),
  valor: positivoDecimal,
  formaPagamento: z.string().min(1, 'Forma de pagamento obrigatória').max(100),
  referencia: z.string().max(200).optional(),
  observacoes: z.string().max(1000).optional(),
});

export type CreatePagamentoInput = z.infer<typeof CreatePagamentoSchema>;

export const FilterPagamentoSchema = z.object({
  contaPagarId: z.string().optional(),
  status: StatusPagamentoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
});

export type FilterPagamentoInput = z.infer<typeof FilterPagamentoSchema>;
