import 'server-only';
import type {
  CreateCentroTrabalhoInput,
  CreateEstruturaProdutoInput,
  UpdateEstruturaProdutoInput,
  FilterEstruturaProdutoInput,
  CreateComponenteBOMInput,
  CreateRoteiroInput,
  UpdateRoteiroInput,
  FilterRoteiroInput,
  CreateOrdemProducaoInput,
  UpdateOrdemProducaoInput,
  FilterOrdemProducaoInput,
  RegistarConsumoInput,
  ExplodirBOMInput,
} from '@/lib/validations/producao';
import type { Ctx, TxClient } from '@/server/services/types';
import type { IStockService } from '@/server/services/inventario/stock.interface';
import type { TipoSerieDocumento } from '@/server/services/financas';

// Re-export Ctx para compatibilidade de importações existentes
export type { Ctx };

// ─────────────────────────────────────────────────────────────────────────────
// Contratos consumidos do WS A (Inventário/Stock) — ADR-0003 B5
// Fonte única: importar IStockService; proibido tipo-espelho local.
// tx é o 1.º parâmetro obrigatório (ADR-0003 ponto 6).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subconjunto de IStockService exposto à produção.
 * ADR-0003 B5: consumidor usa Pick sobre o tipo do fornecedor.
 *
 * Semântica:
 *  - reservarStock(tx, data, ctx) → { reservaId }
 *    Guardar reservaId em ConsumoProducao para uso posterior.
 *  - confirmarConsumoStock(tx, reservaId, ctx) → MovimentoStockDto
 *    Chamado ao CONCLUIR produção; converte reserva em saída de stock.
 *  - libertarStock(tx, reservaId, ctx) → void
 *    Chamado ao CANCELAR; liberta reserva sem gerar movimento de saída.
 *  - entradaStock(tx, data, ctx) → MovimentoStockDto
 *    Produto acabado entra em stock; data inclui localizacaoDestinoId (sem custo).
 */
export type StockContratoA = Pick<
  IStockService,
  'reservarStock' | 'confirmarConsumoStock' | 'libertarStock' | 'entradaStock'
>;

// ─────────────────────────────────────────────────────────────────────────────
// Tipo auxiliar para resultado de explosão BOM
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemExplosaoBOM {
  nivel: number;
  componenteProdutoId: string;
  codigoComponente: string;
  nomeComponente: string;
  categoria: string;
  quantidadeTotal: number;
  unidadeMedida: string;
  custoUnitario: number;
  custoTotal: number;
  tempoLead: number | null;
}

