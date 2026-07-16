/**
 * Interface de serviço — Vendas e POS (WS C)
 * ADR-0003: import 'server-only'; Ctx/TxClient de types.ts; contratos cross-WS
 * importados das fontes canónicas (A e D) — sem espelhos locais.
 *
 * Inclui:
 *  - TRANSICOES_VENDA + transitarVenda()
 *  - TRANSICOES_SESSAO_POS + transitarSessaoPOS()
 *  - IVendaService, ISessaoPOSService
 *
 * DECISÃO #7 (owner confirmada): Venda unificada com campo `origem`.
 */
import 'server-only';

import type {
  CreateVendaInput,
  UpdateVendaInput,
  FilterVendaInput,
  TransitarVendaInput,
  AbrirSessaoPOSInput,
  FecharSessaoPOSInput,
} from '@/lib/validations/vendas';
import { BusinessRuleError } from '@/lib/errors';

// ADR-0003 ponto 6: Ctx e TxClient de fonte única
import type { Ctx, TxClient } from '@/server/services/types';

// ADR-0003 ponto 1 (B1): BaixaStockInput da fonte canónica WS A
import type { BaixaStockInput, IStockService } from '@/server/services/inventario/stock.interface';

// ADR-0003 ponto 1 (B2): RegistarMovimentoCaixaInput + numeração da fonte canónica WS D
import type {
  RegistarMovimentoCaixaInput,
  TipoSerieDocumento,
} from '@/server/services/financas';

// Re-exportar para que outros módulos do WS C possam usar sem cadeia de imports
export type { Ctx, TxClient };
export type { BaixaStockInput };
export type { RegistarMovimentoCaixaInput, TipoSerieDocumento };
export type { IStockService };

// ---------------------------------------------------------------------------
// Tipos de estado (string literal — compatíveis com os enums Prisma do WS C)
// ---------------------------------------------------------------------------

export type StatusVenda =
  | 'RASCUNHO'
  | 'PENDENTE'
  | 'CONFIRMADA'
  | 'EM_PREPARACAO'
  | 'FATURADA'
  | 'CONCLUIDA'
  | 'CANCELADA'
  | 'DEVOLVIDA';

export type OrigemVenda = 'POS' | 'ENCOMENDA' | 'ECOMMERCE' | 'MANUAL';
export type StatusSessaoPOS = 'ABERTA' | 'FECHADA' | 'SUSPENSA';
export type MetodoPagamentoTipo =
  | 'DINHEIRO'
  | 'CARTAO'
  | 'TRANSFERENCIA'
  | 'MPESA'
  | 'EMOLA'
  | 'CREDITO';

// ---------------------------------------------------------------------------
// Máquina de estado — Venda (ADR-0003 A6)
// ---------------------------------------------------------------------------

/**
 * Mapa de transições válidas por estado de Venda.
 *
 * POS (caminho rápido):
 *   PENDENTE → FATURADA → CONCLUIDA
 *   PENDENTE → CANCELADA
 *
 * ENCOMENDA (caminho completo):
 *   RASCUNHO → PENDENTE → CONFIRMADA → EM_PREPARACAO → FATURADA → CONCLUIDA
 *   (qualquer estado não-terminal) → CANCELADA
 *   FATURADA → DEVOLVIDA (via nota de crédito em WS D)
 *
 * CONCLUIDA, CANCELADA, DEVOLVIDA são estados terminais.
 */
export const TRANSICOES_VENDA: Record<StatusVenda, StatusVenda[]> = {
  RASCUNHO: ['PENDENTE', 'CANCELADA'],
  PENDENTE: ['CONFIRMADA', 'FATURADA', 'CANCELADA'], // FATURADA = caminho rápido POS
  CONFIRMADA: ['EM_PREPARACAO', 'FATURADA', 'CANCELADA'],
  EM_PREPARACAO: ['FATURADA', 'CANCELADA'],
  FATURADA: ['CONCLUIDA', 'DEVOLVIDA'],
  CONCLUIDA: [],   // terminal
  CANCELADA: [],   // terminal
  DEVOLVIDA: [],   // terminal
};

