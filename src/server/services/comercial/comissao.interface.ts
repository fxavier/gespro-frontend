/**
 * Interface de serviço — Comissões (WS C)
 * ADR-0003: import 'server-only'; Ctx/TxClient de types.ts; TRANSICOES_COMISSAO (A6).
 * Decimal fields como string (ADR A9 — evita imprecisão float JS).
 *
 * Portado de src/services/comissao.service.ts com:
 *  - CRUD de RegraComissao
 *  - Cálculo por escalões e metas
 *  - Registo dentro de $transaction
 *  - Relatórios por vendedor/período
 */
import 'server-only';

import type {
  CreateRegraComissaoInput,
  UpdateRegraComissaoInput,
  FilterRegraComissaoInput,
  FilterComissaoInput,
} from '@/lib/validations/vendas';
import { BusinessRuleError } from '@/lib/errors';

// ADR-0003 ponto 6: Ctx e TxClient de fonte única
import type { Ctx, TxClient } from '@/server/services/types';
export type { Ctx, TxClient };

// ---------------------------------------------------------------------------
// Tipos de estado (string literal — compatíveis com enum Prisma StatusComissao)
// ---------------------------------------------------------------------------

export type StatusComissao = 'PENDENTE' | 'APROVADA' | 'PAGA' | 'CANCELADA';
export type TipoRegraComissao =
  | 'FIXA'
  | 'ESCALONADA'
  | 'POR_CATEGORIA'
  | 'POR_META'
  | 'POR_PERIODO';

// ---------------------------------------------------------------------------
// Máquina de estado — Comissao (ADR-0003 A6)
// ---------------------------------------------------------------------------

/**
 * Mapa de transições válidas por estado de Comissao.
 *
 * PENDENTE  → APROVADA   (aprovação pelo gestor)
 * PENDENTE  → CANCELADA  (cancelamento — ex: venda cancelada)
 * APROVADA  → PAGA       (pagamento processado)
 * APROVADA  → CANCELADA  (cancelamento após aprovação)
 * PAGA      → []         (terminal)
 * CANCELADA → []         (terminal)
 */
export const TRANSICOES_COMISSAO: Record<StatusComissao, StatusComissao[]> = {
  PENDENTE: ['APROVADA', 'CANCELADA'],
  APROVADA: ['PAGA', 'CANCELADA'],
  PAGA: [],       // terminal
  CANCELADA: [],  // terminal
};

/**
 * Valida transição de estado da Comissao.
 * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
 */
export function transitarComissao(actual: StatusComissao, alvo: StatusComissao): void {
  const permitidas = TRANSICOES_COMISSAO[actual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de Comissao: ${actual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
      { estadoActual: actual, estadoAlvo: alvo, permitidas },
    );
  }
}

// ---------------------------------------------------------------------------
// Tipos de resultado (Wave 2: substituir por tipos Prisma gerados)
// Decimal fields serialized as string (ADR A9).
// ---------------------------------------------------------------------------

