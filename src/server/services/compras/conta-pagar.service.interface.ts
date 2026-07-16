/**
 * Interface do serviço de Contas a Pagar e Pagamentos — WS B (Wave 1: contratos)
 * Conflito #6: ContaPagar (documento) + Pagamento (liquidação que integra WS D).
 * Implementação em Wave 2: conta-pagar.service.ts
 *
 * Contrato consumido de WS D:
 *   registarLancamentoContabilistico(tx, input, ctx) → { lancamentoId: string }
 *   proximoNumeroSerie(tx, tipo, ctx)               → string (tipos: 'CONTA_PAGAR' | 'PAGAMENTO')
 */
import 'server-only';

import type {
  CreateContaPagarInput,
  FilterContaPagarInput,
  CreatePagamentoInput,
  FilterPagamentoInput,
} from '@/lib/validations/compras';
import type { RegistarLancamentoContabilisticoInput } from '@/server/services/financas';
import type { TipoSerieDocumento } from '@/server/services/financas';
import type { Ctx, TxClient, PaginatedResult } from '@/server/services/types';

// Assegura que os tipos cross-WS D ficam visíveis nos type tests
export type { RegistarLancamentoContabilisticoInput, TipoSerieDocumento, TxClient };

export type Dinheiro = number; // Decimal(18,2) — implementação usa Prisma.Decimal

// =====================================================================
// MÁQUINAS DE ESTADO (exportadas para property tests)
// =====================================================================

export type StatusContaPagar = 'ABERTA' | 'PARCIALMENTE_PAGA' | 'PAGA' | 'CANCELADA' | 'VENCIDA';

/**
 * Transições válidas para ContaPagar.
 * ABERTA → PARCIALMENTE_PAGA: primeiro pagamento parcial.
 * ABERTA | PARCIALMENTE_PAGA → PAGA: liquidação total.
 * ABERTA | PARCIALMENTE_PAGA → VENCIDA: marcação automática por job diário.
 * ABERTA | PARCIALMENTE_PAGA | VENCIDA → CANCELADA: cancelamento manual.
 */
export const TRANSICOES_CONTA_PAGAR: Record<StatusContaPagar, StatusContaPagar[]> = {
  ABERTA: ['PARCIALMENTE_PAGA', 'PAGA', 'VENCIDA', 'CANCELADA'],
  PARCIALMENTE_PAGA: ['PAGA', 'VENCIDA', 'CANCELADA'],
  PAGA: [],
  VENCIDA: ['PAGA', 'CANCELADA'],
  CANCELADA: [],
};

export type StatusPagamento = 'PENDENTE' | 'PROCESSANDO' | 'CONCLUIDO' | 'CANCELADO';

/**
 * Transições válidas para Pagamento.
 * PENDENTE → PROCESSANDO: pagamento em processamento bancário.
 * PROCESSANDO → CONCLUIDO: confirmação de liquidação.
 * PENDENTE | PROCESSANDO → CANCELADO: cancelamento antes da conclusão.
 */
