/**
 * Interface do serviço de Compras — WS B (Wave 1: contratos)
 * Cobre: RequisicaoCompra, Cotacao (RFQ), PedidoCompra, RecebimentoCompra,
 *        ConfiguracaoWorkflow / AprovacaoCompra
 *
 * Máquinas de estado exportadas como constantes (usadas em property tests Wave 2).
 * Implementação em Wave 2: compras.service.ts
 */
import 'server-only';

import type {
  CreateRequisicaoCompraInput,
  UpdateRequisicaoCompraInput,
  FilterRequisicaoCompraInput,
  AprovarDocumentoInput,
  CreateCotacaoInput,
  RegistarRespostaCotacaoInput,
  AdjudicarCotacaoInput,
  FilterCotacaoSchema,
  CreatePedidoCompraInput,
  UpdatePedidoCompraInput,
  FilterPedidoCompraInput,
  CreateRecebimentoCompraInput,
  CreateConfiguracaoWorkflowInput,
} from '@/lib/validations/compras';
import type { EntradaStockInput } from '@/server/services/inventario/stock.interface';
import type { TipoSerieDocumento } from '@/server/services/financas';
import type { Ctx, TxClient, PaginatedResult } from '@/server/services/types';
import type { z } from 'zod';

// Assegura que o tipo é importado (usado nos contratos transaccionais internos)
export type { EntradaStockInput, TipoSerieDocumento, TxClient };

export type Dinheiro = number; // Decimal(18,2) — implementação usa Prisma.Decimal

// =====================================================================
// MÁQUINAS DE ESTADO (exportadas para property tests)
// =====================================================================

export type StatusRequisicaoCompra =
  | 'RASCUNHO'
  | 'PENDENTE'
  | 'EM_APROVACAO'
  | 'APROVADA'
  | 'REJEITADA'
  | 'CANCELADA'
  | 'CONVERTIDA';

/**
 * Transições válidas para RequisicaoCompra.
 * RASCUNHO: rascunho → submetida para aprovação ou cancelada sem submeter.
 * PENDENTE: aguarda início do workflow de aprovação.
 * EM_APROVACAO: no mínimo um aprovador já recebeu a tarefa.
 * APROVADA: todos os níveis concluídos com sucesso → pode converter em pedido.
 * CONVERTIDA: estado terminal — pedido de compra emitido.
 */
export const TRANSICOES_REQUISICAO: Record<StatusRequisicaoCompra, StatusRequisicaoCompra[]> = {
  RASCUNHO: ['PENDENTE', 'CANCELADA'],
  PENDENTE: ['EM_APROVACAO', 'CANCELADA'],
  EM_APROVACAO: ['APROVADA', 'REJEITADA'],
  APROVADA: ['CONVERTIDA', 'CANCELADA'],
  REJEITADA: [],
  CANCELADA: [],
  CONVERTIDA: [],
};

export type StatusCotacao =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'RESPONDIDA'
  | 'ADJUDICADA'
  | 'VENCIDA'
  | 'CANCELADA';

/**
 * Transições válidas para Cotacao (RFQ).
 * ADJUDICADA: vencedor seleccionado → gera PedidoCompra.
 * VENCIDA: prazo de validade expirou sem adjudicação (transição automática por scheduler).
 */
export const TRANSICOES_COTACAO: Record<StatusCotacao, StatusCotacao[]> = {
  RASCUNHO: ['ENVIADA', 'CANCELADA'],
  ENVIADA: ['RESPONDIDA', 'VENCIDA', 'CANCELADA'],
  RESPONDIDA: ['ADJUDICADA', 'VENCIDA', 'CANCELADA'],
  ADJUDICADA: [],
  VENCIDA: [],
  CANCELADA: [],
};

export type StatusPedidoCompra =
  | 'RASCUNHO'
  | 'ENVIADO'
  | 'CONFIRMADO'
  | 'EM_TRANSITO'
  | 'RECEBIDO_PARCIAL'
  | 'RECEBIDO_TOTAL'
  | 'CANCELADO';

/**
 * Transições válidas para PedidoCompra.
 * RECEBIDO_PARCIAL: alguns itens recebidos mas não a totalidade.
 * RECEBIDO_TOTAL: estado terminal funcional — trigga entrada em stock (WS A) e conta a pagar.
 */
export const TRANSICOES_PEDIDO_COMPRA: Record<StatusPedidoCompra, StatusPedidoCompra[]> = {
  RASCUNHO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['EM_TRANSITO', 'CANCELADO'],
  EM_TRANSITO: ['RECEBIDO_PARCIAL', 'RECEBIDO_TOTAL'],
  RECEBIDO_PARCIAL: ['RECEBIDO_TOTAL'],
  RECEBIDO_TOTAL: [],
  CANCELADO: [],
};

export type StatusAprovacao = 'PENDENTE' | 'APROVADO' | 'REJEITADO';

/**
 * Transições válidas para decisão de aprovação (nível individual).
 */
