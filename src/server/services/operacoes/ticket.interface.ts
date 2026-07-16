// Interface — Serviço de Ticket (WS F)
// Máquina de estado + SLA + CRUD. Wave 1: apenas tipos, mapa de transições e assinaturas.

// Numeração: criarTicket chama proximoNumeroSerie(tx, 'TICKET', ctx)
// importado de @/server/services/financas (ADR-0003 decisão 3).
// WS D expandirá TipoSerieDocumento para incluir 'TICKET'.

import 'server-only';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarTicketInput,
  AtualizarTicketInput,
  TransitarTicketInput,
  AtribuirTicketInput,
  AvaliarTicketInput,
  FiltrarTicketsInput,
  AdicionarComentarioTicketInput,
  CriarCategoriaTicketInput,
  AtualizarCategoriaTicketInput,
  CriarEquipeSuporteInput,
  AtualizarEquipeSuporteInput,
  CriarArtigoBaseConhecimentoInput,
  AtualizarArtigoBaseConhecimentoInput,
  FiltrarBaseConhecimentoInput,
} from '@/lib/validations/tickets';

// ============================================================
// Máquina de estado do Ticket
// ============================================================

export type EstadoTicket =
  | 'ABERTO'
  | 'EM_PROGRESSO'
  | 'AGUARDANDO_CLIENTE'
  | 'AGUARDANDO_TERCEIRO'
  | 'RESOLVIDO'
  | 'FECHADO'
  | 'CANCELADO';

/**
 * Mapa de transições válidas do Ticket.
 *
 * Regras de negócio:
 * - ABERTO → EM_PROGRESSO: requer agente atribuído (BusinessRuleError 'TICKET_SEM_AGENTE')
 * - EM_PROGRESSO → RESOLVIDO: regista dataResolucao e calcula tempoResolucaoMin
 * - RESOLVIDO → FECHADO: confirma fecho; pode disparar pedido de avaliação
 * - RESOLVIDO | FECHADO → EM_PROGRESSO: reabertura (se permitirReabertura=true)
 * - Qualquer estado não-terminal → CANCELADO
 *
 * Property tests (Wave 2): nenhuma sequência válida reclassifica um CANCELADO;
 * toda a transição fora do mapa lança BusinessRuleError('TRANSICAO_INVALIDA').
 */
