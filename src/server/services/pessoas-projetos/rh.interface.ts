import 'server-only';
import type {
  CreateColaboradorInput,
  UpdateColaboradorInput,
  FilterColaboradorInput,
  CreateAusenciaInput,
  UpdateAusenciaInput,
  CreateFeriasInput,
  CreateSolicitacaoFeriasInput,
  AprovarSolicitacaoFeriasInput,
  CreateRegistoAssiduidadeInput,
  FilterAssiduidadeInput,
  CreateAvaliacaoInput,
  UpdateAvaliacaoInput,
  CreateFormacaoInput,
  UpdateFormacaoInput,
} from '@/lib/validations/rh';
// ADR-0003 Partilhado: Ctx e TxClient têm fonte única em @/server/services/types.
import type { Ctx, TxClient } from '@/server/services/types';

// Re-export Ctx para compatibilidade de importações existentes
export type { Ctx, TxClient };

// ─────────────────────────────────────────────────────────────────────────────
// Máquinas de Estado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transições de estado do Colaborador.
 * Máquina conservadora: um colaborador inactivo não transita directamente para
 * FERIAS; tem de ser activado primeiro.
 */
export const TRANSICOES_COLABORADOR: Record<string, string[]> = {
  ACTIVO: ['INACTIVO', 'FERIAS', 'AFASTADO'],
  PERIODO_EXPERIMENTAL: ['ACTIVO', 'INACTIVO'],
  FERIAS: ['ACTIVO'],
  AFASTADO: ['ACTIVO', 'INACTIVO'],
  INACTIVO: [],
} as const;

/**
 * Transições de estado da Solicitação de Férias.
 * Apenas o aprovador (gestor/RH) pode mover de PENDENTE para APROVADA/REJEITADA.
 * A própria chefe pode cancelar antes de a aprovação ocorrer.
 */
export const TRANSICOES_SOLICITACAO_FERIAS: Record<string, string[]> = {
  PENDENTE: ['APROVADA', 'REJEITADA', 'CANCELADA'],
  APROVADA: ['CANCELADA'],
  REJEITADA: [],
  CANCELADA: [],
} as const;

/**
 * Transições de estado da Ausência.
 */
export const TRANSICOES_AUSENCIA: Record<string, string[]> = {
  PENDENTE: ['APROVADA', 'REJEITADA'],
  APROVADA: [],
  REJEITADA: [],
} as const;

/**
 * Transições de estado da Avaliação de Desempenho.
 */
export const TRANSICOES_AVALIACAO: Record<string, string[]> = {
  PENDENTE: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
} as const;

/**
 * Transições de estado da Formação.
 */