export const TRANSICOES_APROVACAO: Record<StatusAprovacao, StatusAprovacao[]> = {
  PENDENTE: ['APROVADO', 'REJEITADO'],
  APROVADO: [],
  REJEITADO: [],
};

/**
 * Função de transição genérica — lança BusinessRuleError se a transição for inválida.
 * Implementação efectiva em Wave 2 (compras.service.ts).
 */
export type TransitarFn<S extends string> = (actual: S, alvo: S) => void;

// =====================================================================
// TIPOS DE DOMÍNIO
// =====================================================================

export interface RequisicaoCompraResumo {
  id: string;
  numero: string;
  data: Date;
  solicitanteId: string;
  solicitanteNome: string;
  departamento: string;
  prioridade: string;
  status: StatusRequisicaoCompra;
  valorTotal: Dinheiro;
  nivelAprovacaoActual: number;
  totalNiveis: number;
  createdAt: Date;
}

export interface RequisicaoCompraDetalhe extends RequisicaoCompraResumo {
  justificativa: string;
  observacoes: string | null;
  dataEntregaDesejada: Date | null;
  centroCustoId: string | null;
  itens: ItemRequisicaoDto[];
  aprovacoes: AprovacaoCompraDto[];
}

export interface ItemRequisicaoDto {
  id: string;
  produtoId: string | null;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  precoEstimado: Dinheiro;
  subtotal: Dinheiro;
}

export interface AprovacaoCompraDto {
  id: string;
  nivel: number;
  aprovadorId: string;
  aprovadorNome: string;
  status: StatusAprovacao;
  data: Date | null;
  observacoes: string | null;
}

export interface CotacaoResumo {
  id: string;
  numero: string;
  data: Date;
  status: StatusCotacao;
  dataValidade: Date;
  totalFornecedores: number;
  totalRespostas: number;
  vencedorFornecedorId: string | null;
  createdAt: Date;
}

export interface CotacaoDetalhe extends CotacaoResumo {
  requisicaoCompraId: string | null;
  observacoes: string | null;
  fornecedores: CotacaoFornecedorDto[];
  itens: ItemCotacaoDto[];
}

export interface CotacaoFornecedorDto {
  id: string;
  fornecedorId: string;
  fornecedorNome: string;
  status: string;
  dataEnvio: Date | null;
  dataResposta: Date | null;
  valorTotal: Dinheiro | null;
  prazoEntregaDias: number | null;
  condicoesPagamento: string | null;
}

export interface ItemCotacaoDto {
  id: string;
  produtoId: string | null;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  respostas: RespostaItemCotacaoDto[];
}

export interface RespostaItemCotacaoDto {
  cotacaoFornecedorId: string;
  fornecedorId: string;
  precoUnitario: Dinheiro;
  subtotal: Dinheiro;
  prazoEntregaDias: number;
  marca: string | null;
}

export interface PedidoCompraResumo {
  id: string;
  numero: string;
  data: Date;
  fornecedorId: string;
  fornecedorNome: string;
  status: StatusPedidoCompra;
  valorTotal: Dinheiro;
  dataEntregaPrevista: Date;
  dataEntregaReal: Date | null;
  createdAt: Date;
}

export interface PedidoCompraDetalhe extends PedidoCompraResumo {
  requisicaoCompraId: string | null;
  cotacaoId: string | null;
  valorSubtotal: Dinheiro;
  valorDesconto: Dinheiro;
  valorIva: Dinheiro;
  taxaIva: number;
  condicoesPagamento: string;
  prazoEntregaDias: number;
  enderecoEntrega: string;
  centroCustoId: string | null;
  observacoes: string | null;
  itens: ItemPedidoCompraDto[];
  aprovacoes: AprovacaoCompraDto[];
  recebimentos: RecebimentoCompraDto[];
}

export interface ItemPedidoCompraDto {
  id: string;
  produtoId: string | null;
  descricao: string;
  quantidade: number;
  quantidadeRecebida: number;
  unidadeMedida: string;
  precoUnitario: Dinheiro;
  desconto: Dinheiro;
  taxaIva: number;
  subtotal: Dinheiro;
}

export interface RecebimentoCompraDto {
  id: string;
  data: Date;
  status: string;
  responsavelNome: string;
  itens: ItemRecebimentoDto[];
}

export interface ItemRecebimentoDto {
  itemPedidoCompraId: string;
  quantidadeRecebida: number;
  quantidadeAceita: number;
  quantidadeRejeitada: number;
  motivoRejeicao: string | null;
}

// =====================================================================
// Contrato do serviço de Compras
// =====================================================================

export interface IComprasService {
  // ---- Configuração de Workflow ----
  criarConfiguracaoWorkflow(
    input: CreateConfiguracaoWorkflowInput,
    ctx: Ctx,
  ): Promise<{ id: string; nome: string }>;

