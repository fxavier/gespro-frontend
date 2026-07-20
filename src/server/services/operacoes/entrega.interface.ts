// Interface — Serviço de Entrega (WS F)
// Máquina de estado + CRUD. Wave 1: tipos, mapa de transições e assinaturas.
//
// Numeração: criarEntrega chama proximoNumeroSerie(tx, 'ENTREGA', ctx)
// importado de @/server/services/financas (ADR-0003 decisão 3).
// WS D expandirá TipoSerieDocumento para incluir 'ENTREGA'.
//
// FK escalares cross-WS: clienteId → WS C, vendaId → WS C, produtoId (ItemEntrega) → WS A.

import 'server-only';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarEntregaInput,
  AtualizarEntregaInput,
  TransitarEntregaInput,
  RegistarProvaEntregaInput,
  FiltrarEntregasInput,
} from '@/lib/validations/transporte';

// ============================================================
// Máquina de estado da Entrega
// ============================================================

export type EstadoEntrega =
  | 'PENDENTE'
  | 'AGENDADA'
  | 'EM_TRANSITO'
  | 'ENTREGUE'
  | 'FALHADA'
  | 'CANCELADA';

/**
 * Mapa de transições válidas da Entrega.
 *
 * Regras de negócio:
 * - PENDENTE → AGENDADA: viatura e motorista atribuídos, data agendada confirmada
 * - AGENDADA → EM_TRANSITO: rota iniciada (Rota.estado = ATIVA)
 * - EM_TRANSITO → ENTREGUE: requer comprovante (assinatura/foto/código) via registarProvaEntrega
 * - EM_TRANSITO → FALHADA: motivo obrigatório; incrementa tentativasEntrega
 * - FALHADA → AGENDADA: reagendamento (nova tentativa dentro da política SLA)
 * - FALHADA → CANCELADA: limite de tentativas atingido ou decisão do operador
 * - PENDENTE | AGENDADA → CANCELADA: motivo obrigatório
 * - ENTREGUE e CANCELADA são terminais
 *
 * Property tests (Wave 2): ENTREGUE nunca retroage; FALHADA não conta como ENTREGUE;
 * toda a transição fora do mapa lança BusinessRuleError('TRANSICAO_INVALIDA').
 */
export const TRANSICOES_ENTREGA: Readonly<Record<EstadoEntrega, ReadonlyArray<EstadoEntrega>>> = {
  PENDENTE:    ['AGENDADA', 'CANCELADA'],
  AGENDADA:    ['EM_TRANSITO', 'CANCELADA'],
  EM_TRANSITO: ['ENTREGUE', 'FALHADA'],
  FALHADA:     ['AGENDADA', 'CANCELADA'],
  ENTREGUE:    [],
  CANCELADA:   [],
};

// ============================================================
// Validador de transição (pure function — property-test-ready)
// ============================================================

/**
 * Valida se a transição de `actual` para `alvo` é permitida.
 * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa.
 */
export type TransitarEntregaFn = (actual: EstadoEntrega, alvo: EstadoEntrega) => void;

// ============================================================
// Shapes de retorno
// ============================================================

export interface ItemEntregaRef {
  id: string;
  tenantId: string;
  entregaId: string;
  /** FK escalar cross-WS → WS A Produto */
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  /** Decimal serializado como string */
  peso: string;
  volume: string;
  valor: string;
}

export interface EntregaResumo {
  id: string;
  tenantId: string;
  numero: string;
  /** FK escalar cross-WS → WS C Venda (opcional) */
  vendaId: string | null;
  /** FK escalar cross-WS → WS C Cliente */
  clienteId: string;
  clienteNome: string;
  enderecoEntrega: string;
  cidade: string;
  rotaId: string | null;
  viaturaId: string | null;
  motoristaId: string | null;
  dataAgendada: Date;
  dataEntrega: Date | null;
  estado: EstadoEntrega;
  prioridade: string;
  /** Decimal serializado como string */
  taxaEntrega: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntregaDetalhe extends EntregaResumo {
  clienteTelefone: string;
  observacoes: string | null;
  pesoTotal: string;
  volumeTotal: string;
  valorCarga: string;
  comprovanteTipo: string | null;
  comprovanteDados: string | null;
  comprovanteDataHora: Date | null;
  comprovanteRecebedor: string | null;
  motivoFalha: string | null;
  tentativasEntrega: number;
  itens: ItemEntregaRef[];
}

// ============================================================
// Contrato do serviço (implementado na Wave 2)
// ============================================================

export interface IEntregaService {
  /**
   * Cria entrega com número sequencial via proximoNumeroSerie(tx, 'ENTREGA', ctx)
   * de @/server/services/financas.
   */
  criarEntrega(input: CriarEntregaInput, ctx: Ctx): Promise<EntregaDetalhe>;

  obterEntrega(id: string, ctx: Ctx): Promise<EntregaDetalhe>;

  listarEntregas(
    filtros: FiltrarEntregasInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<EntregaResumo>>;

  atualizarEntrega(
    id: string,
    input: AtualizarEntregaInput,
    ctx: Ctx,
  ): Promise<EntregaDetalhe>;

  /**
   * Valida e executa uma transição de estado da Entrega.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa TRANSICOES_ENTREGA.
   * Lança BusinessRuleError('COMPROVANTE_OBRIGATORIO') ao tentar EM_TRANSITO → ENTREGUE
   *   sem prova de entrega registada.
   * Lança BusinessRuleError('MOTIVO_OBRIGATORIO') ao tentar EM_TRANSITO → FALHADA sem motivo.
   */
  transitarEntrega(
    input: TransitarEntregaInput,
    ctx: Ctx,
  ): Promise<EntregaDetalhe>;

  /**
   * Regista prova de entrega (assinatura, foto ou código) e transita para ENTREGUE.
   * Opera em $transaction: regista prova + transição de estado atomicamente.
   */
  registarProvaEntrega(
    input: RegistarProvaEntregaInput,
    ctx: Ctx,
  ): Promise<EntregaDetalhe>;

  /**
   * Atribui viatura e/ou motorista a uma entrega PENDENTE/AGENDADA.
   */
  atribuirRecursos(
    entregaId: string,
    viaturaId: string | null,
    motoristaId: string | null,
    rotaId: string | null,
    ctx: Ctx,
  ): Promise<EntregaDetalhe>;
}
