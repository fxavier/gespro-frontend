// Interface — Serviço de Alocação (WS F)
// Porta as funções puras de src/services/transporte-alocacao.service.ts para Prisma.
// Wave 1: apenas tipos e assinaturas; implementação na Wave 2.

import 'server-only';

// ============================================================
// Tipos de entrada (subconjuntos de modelos Prisma)
// ============================================================

/** Documento com estado calculado (conflito #20: calculado, nunca editável pelo cliente). */
export interface DocumentoComEstado {
  id: string;
  dataValidade: Date;
  /** Apenas em DocumentoViatura; DocumentoMotorista não tem este campo. */
  prazoAlertaDias?: number;
  estado: 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';
}

/** Referência mínima de Atividade para detecção de conflitos. */
export interface AtividadeRef {
  id: string;
  codigo: string;
  dataInicioPrevista: Date;
  dataConclusaoPrevista: Date | null;
  estado: 'PLANEADA' | 'EM_CURSO' | 'SUSPENSA' | 'CONCLUIDA' | 'CANCELADA';
  viaturaId: string | null;
  motoristaResponsavelId: string | null;
  titulo: string;
}

/** Resultado de validação — estrutura idêntica ao serviço legado. */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/** Conflito de agenda detectado. */
export interface ConflictResult {
  atividadeId: string;
  atividadeCodigo: string;
  dataInicio: Date;
  dataFim: Date | undefined;
  descricao: string;
}

/** Viatura com os campos mínimos necessários para validar alocação. */
export interface ViaturaParaAlocacao {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  documentos: DocumentoComEstado[];
  /** Checklist mais recente; ausente = sem inspecção registada. */
  checklist?: {
    dataInspeccao: Date;
    itens: Array<{ nome: string; estado: 'OK' | 'AVARIA' | 'FALTA' }>;
  } | null;
}

/** Motorista com os campos mínimos necessários para validar alocação. */
export interface MotoristaParaAlocacao {
  id: string;
  nomeCompleto: string;
  validadeCarta: Date;
  disponibilidade: {
    disponivel: boolean;
    motivo?: string | null;
  } | null;
}

// ============================================================
// Tipos de função (assinaturas do serviço — property-test-ready)
// ============================================================

/**
 * Calcula o estado de um documento com base na data de validade e prazo de alerta.
 *
 * - 'EXPIRADO'        → dataValidade < hoje
 * - 'PROXIMO_EXPIRAR' → dataValidade ∈ [hoje, hoje + prazoAlertaDias]
 * - 'VALIDO'          → dataValidade > hoje + prazoAlertaDias
 *
 * Pure function — determinística; property-test-ready (conflito #20).
 */
export type CalcularEstadoDocumentoFn = (
  dataValidade: Date,
  prazoAlertaDias: number,
) => 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';

/**
 * Verifica conflitos de agenda para uma viatura ou motorista.
 * Atividades com estado CONCLUIDA ou CANCELADA são ignoradas.
 *
 * Pure function — property-test-ready.
 */
export type VerificarConflitosAgendaFn = (
  entidadeId: string,
  tipo: 'viatura' | 'motorista',
  dataInicio: Date,
  dataFim: Date | undefined,
  atividades: AtividadeRef[],
) => ConflictResult[];

/**
 * Valida se uma viatura pode ser alocada a uma atividade.
 *
 * Ordem de verificações:
 * 1. Documentos EXPIRADO → bloqueia (lista de erros)
 * 2. Checklist mais recente com itens AVARIA/FALTA → bloqueia
 * 3. Conflitos de agenda → bloqueia
 *
 * Pure function — property-test-ready (conflito #20).
 */
export type ValidarAlocacaoViaturaFn = (
  viatura: ViaturaParaAlocacao,
  dataInicio: Date,
  dataFim?: Date,
  atividadesExistentes?: AtividadeRef[],
) => ValidationResult;

/**
 * Valida se um motorista pode ser alocado a uma atividade.
 *
 * Ordem de verificações:
 * 1. Carta de condução expirada → bloqueia
 * 2. Disponibilidade = false → bloqueia com motivo
 * 3. Conflitos de agenda → bloqueia
 *
 * Pure function — property-test-ready (conflito #20).
 */
export type ValidarAlocacaoMotoristaFn = (
  motorista: MotoristaParaAlocacao,
  dataInicio: Date,
  dataFim?: Date,
  atividadesExistentes?: AtividadeRef[],
) => ValidationResult;

/** Contrato do serviço de alocação (implementado na Wave 2). */
export interface IAlocacaoService {
  calcularEstadoDocumento: CalcularEstadoDocumentoFn;
  verificarConflitosAgenda: VerificarConflitosAgendaFn;
  validarAlocacaoViatura: ValidarAlocacaoViaturaFn;
  validarAlocacaoMotorista: ValidarAlocacaoMotoristaFn;
}
