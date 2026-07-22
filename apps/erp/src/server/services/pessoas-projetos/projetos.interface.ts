import 'server-only';
import type {
  CreateProjetoInput,
  UpdateProjetoInput,
  FilterProjetoInput,
  CreateTarefaInput,
  UpdateTarefaInput,
  FilterTarefaInput,
  ReordenarTarefaInput,
  CreateTimesheetInput,
  FilterTimesheetInput,
  CreateMarcoInput,
  CreateOrcamentoProjetoInput,
  CreateEquipaInput,
  UpdateEquipaInput,
  AddMembroEquipaInput,
} from '@/lib/validations/projetos';
// ADR-0003 Partilhado: Ctx e TxClient têm fonte única em @/server/services/types.
import type { Ctx, TxClient } from '@/server/services/types';

// Re-export Ctx para compatibilidade de importações existentes
export type { Ctx, TxClient };

// ─────────────────────────────────────────────────────────────────────────────
// Máquinas de Estado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transições de estado do Projecto.
 * PLANEAMENTO → EM_ANDAMENTO ao libertar recursos/tarefas.
 * Projectos CONCLUIDOS ou CANCELADOS são terminais.
 */
export const TRANSICOES_PROJETO: Record<string, string[]> = {
  PLANEAMENTO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['PAUSADO', 'CONCLUIDO', 'CANCELADO'],
  PAUSADO: ['EM_ANDAMENTO', 'CANCELADO'],
  CONCLUIDO: ['ARQUIVADO'],
  CANCELADO: ['ARQUIVADO'],
  ARQUIVADO: [],
} as const;

/**
 * Transições de estado de Tarefa (Kanban).
 * Conflito #13: suporta drag-and-drop via chave fraccional `posicao`.
 * A transição de coluna (status) e a reordenação dentro da coluna (posicao)
 * são operações independentes no serviço.
 *
 * Regra de negócio:
 * - BLOQUEADA só sai para A_FAZER ou CANCELADA (não pode ir directamente para CONCLUIDA).
 * - EM_REVISAO pode retroceder para EM_PROGRESSO (ciclo de revisão).
 */