export const TRANSICOES_TICKET: Readonly<Record<EstadoTicket, ReadonlyArray<EstadoTicket>>> = {
  ABERTO:              ['EM_PROGRESSO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO', 'CANCELADO'],
  EM_PROGRESSO:        ['AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'CANCELADO'],
  AGUARDANDO_CLIENTE:  ['EM_PROGRESSO', 'RESOLVIDO', 'CANCELADO'],
  AGUARDANDO_TERCEIRO: ['EM_PROGRESSO', 'CANCELADO'],
  RESOLVIDO:           ['FECHADO', 'EM_PROGRESSO'],
  FECHADO:             ['EM_PROGRESSO'],
  CANCELADO:           [],
};

// ============================================================
// SLA — tempos padrão e cálculo
// ============================================================

/** Tempos de SLA padrão por prioridade (em minutos). Sobreposto pela CategoriaTicket. */
export const SLA_PADRAO_MIN: Readonly<Record<string, { resposta: number; resolucao: number }>> = {
  BAIXA:   { resposta: 480,  resolucao: 4320 }, // 8h / 72h
  NORMAL:  { resposta: 240,  resolucao: 2880 }, // 4h / 48h
  ALTA:    { resposta: 120,  resolucao: 1440 }, // 2h / 24h
  URGENTE: { resposta: 60,   resolucao: 480  }, // 1h / 8h
};

export interface SlaCalculado {
  slaTempoResposta: number;
  slaTempoResolucao: number;
  slaDataLimiteResposta: Date;
  slaDataLimiteResolucao: Date;
  slaEmAtraso: boolean;
}

// ============================================================
// Tipos de função para cálculo de SLA (pure — testáveis)
// ============================================================

/**
 * Calcula os campos SLA para um novo ticket.
 * Recebe `agora` como argumento para ser determinística (testável/property-test-ready).
 */
export type CalcularSlaFn = (
  prioridade: string,
  agora: Date,
  categoriaTempos?: { slaTempoResposta: number; slaTempoResolucao: number } | null,
) => SlaCalculado;

/**
 * Recalcula `slaEmAtraso` para um ticket em aberto.
 * Pure function — chamada pelo job de cron.
 */
export type RecalcularSlaEmAtrasaFn = (
  estado: EstadoTicket,
  slaDataLimiteResolucao: Date,
  agora: Date,
) => boolean;

// ============================================================
// Shapes de retorno
// ============================================================

export interface AtividadeTicketRef {
  id: string;
  tipo: string;
  descricao: string;
  detalhes: string | null;
  autorId: string;
  autorNome: string;
  visibilidade: string;
  createdAt: Date;
}

export interface TicketResumo {
  id: string;
  tenantId: string;
  numero: string;
  titulo: string;
  tipo: string;
  categoriaId: string | null;
  prioridade: string;
  estado: EstadoTicket;
  solicitanteId: string;
  solicitanteNome: string;
  atribuidoParaId: string | null;
  atribuidoParaNome: string | null;
  equipeId: string | null;
  /** Polimorfismo opcional (conflito #18). */
  origemTipo: string | null;
  origemId: string | null;
  slaEmAtraso: boolean;
  slaDataLimiteResolucao: Date;
  dataAbertura: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketDetalhe extends TicketResumo {
  descricao: string;
  subcategoria: string | null;
  solicitanteEmail: string;
  solicitanteTelefone: string | null;
  slaTempoResposta: number;
  slaTempoResolucao: number;
  slaDataLimiteResposta: Date;
  dataPrimeiraResposta: Date | null;
  dataResolucao: Date | null;
  dataFechamento: Date | null;
  tempoRespostaMin: number | null;
  tempoResolucaoMin: number | null;
  tempoTotalMin: number | null;
  tags: string[];
  avaliacaoNota: number | null;
  avaliacaoComentario: string | null;
  avaliacaoData: Date | null;
  observacoes: string | null;
  atividades: AtividadeTicketRef[];
}

export interface CategoriaTicketResumo {
  id: string;
  nome: string;
  descricao: string | null;
  slaTempoResposta: number;
  slaTempoResolucao: number;
  ativa: boolean;
}

export interface BaseConhecimentoResumo {
  id: string;
  titulo: string;
  resumo: string | null;
  categoria: string;
  visibilidade: string;
  estado: string;
  util: number;
  visualizacoes: number;
  createdAt: Date;
}

// ============================================================
// Contrato do serviço — Ticket (implementado na Wave 2)
// ============================================================

export interface ITicketService {
  /**
   * Cria um ticket com número sequencial (Wave 2: contador interno;
   * Wave 3: integração com SerieDocumento de WS D).
   * Calcula SLA com base na prioridade e categoria.
   * Regista AtividadeTicket de tipo SISTEMA.
   */
  criarTicket(
    input: CriarTicketInput,
    solicitante: { id: string; nome: string; email: string; telefone?: string },
    ctx: Ctx,
  ): Promise<TicketDetalhe>;

  obterTicket(id: string, ctx: Ctx): Promise<TicketDetalhe>;

  listarTickets(
    filtros: FiltrarTicketsInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<TicketResumo>>;

  atualizarTicket(
    id: string,
    input: AtualizarTicketInput,
    ctx: Ctx,
  ): Promise<TicketDetalhe>;

  /**
   * Transição de estado.
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se fora do mapa.
   * Lança BusinessRuleError('TICKET_SEM_AGENTE') para ABERTO → EM_PROGRESSO sem agente.
   * Regista AtividadeTicket de tipo MUDANCA_STATUS.
   */
  transitarTicket(
    input: TransitarTicketInput,
    autorNome: string,
    ctx: Ctx,
  ): Promise<TicketDetalhe>;

  /**
   * Atribui ticket a agente/equipe.
   * Regista AtividadeTicket de tipo ATRIBUICAO.
   */
  atribuirTicket(
    input: AtribuirTicketInput,
    autorNome: string,
    ctx: Ctx,
  ): Promise<TicketDetalhe>;

  /**
   * Adiciona comentário ou nota interna.
   * Regista AtividadeTicket de tipo COMENTARIO.
   */
  adicionarComentario(
    input: AdicionarComentarioTicketInput,
    autor: { id: string; nome: string },
    ctx: Ctx,
  ): Promise<AtividadeTicketRef>;

  /**
   * Regista avaliação do solicitante após fecho.
   * Lança BusinessRuleError('TICKET_NAO_FECHADO') se não estiver FECHADO.
   */
  avaliarTicket(
    input: AvaliarTicketInput,
    avaliadorId: string,
    ctx: Ctx,
  ): Promise<TicketDetalhe>;
}

// ============================================================
// Contrato do serviço — Categoria de Ticket
// ============================================================

export interface ICategoriaTicketService {
  criarCategoria(input: CriarCategoriaTicketInput, ctx: Ctx): Promise<CategoriaTicketResumo>;
  atualizarCategoria(id: string, input: AtualizarCategoriaTicketInput, ctx: Ctx): Promise<CategoriaTicketResumo>;
  listarCategorias(ctx: Ctx, ativa?: boolean): Promise<CategoriaTicketResumo[]>;
  obterCategoria(id: string, ctx: Ctx): Promise<CategoriaTicketResumo>;
}

// ============================================================
// Contrato do serviço — Equipe de Suporte
// ============================================================

export interface IEquipeSuporteService {
  criarEquipe(input: CriarEquipeSuporteInput, ctx: Ctx): Promise<{ id: string; nome: string }>;
  atualizarEquipe(id: string, input: AtualizarEquipeSuporteInput, ctx: Ctx): Promise<{ id: string; nome: string }>;
  listarEquipes(ctx: Ctx): Promise<Array<{ id: string; nome: string; estado: string }>>;
}

// ============================================================
// Contrato do serviço — Base de Conhecimento
// ============================================================

export interface IBaseConhecimentoService {
  criarArtigo(
    input: CriarArtigoBaseConhecimentoInput,
    autor: { id: string; nome: string },
    ctx: Ctx,
  ): Promise<BaseConhecimentoResumo>;

  atualizarArtigo(
    id: string,
    input: AtualizarArtigoBaseConhecimentoInput,
    ctx: Ctx,
  ): Promise<BaseConhecimentoResumo>;

  listarArtigos(
    filtros: FiltrarBaseConhecimentoInput,
    ctx: Ctx,
  ): Promise<PaginatedResult<BaseConhecimentoResumo>>;

  /** Incrementa contador de visualizações do artigo do tenant. */
  registarVisualizacao(id: string, ctx: Ctx): Promise<void>;

  /** Regista voto de utilidade de um artigo público. */
  votarArtigo(
    id: string,
    voto: 'util' | 'nao_util',
    ctx: Ctx,
  ): Promise<{ util: number; naoUtil: number }>;
}

// CalcularSlaFn e RecalcularSlaEmAtrasaFn já são exportadas nas suas definições acima.
