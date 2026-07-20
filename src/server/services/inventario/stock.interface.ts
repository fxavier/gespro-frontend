// Interface do serviço de Stock + contratos expostos a B, C, E (WS A — Wave 1)
// ADR-0003: fonte única — B/C/E importam os tipos daqui e de @/lib/validations/stock.
import 'server-only';

import type {
  BaixaStockInput,
  EntradaStockInput,
  MovimentoStockFilter,
  ReservaStockInput,
  SaldoStockFilter,
  TransferenciaStockInput,
  LocalizacaoCreate,
  LocalizacaoFilter,
  LocalizacaoUpdate,
} from '@/lib/validations/stock';
import type { Ctx, PaginatedResult, TxClient } from '@/server/services/types';

// ─── Tipos de retorno ─────────────────────────────────────────────────────────
// Exportados explicitamente para que B/C/E possam usar sem espelhos locais.

export interface LocalizacaoDto {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  tipo: string;
  endereco: string | null;
  descricao: string | null;
  capacidade: string | null;
  responsavelId: string | null;
  ativa: boolean;
  localizacaoPaiId: string | null;
  createdAt: Date;
}

export interface MovimentoStockDto {
  id: string;
  tenantId: string;
  produtoId: string;
  varianteProdutoId: string | null;
  tipo: string;
  quantidade: string; // Decimal serializado
  localizacaoOrigemId: string | null;
  localizacaoDestinoId: string | null;
  transferenciaRefId: string | null;
  documentoReferenciaId: string | null;
  documentoReferenciaTipo: string | null;
  motivo: string | null;
  observacoes: string | null;
  criadoPor: string;
  createdAt: Date;
}

export interface SaldoStockDto {
  id: string;
  tenantId: string;
  produtoId: string;
  /** "" quando sem variante (sentinela ADR-0003 A4); CUID quando com variante. */
  varianteProdutoId: string;
  localizacaoId: string;
  saldo: string;           // Decimal serializado
  saldoReservado: string;  // Decimal serializado
  saldoDisponivel: string; // calculado: saldo - saldoReservado
  updatedAt: Date;
}

export interface ReservaStockDto {
  id: string;
  tenantId: string;
  produtoId: string;
  varianteProdutoId: string | null;
  localizacaoId: string;
  quantidade: string; // Decimal serializado
  status: string;
  documentoReferenciaId: string | null;
  documentoReferenciaTipo: string | null;
  expiradoEm: Date | null;
  createdAt: Date;
}

/**
 * Retorno canónico de reservarStock.
 * ADR-0003: consumidores (B/C/E) guardam apenas o reservaId para uso posterior
 * em confirmarConsumoStock / libertarStock.
 */
export interface ReservaStockResult {
  reservaId: string;
}

// ─── Mapa de máquina de estado — ReservaStock ─────────────────────────────────

/**
 * Transições válidas para ReservaStock.
 * ATIVA → CONSUMIDA (via confirmarConsumoStock)
 * ATIVA → LIBERADA  (via libertarStock)
 * ATIVA → EXPIRADA  (por job de expiração)
 */