export const TRANSICOES_TAREFA: Record<string, string[]> = {
  A_FAZER: ['EM_PROGRESSO', 'CANCELADA'],
  EM_PROGRESSO: ['EM_REVISAO', 'BLOQUEADA', 'CONCLUIDA', 'CANCELADA'],
  EM_REVISAO: ['EM_PROGRESSO', 'CONCLUIDA', 'CANCELADA'],
  BLOQUEADA: ['A_FAZER', 'EM_PROGRESSO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
} as const;

/**
 * Transições de estado do Marco.
 */
export const TRANSICOES_MARCO: Record<string, string[]> = {
  PENDENTE: ['EM_ANDAMENTO', 'ATRASADO'],
  EM_ANDAMENTO: ['CONCLUIDO', 'ATRASADO'],
  ATRASADO: ['CONCLUIDO'],
  CONCLUIDO: [],
} as const;

/**
 * Transições de estado do Orçamento de Projecto.
 */
export const TRANSICOES_ORCAMENTO: Record<string, string[]> = {
  RASCUNHO: ['REVISAO', 'APROVADO'],
  REVISAO: ['RASCUNHO', 'APROVADO', 'REJEITADO'],
  APROVADO: [],
  REJEITADO: ['RASCUNHO'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// IEquipaService
// ─────────────────────────────────────────────────────────────────────────────

export interface IEquipaService {
  criar(input: CreateEquipaInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(id: string, input: UpdateEquipaInput, ctx: Ctx): Promise<void>;

  /**
   * Adiciona um membro a uma equipa. Lança BusinessRuleError('MEMBRO_JA_EXISTE')
   * se o colaborador já pertencer à equipa.
   */
  adicionarMembro(input: AddMembroEquipaInput, ctx: Ctx): Promise<void>;

  /** Remove um membro: preenche dataSaida com hoje e status INATIVO. */
  removerMembro(equipaId: string, colaboradorId: string, ctx: Ctx): Promise<void>;

  listar(
    filter: { search?: string; status?: string; cursor?: string; take?: number },
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IProjetoService
// ─────────────────────────────────────────────────────────────────────────────

export interface IProjetoService {
  criar(input: CreateProjetoInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(id: string, input: UpdateProjetoInput, ctx: Ctx): Promise<void>;

  /**
   * Transita o estado do projecto conforme TRANSICOES_PROJETO.
   * Ao CONCLUIR: valida que todas as tarefas obrigatórias estão CONCLUIDAS.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se inválida.
   */
  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  /** Associa uma equipa ao projecto. */
  associarEquipa(projetoId: string, equipaId: string, ctx: Ctx): Promise<void>;

  /** Remove associação de equipa. */
  desassociarEquipa(projetoId: string, equipaId: string, ctx: Ctx): Promise<void>;

  listar(
    filter: FilterProjetoInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;

  obter(id: string, ctx: Ctx): Promise<unknown>;

  /** Resumo de progresso: tarefas, horas, orçamento. */
  resumo(id: string, ctx: Ctx): Promise<{
    totalTarefas: number;
    tarefasConcluidas: number;
    horasEstimadas: number;
    horasTrabalhadas: number;
    orcamentoPlanejado: number;
    orcamentoUtilizado: number;
    progresso: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITarefaService
// ─────────────────────────────────────────────────────────────────────────────

export interface ITarefaService {
  criar(input: CreateTarefaInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(id: string, input: UpdateTarefaInput, ctx: Ctx): Promise<void>;

  /**
   * Transita o estado de uma tarefa conforme TRANSICOES_TAREFA.
   * Regista data de início real (dataInicio) na primeira transição de A_FAZER.
   * Regista dataFimReal ao CONCLUIR.
   */
  transitarStatus(
    id: string,
    novoStatus: string,
    ctx: Ctx,
  ): Promise<void>;

  /**
   * Reordena uma tarefa no kanban via chave fraccional (drag-and-drop).
   * O cliente calcula a nova posicao fraccional (LexoRank ou similar);
   * o serviço persiste e actualiza progresso do projecto.
   * Pode também mudar o status (mudança de coluna).
   */
  reordenar(input: ReordenarTarefaInput, ctx: Ctx): Promise<void>;

  /**
   * Retorna tarefas de um projecto agrupadas por status (para o kanban).
   */
  listarKanban(
    projetoId: string,
    ctx: Ctx,
  ): Promise<Record<string, unknown[]>>;

  listar(
    filter: FilterTarefaInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;

  obter(id: string, ctx: Ctx): Promise<unknown>;

  /** Adiciona comentário. */
  comentar(tarefaId: string, texto: string, ctx: Ctx): Promise<{ id: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITimesheetService
// ─────────────────────────────────────────────────────────────────────────────

export interface ITimesheetService {
  /**
   * Regista horas. Valida sobreposição de intervalos para o mesmo colaborador+dia.
   * Lança BusinessRuleError('SOBREPOSICAO_HORARIO') em caso de conflito.
   */
  registar(input: CreateTimesheetInput, ctx: Ctx): Promise<{ id: string }>;

  /** Aprovação em lote: marca os registos como aprovados. */
  aprovarLote(ids: string[], ctx: Ctx): Promise<void>;

  /** Totais de horas por projecto/colaborador num período. */
  resumo(
    filter: { projetoId?: string; colaboradorId?: string; dataInicio: Date; dataFim: Date },
    ctx: Ctx,
  ): Promise<{
    totalHoras: number;
    horasFaturaveis: number;
    horasAprovadas: number;
    custoTotal: number;
  }>;

  listar(
    filter: FilterTimesheetInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMarcoService
// ─────────────────────────────────────────────────────────────────────────────

export interface IMarcoService {
  criar(input: CreateMarcoInput, ctx: Ctx): Promise<{ id: string }>;

  /**
   * Transita o estado do marco. Ao CONCLUIR: preenche dataReal.
   * Verifica automaticamente se marcos estão atrasados (dataPrevista < hoje).
   */
  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  listar(
    projetoId: string,
    ctx: Ctx,
  ): Promise<unknown[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IOrcamentoProjetoService
// ─────────────────────────────────────────────────────────────────────────────

export interface IOrcamentoProjetoService {
  criar(input: CreateOrcamentoProjetoInput, ctx: Ctx): Promise<{ id: string }>;

  /** Transita conforme TRANSICOES_ORCAMENTO. */
  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  /**
   * Regista utilização de verba numa categoria.
   * Lança BusinessRuleError('VERBA_INSUFICIENTE') se excede valorPlanejado.
   */
  registarUtilizacao(
    categoriaId: string,
    valor: number,
    descricao: string,
    ctx: Ctx,
  ): Promise<void>;

  obter(projetoId: string, versao: number, ctx: Ctx): Promise<unknown>;
}
