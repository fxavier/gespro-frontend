// Interface do serviço de Contagem e Reconciliação de Stock (WS A — Spec 05)
// Distinto do inventário físico de ativos (inventario-fisico.service.ts).
import 'server-only';

import type {
  AbrirContagemInput,
  RegistarItemInput,
  JustificarItemInput,
  FilterContagem,
} from '@/lib/validations/inventario-contagem';
import type { Ctx, PaginatedResult } from '@/server/services/types';

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface ItemContagemStockDto {
  id: string;
  tenantId: string;
  contagemId: string;
  produtoId: string;
  localizacaoId: string;
  /** Decimal serializado como string */
  saldoSistema: string;
  /** Decimal serializado como string; null enquanto não contado */
  quantidadeContada: string | null;
  /** Decimal serializado como string; null enquanto não contado */
  diferenca: string | null;
  status: string;
  justificativa: string | null;
  movimentoStockId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContagemStockDto {
  id: string;
  tenantId: string;
  numero: string;
  localizacaoId: string | null;
  categoriaId: string | null;
  cega: boolean;
  status: string;
  responsavelId: string;
  aprovadoPorId: string | null;
  dataAbertura: Date;
  dataConclusao: Date | null;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContagemDetalhe extends ContagemStockDto {
  itens: ItemContagemStockDto[];
  totalItens: number;
  itensPendentes: number;
  itensContados: number;
  itensComDiferenca: number;
}

export interface ReconciliacaoResultado {
  contagemId: string;
  ajustesGerados: number;
  itensIgnorados: number;  // já ajustados (idempotência)
  totalEntradas: string;   // Decimal string
  totalSaidas: string;     // Decimal string
}

// ─── Máquina de estados ───────────────────────────────────────────────────────

/**
 * Transições válidas de ContagemStock.
 * Exportado para uso em property tests (client-safe via state-machines.ts).
 */
export const TRANSICOES_CONTAGEM: Record<string, string[]> = {
  RASCUNHO:     ['EM_CONTAGEM', 'CANCELADA'],
  EM_CONTAGEM:  ['RECONCILIADA', 'CANCELADA'],
  RECONCILIADA: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA:    [],
  CANCELADA:    [],
} as const;

// ─── Interface do serviço ─────────────────────────────────────────────────────

export interface IContagemStockService {
  /**
   * Abre uma nova sessão de contagem.
   * Faz snapshot de SaldoStock no âmbito (localizacaoId + categoriaId) e cria
   * ItemContagemStock com saldoSistema fixo. Gera número via proximoNumeroSerie.
   * Lança BusinessRuleError('CONTAGEM_EM_ABERTO') se já existir contagem
   * EM_CONTAGEM na mesma localização.
   */
  abrirContagem(input: AbrirContagemInput, ctx: Ctx): Promise<{ id: string; numero: string }>;

  /**
   * Regista a quantidade fisicamente contada num item.
   * Calcula diferenca = quantidadeContada − saldoSistema.
   * Status do item passa a CONTADO.
   */
  registarContagemItem(input: RegistarItemInput, ctx: Ctx): Promise<void>;

  /**
   * Justifica uma discrepância num item (status → JUSTIFICADO).
   */
  justificar(input: JustificarItemInput, ctx: Ctx): Promise<void>;

  /**
   * Reconcilia a contagem: para cada item com diferenca != 0 e não ainda AJUSTADO,
   * chama entradaStock (diferenca > 0) ou baixarStock (diferenca < 0) dentro de
   * uma única $transaction. Grava movimentoStockId em cada item.
   * Status da contagem passa a RECONCILIADA.
   *
   * Lança BusinessRuleError('DISCREPANCIA_SEM_APROVACAO') se diferença percentual
   * acima do limiar e aprovadoPorId ausente.
   * Lança BusinessRuleError('ITENS_PENDENTES') se existirem itens PENDENTE
   * sem justificativa.
   */
  reconciliar(
    contagemId: string,
    opcoes: {
      aprovadoPorId?: string;
      limiarDiscrepanciaPct?: number;
      gerarLancamentoContabilistico?: boolean;
      /** Código PGC da conta de existências (classe 3) */
      contaExistenciasCodigo?: string;
      /** Código PGC da contra-conta de regularização */
      contaVariacaoCodigo?: string;
    },
    ctx: Ctx,
  ): Promise<ReconciliacaoResultado>;

  /**
   * Conclui a contagem (estado final imutável).
   * Apenas permitido a partir de RECONCILIADA.
   */
  concluir(contagemId: string, observacoes: string | undefined, ctx: Ctx): Promise<void>;

  /**
   * Cancela a contagem (qualquer estado não terminal).
   */
  cancelar(contagemId: string, motivo: string, ctx: Ctx): Promise<void>;

  /**
   * Lista contagens com filtros e paginação por cursor.
   */
  listar(filter: FilterContagem, ctx: Ctx): Promise<PaginatedResult<ContagemStockDto>>;

  /**
   * Obtém detalhe completo de uma contagem com itens.
   */
  obter(id: string, ctx: Ctx): Promise<ContagemDetalhe>;
}