export const TRANSICOES_RESERVA_STOCK: Record<string, string[]> = {
  ATIVA: ['CONSUMIDA', 'LIBERADA', 'EXPIRADA'],
  CONSUMIDA: [],
  LIBERADA: [],
  EXPIRADA: [],
} as const;

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface IStockService {
  // Localizações
  listarLocalizacoes(
    filter: LocalizacaoFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<LocalizacaoDto>>;

  obterLocalizacao(id: string, ctx: Ctx): Promise<LocalizacaoDto>;

  criarLocalizacao(data: LocalizacaoCreate, ctx: Ctx): Promise<LocalizacaoDto>;

  actualizarLocalizacao(
    id: string,
    data: LocalizacaoUpdate,
    ctx: Ctx,
  ): Promise<LocalizacaoDto>;

  desactivarLocalizacao(id: string, ctx: Ctx): Promise<void>;

  // Consultas de saldo
  listarSaldos(filter: SaldoStockFilter, ctx: Ctx): Promise<PaginatedResult<SaldoStockDto>>;

  obterSaldo(
    produtoId: string,
    localizacaoId: string,
    ctx: Ctx,
    varianteProdutoId?: string,
  ): Promise<SaldoStockDto>;

  obterSaldoTotal(
    produtoId: string,
    ctx: Ctx,
    varianteProdutoId?: string,
  ): Promise<SaldoStockDto>;

  verificarDisponibilidade(
    produtoId: string,
    quantidade: number,
    localizacaoId: string,
    ctx: Ctx,
    varianteProdutoId?: string,
  ): Promise<{ disponivel: boolean; saldoDisponivel: string }>;

  obterAlertasStockMinimo(ctx: Ctx): Promise<SaldoStockDto[]>;

  // Movimentos
  listarMovimentos(
    filter: MovimentoStockFilter,
    ctx: Ctx,
  ): Promise<PaginatedResult<MovimentoStockDto>>;

  registarTransferencia(
    data: TransferenciaStockInput,
    ctx: Ctx,
  ): Promise<{ movimentoSaida: MovimentoStockDto; movimentoEntrada: MovimentoStockDto }>;

  // ─── Contratos transaccionais expostos a WS B, C, E ──────────────────────
  // ADR-0003 ponto 6: tx é o 1.º parâmetro OBRIGATÓRIO (não opcional).
  // Consumidores passam o tx da sua $transaction — garante atomicidade.

  /**
   * Regista uma entrada de stock (recepção de compra, produção, etc.).
   * Consumidores: WS B (RecebimentoCompra), WS E (output de OrdemProducao).
   * Input canónico: EntradaStockInput de @/lib/validations/stock.
   *   — exige localizacaoDestinoId obrigatório.
   *   — NÃO aceita tenantId (vem do ctx) nem custo/unidadeMedida.
   */
  entradaStock(
    tx: TxClient,
    data: EntradaStockInput,
    ctx: Ctx,
  ): Promise<MovimentoStockDto>;

  /**
   * Baixa de stock imediata sem reserva prévia.
   * Consumidores: WS C (POS/Venda directa), WS E (consumo ad-hoc).
   * Input canónico: BaixaStockInput de @/lib/validations/stock.
   *   — exige localizacaoOrigemId obrigatório.
   *   — NÃO aceita tenantId nem custo/unidadeMedida.
   * Lança BusinessRuleError('STOCK_INSUFICIENTE') se saldo < quantidade.
   */
  baixarStock(
    tx: TxClient,
    data: BaixaStockInput,
    ctx: Ctx,
  ): Promise<MovimentoStockDto>;

  /**
   * Reserva stock para um documento (venda, ordem de produção, etc.).
   * Consumidores: WS C (confirmação de venda), WS E (planeamento de produção).
   * Input canónico: ReservaStockInput de @/lib/validations/stock.
   *   — NÃO aceita tenantId nem custo/unidadeMedida.
   * Retorna { reservaId } — consumidor guarda o ID para confirmar/libertar.
   * Lança BusinessRuleError('STOCK_INSUFICIENTE') se saldoDisponivel < quantidade.
   */
  reservarStock(
    tx: TxClient,
    data: ReservaStockInput,
    ctx: Ctx,
  ): Promise<ReservaStockResult>;

  /**
   * Confirma o consumo de uma reserva activa, gerando MovimentoStock(SAIDA).
   * Decrementa saldo + saldoReservado; muda status da reserva para CONSUMIDA.
   * Consumidores: WS C (entrega/facturação), WS E (conclusão de produção).
   */
  confirmarConsumoStock(
    tx: TxClient,
    reservaId: string,
    ctx: Ctx,
  ): Promise<MovimentoStockDto>;

  /**
   * Liberta uma reserva activa sem gerar movimento de saída.
   * Decrementa saldoReservado; muda status da reserva para LIBERADA.
   * Consumidores: WS C (cancelamento de venda), WS E (cancelamento de produção).
   */
  libertarStock(
    tx: TxClient,
    reservaId: string,
    ctx: Ctx,
  ): Promise<void>;
}

// ─── Re-exports canónicos para consumidores (B, C, E) ─────────────────────────
// Importar daqui — NÃO criar espelhos locais (ADR-0003 ponto 1).
export type { EntradaStockInput, BaixaStockInput, ReservaStockInput } from '@/lib/validations/stock';