export const TRANSICOES_PAGAMENTO: Record<StatusPagamento, StatusPagamento[]> = {
  PENDENTE: ['PROCESSANDO', 'CONCLUIDO', 'CANCELADO'],
  PROCESSANDO: ['CONCLUIDO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
};

/**
 * Valida transição de ContaPagar; lança BusinessRuleError se inválida.
 * Implementação efectiva em Wave 2.
 */
export function transitarContaPagar(actual: StatusContaPagar, alvo: StatusContaPagar): void {
  const permitidos = TRANSICOES_CONTA_PAGAR[actual];
  if (!permitidos.includes(alvo)) {
    throw new Error(`Transição inválida de ContaPagar: ${actual} → ${alvo}`);
  }
}

/**
 * Valida transição de Pagamento; lança BusinessRuleError se inválida.
 * Implementação efectiva em Wave 2.
 */
export function transitarPagamento(actual: StatusPagamento, alvo: StatusPagamento): void {
  const permitidos = TRANSICOES_PAGAMENTO[actual];
  if (!permitidos.includes(alvo)) {
    throw new Error(`Transição inválida de Pagamento: ${actual} → ${alvo}`);
  }
}

// =====================================================================
// TIPOS DE DOMÍNIO
// =====================================================================

export interface ContaPagarResumo {
  id: string;
  numero: string;
  fornecedorId: string;
  fornecedorNome: string;
  descricao: string;
  valorOriginal: Dinheiro;
  valorPago: Dinheiro;
  valorRestante: Dinheiro;
  dataEmissao: Date;
  dataVencimento: Date;
  status: StatusContaPagar;
  diasAtraso: number; // 0 se não vencida
}

export interface ContaPagarDetalhe extends ContaPagarResumo {
  pedidoCompraId: string | null;
  centroCustoId: string | null;
  contaContabilId: string | null;
  observacoes: string | null;
  pagamentos: PagamentoDto[];
}

export interface PagamentoDto {
  id: string;
  numero: string;
  dataPagamento: Date;
  valor: Dinheiro;
  formaPagamento: string;
  referencia: string | null;
  status: StatusPagamento;
  lancamentoId: string | null; // preenchido pela integração WS D
}

// ---- Relatório de aging ----
export interface AgingRelatorio {
  dataReferencia: Date;
  linhas: AgingLinha[];
  totalAberto: Dinheiro;
}

export interface AgingLinha {
  fornecedorId: string;
  fornecedorNome: string;
  corrente: Dinheiro;       // não vencido
  ate30Dias: Dinheiro;
  de31a60Dias: Dinheiro;
  de61a90Dias: Dinheiro;
  acima90Dias: Dinheiro;
  total: Dinheiro;
}

// =====================================================================
// Contrato do serviço
// =====================================================================

export interface IContaPagarService {
  // ---- ContaPagar ----
  criar(input: CreateContaPagarInput, ctx: Ctx): Promise<ContaPagarDetalhe>;
  obter(id: string, ctx: Ctx): Promise<ContaPagarDetalhe>;
  listar(filtros: FilterContaPagarInput, ctx: Ctx): Promise<PaginatedResult<ContaPagarResumo>>;
  cancelar(id: string, motivo: string, ctx: Ctx): Promise<void>;

  /**
   * Marcar contas vencidas com status=VENCIDA.
   * Chamado por job diário (Wave 2).
   */
  actualizarVencidas(ctx: Ctx): Promise<number>;

  // ---- Pagamento ----
  /**
   * Liquidar (parcial ou total) uma conta a pagar.
   * Dentro da transacção:
   *   1. Cria Pagamento via proximoNumeroSerie(tx, 'PAGAMENTO', ctx).
   *   2. Actualiza valorPago e valorRestante da ContaPagar.
   *   3. Actualiza status da ContaPagar via transitarContaPagar().
   *   4. Wave 3: chama registarLancamentoContabilistico(tx, input, ctx) de WS D
   *      e preenche Pagamento.lancamentoId.
   *      Partidas: [
   *        { contaCodigo: '2211', tipo: 'DEBITO', valor },    // Fornecedores
   *        { contaCodigo: '1121', tipo: 'CREDITO', valor },   // Banco/Caixa
   *      ]
   */
  registarPagamento(input: CreatePagamentoInput, ctx: Ctx): Promise<PagamentoDto>;

  listarPagamentos(
    filtros: FilterPagamentoInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<PagamentoDto>>;

  // ---- Relatórios ----
  relatorioAging(ctx: Ctx): Promise<AgingRelatorio>;

  /**
   * Total em aberto por fornecedor (usado pelo serviço de Fornecedor para aging).
   */
  saldoAbertoPorFornecedor(
    fornecedorId: string,
    ctx: Ctx,
  ): Promise<{ aberto: Dinheiro; vencido: Dinheiro }>;
}
