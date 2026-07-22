// Interface — Serviço de Rota (WS F)
// Máquina de estado + CRUD. Wave 1: tipos, mapa de transições e assinaturas.
//
// Ciclo operacional: Rota.estado começa em PLANEADA, transita para ATIVA quando
// iniciada, pode ser PAUSADA e retomada, e termina em CONCLUIDA ou CANCELADA.

import 'server-only';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarRotaInput,
  AtualizarRotaInput,
  FiltrarRotasInput,
} from '@/lib/validations/transporte';

// ============================================================
// Máquina de estado da Rota
// ============================================================

export type EstadoRota =
  | 'PLANEADA'
  | 'ATIVA'
  | 'PAUSADA'
  | 'CONCLUIDA'
  | 'CANCELADA';

/**
 * Mapa de transições válidas da Rota (conflito #16 resolvido — inclui PAUSADA).
 *
 * Regras de negócio:
 * - PLANEADA → ATIVA: requer viatura e motorista atribuídos e com documentos válidos
 * - ATIVA → PAUSADA: regista motivo; viatura e motorista ficam indisponíveis
 * - PAUSADA → ATIVA: retoma; pode trocar viatura/motorista
 * - ATIVA | PAUSADA → CONCLUIDA: todos os PontoEntrega encerrados (entregue ou falhado com justificação)
 * - PLANEADA | ATIVA | PAUSADA → CANCELADA: regista motivo
 * - CONCLUIDA e CANCELADA são terminais
 *
 * Property tests (Wave 2): nenhuma sequência válida de transições atinge estado inválido;
 * toda a transição fora do mapa lança BusinessRuleError('TRANSICAO_INVALIDA').
 */
export const TRANSICOES_ROTA: Readonly<Record<EstadoRota, ReadonlyArray<EstadoRota>>> = {
  PLANEADA:  ['ATIVA', 'CANCELADA'],
  ATIVA:     ['PAUSADA', 'CONCLUIDA', 'CANCELADA'],
  PAUSADA:   ['ATIVA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

// ============================================================
// Validador de transição (pure function — property-test-ready)
// ============================================================

/**
 * Valida se a transição de `actual` para `alvo` é permitida.
 * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa.
 *
 * Importar {@link BusinessRuleError} de @/lib/errors na implementação.
 */
export type TransitarRotaFn = (actual: EstadoRota, alvo: EstadoRota) => void;

// ============================================================
// Shapes de retorno
// ============================================================

export interface PontoEntregaRef {
  id: string;
  tenantId: string;
  ordem: number;
  tipo: string;
  clienteId: string | null;
  clienteNome: string | null;
  endereco: string;
  cidade: string;
  horaEstimada: Date | null;
  horaChegada: Date | null;
  horaSaida: Date | null;
  estado: string;
  entregaId: string | null;
}

export interface RotaResumo {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  origem: string;
  destino: string;
  viaturaId: string | null;
  motoristaId: string | null;
  dataInicio: Date;
  dataFim: Date | null;
  estado: EstadoRota;
  /** Decimal serializado como string. */
  custoEstimado: string | null;
  custoReal: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RotaDetalhe extends RotaResumo {
  descricao: string | null;
  distanciaTotal: string | null;
  tempoEstimadoMin: number | null;
  tempoRealMin: number | null;
  observacoes: string | null;
  pontos: PontoEntregaRef[];
}

// ============================================================
// Contrato do serviço (implementado na Wave 2)
// ============================================================

export interface IRotaService {
  /**
   * Valida e executa uma transição de estado da Rota.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa TRANSICOES_ROTA.
   * Lança BusinessRuleError('ROTA_SEM_VIATURA') ao tentar PLANEADA → ATIVA sem viatura/motorista.
   * Lança BusinessRuleError('PONTOS_ABERTOS') ao tentar ATIVA → CONCLUIDA com pontos por fechar.
   */
  transitarRota(
    rotaId: string,
    estadoAlvo: EstadoRota,
    ctx: Ctx,
    motivo?: string,
  ): Promise<RotaDetalhe>;

  criarRota(input: CriarRotaInput, ctx: Ctx): Promise<RotaDetalhe>;

  obterRota(id: string, ctx: Ctx): Promise<RotaDetalhe>;

  listarRotas(
    filtros: FiltrarRotasInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<RotaResumo>>;

  atualizarRota(
    id: string,
    input: AtualizarRotaInput,
    ctx: Ctx,
  ): Promise<RotaDetalhe>;

  /**
   * Atribui viatura e/ou motorista a uma rota PLANEADA.
   * Valida disponibilidade e documentos via IAlocacaoService.
   */
  atribuirRecursos(
    rotaId: string,
    viaturaId: string | null,
    motoristaId: string | null,
    ctx: Ctx,
  ): Promise<RotaDetalhe>;
}