export interface ResultadoCusteio {
  custoMateriais: number;
  custoMaoObra: number;
  custoCentroTrabalho: number;
  custoTotal: number;
  variacaoMateriais: number;  // realizado - estimado
  variacaoMaoObra: number;
  variacaoTotal: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Máquinas de Estado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transições de estado da Ordem de Produção.
 *
 * PLANEADA → LIBERADA: valida disponibilidade de stock (reservarStock via WS A).
 * LIBERADA → EM_PRODUCAO: início efectivo; regista dataInicioReal.
 * EM_PRODUCAO → CONCLUIDA: valida operações concluídas + qualidadeAprovada;
 *   confirma consumos (confirmarConsumoStock por reservaId) + entrada de produto
 *   acabado (entradaStock) — tudo dentro da mesma $transaction.
 * EM_PRODUCAO → PAUSADA: suspensão temporária.
 * PAUSADA → EM_PRODUCAO: retoma.
 * → CANCELADA: libertarStock(reservaId) se LIBERADA ou em PRODUCAO/PAUSADA.
 */
export const TRANSICOES_ORDEM_PRODUCAO: Record<string, string[]> = {
  PLANEADA: ['LIBERADA', 'CANCELADA'],
  LIBERADA: ['EM_PRODUCAO', 'CANCELADA'],
  EM_PRODUCAO: ['CONCLUIDA', 'PAUSADA', 'CANCELADA'],
  PAUSADA: ['EM_PRODUCAO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
} as const;

/**
 * Transições de estado de uma Operação de Ordem (dentro da OrdemProducao).
 */
export const TRANSICOES_OPERACAO_ORDEM: Record<string, string[]> = {
  PENDENTE: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'PAUSADA', 'CANCELADA'],
  PAUSADA: ['EM_ANDAMENTO', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
} as const;

/**
 * Transições de estado do BOM (Estrutura de Produto).
 * ATIVO é o único estado operacional; SUBSTITUIDO é terminal.
 */
export const TRANSICOES_BOM: Record<string, string[]> = {
  RASCUNHO: ['ATIVO', 'INATIVO'],
  ATIVO: ['INATIVO', 'SUBSTITUIDO'],
  INATIVO: ['ATIVO'],
  SUBSTITUIDO: [],
} as const;

/**
 * Transições de estado do Roteiro.
 */
export const TRANSICOES_ROTEIRO: Record<string, string[]> = {
  RASCUNHO: ['EM_REVISAO', 'ATIVO'],
  EM_REVISAO: ['RASCUNHO', 'ATIVO'],
  ATIVO: ['INATIVO', 'SUBSTITUIDO'],
  INATIVO: ['ATIVO'],
  SUBSTITUIDO: [],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ICentroTrabalhoService
// ─────────────────────────────────────────────────────────────────────────────

export interface ICentroTrabalhoService {
  criar(input: CreateCentroTrabalhoInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(id: string, input: Partial<CreateCentroTrabalhoInput>, ctx: Ctx): Promise<void>;

  /** Carga actual (horas reservadas vs. capacidade). */
  cargaActual(
    centroId: string,
    dataInicio: Date,
    dataFim: Date,
    ctx: Ctx,
  ): Promise<{ horasCapacidade: number; horasReservadas: number; percentagemCarga: number }>;

  listar(
    filter: { tipo?: string; ativo?: boolean; cursor?: string; take?: number },
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IEstruturaProdutoService (BOM)
// ─────────────────────────────────────────────────────────────────────────────

export interface IEstruturaProdutoService {
  criar(input: CreateEstruturaProdutoInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(
    id: string,
    input: UpdateEstruturaProdutoInput,
    ctx: Ctx,
  ): Promise<void>;

  /**
   * Adiciona um componente a uma estrutura existente.
   * Conflito #14: VALIDA que o novo componente não cria um ciclo no DAG.
   * Lança BusinessRuleError('CICLO_BOM') se a adição criasse um ciclo.
   * Algoritmo: DFS de detecção de ciclo na árvore de ComponenteBOM.
   */
  adicionarComponente(
    estruturaId: string,
    input: CreateComponenteBOMInput,
    ctx: Ctx,
  ): Promise<{ id: string }>;

  /** Remove um componente (e todos os seus sub-componentes via onDelete: Cascade). */
  removerComponente(componenteId: string, ctx: Ctx): Promise<void>;

  /**
   * Explode a BOM: calcula as quantidades totais de cada material para produzir
   * `quantidade` unidades do produto. Respeita perdaPrevista.
   * Conflito #14: usa topological sort para garantir ordem correcta.
   * Lança BusinessRuleError('CICLO_BOM') se detectar ciclo durante explosão.
   */
  explodir(input: ExplodirBOMInput, ctx: Ctx): Promise<ItemExplosaoBOM[]>;

  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  listar(
    filter: FilterEstruturaProdutoInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IRoteiroService
// ─────────────────────────────────────────────────────────────────────────────

export interface IRoteiroService {
  criar(input: CreateRoteiroInput, ctx: Ctx): Promise<{ id: string }>;
  actualizar(id: string, input: UpdateRoteiroInput, ctx: Ctx): Promise<void>;

  transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void>;

  /** Custo estimado total do roteiro baseado em tempos e custoHora de cada operação. */
  calcularCusto(roteiroId: string, ctx: Ctx): Promise<{ custoTotal: number }>;

  listar(
    filter: FilterRoteiroInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IOrdemProducaoService
// ─────────────────────────────────────────────────────────────────────────────

// Alias para clareza: ORDEM_PRODUCAO é a série usada neste módulo.
export type _SerieOrdemProducao = Extract<TipoSerieDocumento, 'ORDEM_PRODUCAO'>;

export interface IOrdemProducaoService {
  /**
   * Cria uma nova ordem em estado PLANEADA.
   * Gera numero via proximoNumeroSerie(tx, 'ORDEM_PRODUCAO', ctx) do WS D.
   * Assinatura: (tx: TxClient, tipo: TipoSerieDocumento, ctx: Ctx) → string
   */
  criar(
    tx: TxClient,
    input: CreateOrdemProducaoInput,
    ctx: Ctx,
  ): Promise<{ id: string; numero: string }>;

  actualizar(
    id: string,
    input: UpdateOrdemProducaoInput,
    ctx: Ctx,
  ): Promise<void>;

  /**
   * Transita o estado da ordem conforme TRANSICOES_ORDEM_PRODUCAO.
   * Integração com WS A (dentro de $transaction via tx):
   *
   * PLANEADA → LIBERADA:
   *   Para cada material da BOM explodida:
   *     reservaId = await stock.reservarStock(tx, data, ctx)  ← guarda em ConsumoProducao
   * LIBERADA → EM_PRODUCAO: nenhuma integração de stock.
   * EM_PRODUCAO → CONCLUIDA:
   *   1. Valida operacoesOrdem todas CONCLUIDAS.
   *   2. valida qualidadeAprovada = true.
   *   3. Para cada ConsumoProducao com reservaId:
   *        await stock.confirmarConsumoStock(tx, reservaId, ctx)
   *   4. await stock.entradaStock(tx, { produtoId, quantidade, localizacaoDestinoId }, ctx)
   *   5. Regista dataFimReal.
   * → CANCELADA:
   *   Para cada ConsumoProducao com reservaId (se LIBERADA/EM_PRODUCAO/PAUSADA):
   *     await stock.libertarStock(tx, reservaId, ctx)
   *
   * Lança BusinessRuleError('TRANSICAO_INVALIDA') se inválida.
   * Lança BusinessRuleError('STOCK_INSUFICIENTE') se stock insuficiente.
   * Lança BusinessRuleError('OPERACOES_PENDENTES') se CONCLUIDA com ops pendentes.
   * Lança BusinessRuleError('QUALIDADE_NAO_APROVADA') se qualidadeAprovada=false.
   */
  transitarStatus(
    tx: TxClient,
    id: string,
    novoStatus: string,
    stockService: StockContratoA,
    ctx: Ctx,
  ): Promise<void>;

  /**
   * Regista o consumo real de um material durante a produção (append-only).
   * Guarda reservaId (devolvido pelo reservarStock ao LIBERAR) para uso posterior
   * em confirmarConsumoStock ao CONCLUIR.
   */
  registarConsumo(
    input: RegistarConsumoInput,
    ctx: Ctx,
  ): Promise<{ id: string }>;

  /**
   * Actualiza o estado de uma operação da ordem.
   * Ao concluir a última operação, progresso da ordem = 100%.
   */
  transitarOperacao(
    operacaoId: string,
    novoStatus: string,
    tempoRealizado: number,
    ctx: Ctx,
  ): Promise<void>;

  /**
   * Apuramento de custo real vs. estimado para a ordem.
   * Custo real = sum(ConsumoProducao.custoTotal) + custo mão-de-obra das operações.
   */
  apurarCusto(id: string, ctx: Ctx): Promise<ResultadoCusteio>;

  listar(
    filter: FilterOrdemProducaoInput,
    ctx: Ctx,
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;

  obter(id: string, ctx: Ctx): Promise<unknown>;
}