export const TRANSICOES_FORMACAO: Record<string, string[]> = {
  PLANEADA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// IColaboradorService
// ─────────────────────────────────────────────────────────────────────────────

export interface IColaboradorService {
  /**
   * Cria um novo colaborador. Valida unicidade de BI, NUIT e email no tenant.
   */
  criar(input: CreateColaboradorInput, ctx: Ctx): Promise<{ id: string }>;

  /**
   * Actualiza dados de um colaborador. Código não é alterável após criação.
   */
  actualizar(
    id: string,
    input: UpdateColaboradorInput,
    ctx: Ctx,
  ): Promise<{ id: string }>;

  /**
   * Transita o estado do colaborador. Regista em AuditLog.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
   */
  transitarStatus(
    id: string,
    novoStatus: string,
    ctx: Ctx,
  ): Promise<void>;

  /**
   * Soft delete: preenche deletedAt. Não apaga da base de dados.
   */
  arquivar(id: string, ctx: Ctx): Promise<void>;

  /** Busca paginada por cursor. */
  listar(
    filter: FilterColaboradorInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;

  /** Detalhe por ID com relações necessárias para a UI. */
  obter(id: string, ctx: Ctx): Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IFeriasService
// ─────────────────────────────────────────────────────────────────────────────

export interface IFeriasService {
  /**
   * Inicia um novo período aquisitivo de férias para o colaborador.
   * Um colaborador só pode ter um período activo por ano.
   */
  iniciarPeriodo(input: CreateFeriasInput, ctx: Ctx): Promise<{ id: string }>;

  /**
   * Submete solicitação de gozo de férias. Valida se os dias solicitados
   * não excedem os dias disponíveis no período.
   */
  solicitar(
    input: CreateSolicitacaoFeriasInput,
    ctx: Ctx,
  ): Promise<{ id: string }>;

  /**
   * Aprova ou rejeita uma solicitação de férias.
   * Ao aprovar: desconta diasSolicitados de diasDisponíveis (dentro de $transaction).
   * Transita o status conforme TRANSICOES_SOLICITACAO_FERIAS.
   */
  aprovar(input: AprovarSolicitacaoFeriasInput, ctx: Ctx): Promise<void>;

  /** Cancela uma solicitação aprovada (restitui dias ao saldo). */
  cancelarSolicitacao(solicitacaoId: string, ctx: Ctx): Promise<void>;

  /** Saldo de férias do colaborador no período activo. */
  obterSaldo(colaboradorId: string, ctx: Ctx): Promise<{
    diasDisponiveis: number;
    diasUsados: number;
    diasPendentes: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAusenciaService
// ─────────────────────────────────────────────────────────────────────────────

export interface IAusenciaService {
  registar(input: CreateAusenciaInput, ctx: Ctx): Promise<{ id: string }>;
  aprovar(id: string, input: UpdateAusenciaInput, ctx: Ctx): Promise<void>;
  listar(
    filter: {
      colaboradorId?: string;
      status?: string;
      dataInicio?: Date;
      dataFim?: Date;
      cursor?: string;
      take?: number;
    },
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAssiduidadeService
// ─────────────────────────────────────────────────────────────────────────────

export interface IAssiduidadeService {
  /**
   * Regista ponto de um colaborador. Lança BusinessRuleError('REGISTO_DUPLICADO')
   * se já existir registo para o mesmo colaborador+data.
   * Calcula automaticamente horasTrabalhadas e horasExtras.
   */
  registarPonto(
    input: CreateRegistoAssiduidadeInput,
    ctx: Ctx,
  ): Promise<{ id: string }>;

  /** Resumo mensal de assiduidade do colaborador. */
  resumoMensal(
    colaboradorId: string,
    mes: number,
    ano: number,
    ctx: Ctx,
  ): Promise<{
    totalDias: number;
    diasPresente: number;
    totalHorasTrabalhadas: number;
    totalHorasExtras: number;
    totalAtrasos: number;
    ausencias: number;
  }>;

  listar(
    filter: FilterAssiduidadeInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IAvaliacaoService
// ─────────────────────────────────────────────────────────────────────────────

export interface IAvaliacaoService {
  criar(input: CreateAvaliacaoInput, ctx: Ctx): Promise<{ id: string }>;

  /**
   * Actualiza critérios e notas durante EM_ANDAMENTO.
   * Lança BusinessRuleError('AVALIACAO_FECHADA') se status != EM_ANDAMENTO.
   */
  actualizar(id: string, input: UpdateAvaliacaoInput, ctx: Ctx): Promise<void>;

  /**
   * Transita o estado da avaliação.
   * Ao CONCLUIR: calcula notaFinal ponderada e regista dataConclusao.
   */
  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  listar(
    filter: {
      colaboradorId?: string;
      status?: string;
      tipo?: string;
      cursor?: string;
      take?: number;
    },
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IFormacaoService
// ─────────────────────────────────────────────────────────────────────────────

export interface IFormacaoService {
  criar(input: CreateFormacaoInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(id: string, input: UpdateFormacaoInput, ctx: Ctx): Promise<void>;

  /**
   * Inscreve um colaborador numa formação. Valida vagas disponíveis.
   * Lança BusinessRuleError('VAGAS_ESGOTADAS') se não houver vagas.
   */
  inscrever(formacaoId: string, colaboradorId: string, ctx: Ctx): Promise<void>;

  /**
   * Regista presença/ausência e nota final do participante.
   */
  registarResultado(
    formacaoId: string,
    colaboradorId: string,
    status: string,
    notaFinal?: number,
    ctx?: Ctx,
  ): Promise<void>;

  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  listar(
    filter: {
      status?: string;
      modalidade?: string;
      cursor?: string;
      take?: number;
    },
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}