export interface RegraComissaoRow {
  id: string;
  tenantId: string;
  nome: string;
  tipo: TipoRegraComissao;
  vendedorId: string | null;   // null = regra global
  categoriaId: string | null;  // FK escalar → CategoriaProduto (WS A)
  /** Decimal serializado (string) — Prisma.Decimal na implementação */
  percentualBase: string;
  percentualBonus: string | null;
  valorMinimo: string | null;
  valorMaximo: string | null;
  quantidadeMinima: string | null;
  metaPercentual: string | null;
  dataInicio: Date | null;
  dataFim: Date | null;
  prioridade: number;
  descricao: string;
  ativa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComissaoRow {
  id: string;
  tenantId: string;
  vendaId: string;
  vendedorId: string;
  regraComissaoId: string | null;
  /** Decimal serializado (string) — Prisma.Decimal na implementação */
  percentualAplicado: string;
  valorBase: string;
  valorComissao: string;
  regrasAplicadas: string[];
  detalhes: string | null;
  status: StatusComissao;
  pagoEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Resultado do cálculo antes de persistir (ainda não é uma ComissaoRow). */
export interface CalculoComissaoResult {
  vendedorId: string;
  vendaId: string;
  /** Valor de base sobre o qual incide a comissão (total da venda) — string decimal */
  valorBase: string;
  percentualAplicado: string;
  valorComissao: string;
  regrasAplicadas: string[];
  detalhes: string;
}

export interface DashboardComissoes {
  /** Todos os valores monetários como string decimal (ADR A9) */
  totalMes: string;
  totalPendente: string;
  totalAprovado: string;
  totalPago: string;
  percentualMeta: number;
  ranking: number;
  numeroVendas: number;
}

export interface EstatisticasVendedor {
  vendedorId: string;
  totalVendas: string;
  totalComissoes: string;
  numeroVendas: number;
  ticketMedio: string;
  metaAtingida: number;   // percentual (ex: 125 = 125%)
  ranking: number;
}

export interface RelatorioComissoesPeriodo {
  dataInicio: Date;
  dataFim: Date;
  vendedorId?: string;
  totalComissoes: string;
  totalPago: string;
  totalPendente: string;
  porVendedor: Array<{
    vendedorId: string;
    totalComissoes: string;
    totalPago: string;
    totalPendente: string;
    numeroVendas: number;
  }>;
}

export interface PaginatedComissoes {
  items: ComissaoRow[];
  nextCursor: string | null;
}

export interface PaginatedRegrasComissao {
  items: RegraComissaoRow[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Interface do serviço
// ---------------------------------------------------------------------------

export interface IComissaoService {
  // --- Regras ---
  criarRegra(input: CreateRegraComissaoInput, ctx: Ctx): Promise<RegraComissaoRow>;
  atualizarRegra(id: string, input: UpdateRegraComissaoInput, ctx: Ctx): Promise<RegraComissaoRow>;
  ativarDesativarRegra(id: string, ativa: boolean, ctx: Ctx): Promise<RegraComissaoRow>;
  buscarRegra(id: string, ctx: Ctx): Promise<RegraComissaoRow>;
  listarRegras(filtro: FilterRegraComissaoInput, ctx: Ctx): Promise<PaginatedRegrasComissao>;

  // --- Cálculo ---
  /**
   * Calcula comissão para uma venda, aplicando regras por ordem de prioridade.
   * Escaladas substituem a percentual base; por_meta adicionam bónus.
   * Não persiste — resultado passado a registarComissao dentro de $transaction.
   * valorVenda e itens.valor como string decimal (ADR A9).
   */
  calcularComissao(
    vendedorId: string,
    vendaId: string,
    valorVenda: string,
    itens?: Array<{ categoriaId: string; valor: string }>,
    ctx?: Ctx,
  ): Promise<CalculoComissaoResult>;

  /**
   * Simula comissão sem persistir (preview na UI antes de fechar venda).
   */
  simularComissao(
    vendedorId: string,
    valorVenda: string,
    categoriaId?: string,
    ctx?: Ctx,
  ): Promise<Pick<
    CalculoComissaoResult,
    'percentualAplicado' | 'valorComissao' | 'regrasAplicadas' | 'detalhes'
  >>;

  // --- Registo (dentro de $transaction) ---
  /**
   * Persiste comissão calculada. Chamado pelo VendaService dentro de $transaction.
   * tx é TxClient (Prisma.TransactionClient na implementação Wave 2).
   */
  registarComissao(
    tx: TxClient,
    calculo: CalculoComissaoResult,
    ctx: Ctx,
  ): Promise<ComissaoRow>;

  // --- Gestão (com validação via TRANSICOES_COMISSAO) ---
  listar(filtro: FilterComissaoInput, ctx: Ctx): Promise<PaginatedComissoes>;

  /**
   * PENDENTE → APROVADA.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se estado não for PENDENTE.
   */
  aprovar(id: string, ctx: Ctx): Promise<ComissaoRow>;

  /**
   * APROVADA → PAGA.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se estado não for APROVADA.
   */
  marcarPaga(id: string, ctx: Ctx): Promise<ComissaoRow>;

  /**
   * PENDENTE|APROVADA → CANCELADA.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se estado for terminal (PAGA|CANCELADA).
   */
  cancelar(id: string, motivo: string, ctx: Ctx): Promise<ComissaoRow>;

  // --- Relatórios ---
  dashboard(vendedorId: string | undefined, ctx: Ctx): Promise<DashboardComissoes>;
  estatisticasVendedor(
    vendedorId: string,
    periodo?: { inicio: Date; fim: Date },
    ctx?: Ctx,
  ): Promise<EstatisticasVendedor>;
  relatorioPeriodo(
    periodo: { inicio: Date; fim: Date },
    vendedorId?: string,
    ctx?: Ctx,
  ): Promise<RelatorioComissoesPeriodo>;
}