  // ---- Requisição de Compra ----
  criarRequisicao(
    input: CreateRequisicaoCompraInput,
    ctx: Ctx,
  ): Promise<RequisicaoCompraDetalhe>;
  actualizarRequisicao(
    id: string,
    input: UpdateRequisicaoCompraInput,
    ctx: Ctx,
  ): Promise<RequisicaoCompraDetalhe>;
  submeterRequisicao(id: string, ctx: Ctx): Promise<RequisicaoCompraDetalhe>;
  cancelarRequisicao(id: string, motivo: string, ctx: Ctx): Promise<void>;
  obterRequisicao(id: string, ctx: Ctx): Promise<RequisicaoCompraDetalhe>;
  listarRequisicoes(
    filtros: FilterRequisicaoCompraInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<RequisicaoCompraResumo>>;

  /**
   * Contagens agregadas de requisições por estado — usado nos KPIs da listagem.
   * Uma única chamada substitui 4 queries separadas de take:1.
   */
  contarRequisicoesPorStatus(ctx: Ctx): Promise<{
    total: number;
    pendentes: number;
    aprovadas: number;
    valorTotalProcesso: number;
  }>;

  /**
   * Processar decisão de aprovação num nível.
   * Lógica multi-nível:
   *  - QUALQUER_UM: primeira aprovação avança ao nível seguinte.
   *  - TODOS: todas as aprovações do nível são necessárias.
   *  - MAIORIA: ceil(n/2) aprovações são necessárias.
   * Se o último nível for aprovado → status=APROVADA.
   * Qualquer REJEITADO num nível → status=REJEITADA.
   */
  decidirAprovacao(input: AprovarDocumentoInput, ctx: Ctx): Promise<void>;

  // ---- Cotação (RFQ) ----
  criarCotacao(input: CreateCotacaoInput, ctx: Ctx): Promise<CotacaoDetalhe>;
  enviarCotacao(cotacaoId: string, ctx: Ctx): Promise<void>;
  registarResposta(input: RegistarRespostaCotacaoInput, ctx: Ctx): Promise<void>;
  adjudicarCotacao(input: AdjudicarCotacaoInput, ctx: Ctx): Promise<void>;
  cancelarCotacao(cotacaoId: string, motivo: string, ctx: Ctx): Promise<void>;
  expirarCotacoesVencidas(ctx: Ctx): Promise<number>; // retorna nº de cotações expiradas
  obterCotacao(id: string, ctx: Ctx): Promise<CotacaoDetalhe>;
  listarCotacoes(
    filtros: z.infer<typeof FilterCotacaoSchema>,
    ctx: Ctx,
  ): Promise<PaginatedResult<CotacaoResumo>>;

  // ---- Pedido de Compra ----
  criarPedido(input: CreatePedidoCompraInput, ctx: Ctx): Promise<PedidoCompraDetalhe>;
  /**
   * Converte uma RequisicaoCompra aprovada + Cotacao adjudicada num PedidoCompra.
   * Opera em prisma.$transaction.
   */
  converterRequisicaoEmPedido(
    requisicaoId: string,
    cotacaoId: string,
    ctx: Ctx,
  ): Promise<PedidoCompraDetalhe>;
  actualizarPedido(
    id: string,
    input: UpdatePedidoCompraInput,
    ctx: Ctx,
  ): Promise<PedidoCompraDetalhe>;
  enviarPedido(id: string, ctx: Ctx): Promise<void>;
  cancelarPedido(id: string, motivo: string, ctx: Ctx): Promise<void>;
  obterPedido(id: string, ctx: Ctx): Promise<PedidoCompraDetalhe>;
  listarPedidos(
    filtros: FilterPedidoCompraInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<PedidoCompraResumo>>;

  // ---- Recebimento de Mercadoria ----
  /**
   * Regista recebimento parcial ou total.
   * Dentro da mesma transacção:
   *   1. Cria RecebimentoCompra + ItemRecebimento (append-only).
   *   2. Actualiza quantidadeRecebida em ItemPedidoCompra.
   *   3. Actualiza status do PedidoCompra (RECEBIDO_PARCIAL | RECEBIDO_TOTAL).
   *   4. Para CADA recebimento (parcial OU total) chama entradaStock(tx, data, ctx)
   *      de WS A — ADR-0003 A8: entrada em stock ocorre também em recepção PARCIAL.
   *      data: { produtoId, varianteProdutoId?, localizacaoDestinoId, quantidade,
   *              documentoReferenciaId: recebimento.id,
   *              documentoReferenciaTipo: 'RecebimentoCompra' }
   *   5. Se RECEBIDO_TOTAL → cria ContaPagar.
   * Invariante: soma(quantidadeRecebida) ≤ quantidade original do item.
   */
  registarRecebimento(
    input: CreateRecebimentoCompraInput,
    ctx: Ctx,
  ): Promise<RecebimentoCompraDto>;
  listarRecebimentos(pedidoId: string, ctx: Ctx): Promise<RecebimentoCompraDto[]>;
}