/**
 * Valida transição de estado da Venda.
 * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
 */
export function transitarVenda(actual: StatusVenda, alvo: StatusVenda): void {
  const permitidas = TRANSICOES_VENDA[actual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de Venda: ${actual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
      { estadoActual: actual, estadoAlvo: alvo, permitidas },
    );
  }
}

// ---------------------------------------------------------------------------
// Máquina de estado — SessaoPOS (ADR-0003 A6)
// ---------------------------------------------------------------------------

/**
 * Mapa de transições válidas por estado de SessaoPOS.
 *
 * ABERTA    → FECHADA   (fecho normal — sem vendas pendentes)
 * ABERTA    → SUSPENSA  (pausa temporária)
 * SUSPENSA  → ABERTA    (retoma)
 * SUSPENSA  → FECHADA   (fecho directo de sessão suspensa)
 * FECHADA   → []        (terminal)
 */
export const TRANSICOES_SESSAO_POS: Record<StatusSessaoPOS, StatusSessaoPOS[]> = {
  ABERTA: ['FECHADA', 'SUSPENSA'],
  SUSPENSA: ['ABERTA', 'FECHADA'],
  FECHADA: [], // terminal
};

/**
 * Valida transição de estado da SessaoPOS.
 * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
 */
export function transitarSessaoPOS(actual: StatusSessaoPOS, alvo: StatusSessaoPOS): void {
  const permitidas = TRANSICOES_SESSAO_POS[actual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de SessaoPOS: ${actual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
      { estadoActual: actual, estadoAlvo: alvo, permitidas },
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos de resultado (Wave 2: substituir por tipos Prisma gerados)
// ---------------------------------------------------------------------------

export interface ItemVendaRow {
  id: string;
  tenantId: string;
  vendaId: string;
  produtoId: string;
  varianteProdutoId: string | null; // alinhado com BaixaStockInput.varianteProdutoId
  nomeProduto: string;
  sku: string | null;
  /** Decimal serializado (string) — Prisma.Decimal na implementação */
  quantidade: string;
  precoUnitario: string;
  desconto: string;
  taxaIva: string;
  subtotal: string;
  ivaItem: string;
  total: string;
  createdAt: Date;
}

export interface PagamentoVendaRow {
  id: string;
  tenantId: string;
  vendaId: string;
  tipo: MetodoPagamentoTipo;
  /** Decimal serializado (string) — Prisma.Decimal na implementação */
  valor: string;
  referencia: string | null;
  troco: string | null;
  createdAt: Date;
}

export interface HistoricoEstadoVendaRow {
  id: string;
  tenantId: string;
  vendaId: string;
  estadoAntes: StatusVenda;
  estadoDepois: StatusVenda;
  motivo: string | null;
  userId: string;
  createdAt: Date;
}

export interface VendaRow {
  id: string;
  tenantId: string;
  numero: string;
  origem: OrigemVenda;
  status: StatusVenda;
  clienteId: string | null;
  vendedorId: string;
  sessaoPOSId: string | null;
  sessaoCaixaId: string | null;
  faturaId: string | null;
  // lojaId removido — multi-loja adiado (ADR-0003 A7)
  enderecoEntregaId: string | null; // para ENCOMENDA (#7 owner confirmado)
  dataEntregaPrevista: Date | null;
  /** Decimal serializado (string) — Prisma.Decimal na implementação */
  subtotal: string;
  descontoTotal: string;
  ivaTotal: string;
  total: string;
  currency: string;
  observacoes: string | null;
  dataVenda: Date;
  createdAt: Date;
  updatedAt: Date;
  // Relações carregadas a pedido
  itens?: ItemVendaRow[];
  pagamentos?: PagamentoVendaRow[];
  historicoEstado?: HistoricoEstadoVendaRow[];
}

export interface VendaSummary {
  id: string;
  numero: string;
  origem: OrigemVenda;
  status: StatusVenda;
  clienteId: string | null;
  clienteNome: string | null;
  vendedorId: string;
  /** Decimal serializado (string) */
  total: string;
  dataVenda: Date;
  faturaId: string | null;
}

export interface PaginatedVendas {
  items: VendaSummary[];
  nextCursor: string | null;
}

export interface SessaoPOSRow {
  id: string;
  tenantId: string;
  vendedorId: string;
  sessaoCaixaId: string;
  // lojaId removido (ADR-0003 A7)
  status: StatusSessaoPOS;
  abertoEm: Date;
  fechadoEm: Date | null;
  /** Decimal serializado (string) */
  totalVendas: string;
  numeroPedidos: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Interfaces dos serviços
// ---------------------------------------------------------------------------

export interface IVendaService {
  /**
   * Cria uma Venda dentro de $transaction:
   *  - Gera número de série via WS D: proximoNumeroSerie(tx, 'VENDA', ctx)
   *  - Para POS (origem=POS):
   *      baixarStock(tx, { produtoId, varianteProdutoId, localizacaoOrigemId, quantidade,
   *                         documentoReferenciaId: vendaId, documentoReferenciaTipo: 'Venda' }, ctx)
   *      registarMovimentoCaixa(tx, { sessaoCaixaId, tipo: 'VENDA', valor, descricao,
   *                                    documentoOrigemId: vendaId, documentoOrigemTipo: 'Venda' }, ctx)
   *  - Para ENCOMENDA (origem=ENCOMENDA):
   *      reservarStock por item (WS A)
   *  Lança BusinessRuleError('STOCK_INSUFICIENTE') se stock insuficiente.
   */
  criar(input: CreateVendaInput, ctx: Ctx): Promise<VendaRow>;

  /**
   * Transita o estado da venda validando TRANSICOES_VENDA.
   * Efeitos laterais por transição:
   *  → FATURADA:  emitirFatura (WS D) + baixarStock se ENCOMENDA (WS A)
   *  → DEVOLVIDA: emitirNotaCredito (WS D) + entradaStock (WS A)
   *  → CANCELADA: libertarStock se reserva activa (WS A)
   * Regista HistoricoEstadoVenda em todas as transições.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se transição fora do mapa.
   */
  transitar(input: TransitarVendaInput, ctx: Ctx): Promise<VendaRow>;

  buscarPorId(id: string, ctx: Ctx): Promise<VendaRow>;
  listar(filtros: FilterVendaInput, ctx: Ctx): Promise<PaginatedVendas>;
  atualizar(id: string, input: UpdateVendaInput, ctx: Ctx): Promise<VendaRow>;
}

export interface ISessaoPOSService {
  /**
   * Abre uma sessão POS. Lança BusinessRuleError('SESSAO_JA_ABERTA') se já existe
   * sessão ABERTA para o vendedor no tenant.
   * sessaoCaixaId deve referir uma SessaoCaixa ABERTA (WS D).
   */
  abrir(input: AbrirSessaoPOSInput, ctx: Ctx): Promise<SessaoPOSRow>;

  /**
   * Fecha a sessão POS validando TRANSICOES_SESSAO_POS.
   * Lança BusinessRuleError('SESSAO_COM_VENDAS_PENDENTES') se existirem Vendas PENDENTE.
   */
  fechar(input: FecharSessaoPOSInput, ctx: Ctx): Promise<SessaoPOSRow>;

  suspender(sessaoPOSId: string, ctx: Ctx): Promise<SessaoPOSRow>;
  retomar(sessaoPOSId: string, ctx: Ctx): Promise<SessaoPOSRow>;
  obterAtual(ctx: Ctx): Promise<SessaoPOSRow | null>;
  buscarPorId(id: string, ctx: Ctx): Promise<SessaoPOSRow>;
}
