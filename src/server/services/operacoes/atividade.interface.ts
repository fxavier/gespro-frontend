// Interface — Serviço de Atividade (entidade central, WS F)
// Máquina de estado + CRUD. Wave 1: tipos, mapa de transições e assinaturas.
//
// Numeração: criarAtividade chama proximoNumeroSerie(tx, 'ATIVIDADE', ctx)
// importado de @/server/services/financas (ADR-0003 decisão 3).
// WS D expandirá TipoSerieDocumento para incluir 'ATIVIDADE'.

import 'server-only';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarAtividadeInput,
  AtualizarAtividadeInput,
  FiltrarAtividadesInput,
} from '@/lib/validations/transporte';

// ============================================================
// Máquina de estado da Atividade
// ============================================================

export type EstadoAtividade =
  | 'PLANEADA'
  | 'EM_CURSO'
  | 'SUSPENSA'
  | 'CONCLUIDA'
  | 'CANCELADA';

/**
 * Mapa de transições válidas da Atividade.
 *
 * Regras de negócio:
 * - PLANEADA → EM_CURSO: exige viatura e motorista alocados e com documentos válidos
 * - EM_CURSO → SUSPENSA: motivo obrigatório no EventoAtividade
 * - SUSPENSA → EM_CURSO: reativa (pode trocar viatura/motorista)
 * - EM_CURSO | SUSPENSA → CONCLUIDA: regista dataFimReal
 * - PLANEADA | EM_CURSO | SUSPENSA → CANCELADA: regista motivo
 * - CONCLUIDA e CANCELADA são terminais (sem transições)
 *
 * Property tests (Wave 2): nenhuma sequência de transições válidas atinge estado inválido;
 * toda a transição fora do mapa lança BusinessRuleError('TRANSICAO_INVALIDA').
 */
export const TRANSICOES_ATIVIDADE: Readonly<Record<EstadoAtividade, ReadonlyArray<EstadoAtividade>>> = {
  PLANEADA:  ['EM_CURSO', 'CANCELADA'],
  EM_CURSO:  ['SUSPENSA', 'CONCLUIDA', 'CANCELADA'],
  SUSPENSA:  ['EM_CURSO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

// ============================================================
// Shapes de retorno
// ============================================================

export interface AtividadeResumo {
  id: string;
  tenantId: string;
  codigo: string;
  titulo: string;
  tipoActividade: string;
  localActividade: string;
  dataInicioPrevista: Date;
  dataConclusaoPrevista: Date | null;
  dataInicioReal: Date | null;
  dataConclusaoReal: Date | null;
  prioridade: string;
  estado: EstadoAtividade;
  motoristaResponsavelId: string | null;
  viaturaId: string | null;
  criadoPorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventoAtividadeRef {
  id: string;
  tenantId: string;
  atividadeId: string;
  data: Date;
  estadoAnterior: EstadoAtividade | null;
  estadoNovo: EstadoAtividade;
  utilizadorId: string;
  descricao: string;
}

export interface AtividadeDetalhe extends AtividadeResumo {
  descricao: string | null;
  observacoes: string | null;
  anexos: string[];
  historico: EventoAtividadeRef[];
}

// ============================================================
// Contrato do serviço (implementado na Wave 2)
// ============================================================

export interface IAtividadeService {
  /**
   * Valida e executa uma transição de estado.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa.
   * Lança BusinessRuleError('VIATURA_COM_DOCUMENTOS_EXPIRADOS') ao iniciar.
   * Lança BusinessRuleError('MOTORISTA_INDISPONIVEL') ao iniciar.
   * Regista EventoAtividade (append-only).
   */
  transitarAtividade(
    atividadeId: string,
    estadoAlvo: EstadoAtividade,
    descricao: string,
    ctx: Ctx,
  ): Promise<AtividadeDetalhe>;

  /**
   * Cria nova Atividade com número sequencial via proximoNumeroSerie(tx, 'ATIVIDADE', ctx)
   * de @/server/services/financas. Gera código AT-YYYY-NNNN dentro de $transaction.
   */
  criarAtividade(
    input: CriarAtividadeInput,
    ctx: Ctx,
  ): Promise<AtividadeDetalhe>;

  obterAtividade(id: string, ctx: Ctx): Promise<AtividadeDetalhe>;

  listarAtividades(
    filtros: FiltrarAtividadesInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<AtividadeResumo>>;

  atualizarAtividade(
    id: string,
    input: AtualizarAtividadeInput,
    ctx: Ctx,
  ): Promise<AtividadeDetalhe>;
}
