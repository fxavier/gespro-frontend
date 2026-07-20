import 'server-only';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';
import type { StatusReconciliacao, TipoPartida } from './contabilidade.interface';

// ---------------------------------------------------------------------------
// Reconciliação bancária — lógica pura (sem DB) para máquina de estados,
// invariante de balanceamento e sugestão de matches. Testada por property
// tests (fast-check) em __tests__/reconciliacao.helpers.test.ts.
// ---------------------------------------------------------------------------

export type TipoItemReconciliacao = 'LANCAMENTO_CONTABIL' | 'EXTRATO_BANCARIO';

/**
 * Máquina de estados da reconciliação bancária.
 * EM_ANDAMENTO → CONCLUIDA | CANCELADA; CONCLUIDA e CANCELADA são terminais.
 */
export const TRANSICOES_RECONCILIACAO: Record<StatusReconciliacao, StatusReconciliacao[]> = {
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: [],
};

/** Valida transição de estado da reconciliação. Lança BusinessRuleError se inválida. */
export function transitarReconciliacao(
  atual: StatusReconciliacao,
  alvo: StatusReconciliacao,
): void {
  const permitidas = TRANSICOES_RECONCILIACAO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida: ${atual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Invariante de balanceamento
// ---------------------------------------------------------------------------

export interface ItemParaCalculo {
  tipo: string; // TipoItemReconciliacao
  tipoMovimento: TipoPartida;
  valor: Prisma.Decimal;
  conciliado: boolean;
}

/**
 * Sinal com que um item conciliado "explica" a diferença bruta
 * (saldoFinalBanco − saldoFinalContabil), na perspectiva da empresa
 * (conta de classe 1, natureza devedora):
 *
 * - EXTRATO_BANCARIO + DEBITO  → +1 (movimento no banco ainda sem registo no razão)
 * - EXTRATO_BANCARIO + CREDITO → −1
 * - LANCAMENTO_CONTABIL + DEBITO  → −1 (registo no razão ainda sem reflexo no banco)
 * - LANCAMENTO_CONTABIL + CREDITO → +1
 *
 * Um par conciliado razão↔extracto com o mesmo valor e tipoMovimento soma zero —
 * pares casados não alteram a diferença; itens conciliados sem par explicam-na.
 */
export function sinalItem(item: Pick<ItemParaCalculo, 'tipo' | 'tipoMovimento'>): 1 | -1 {
  if (item.tipo === 'EXTRATO_BANCARIO') {
    return item.tipoMovimento === 'DEBITO' ? 1 : -1;
  }
  return item.tipoMovimento === 'DEBITO' ? -1 : 1;
}

/** Soma líquida (com sinal) dos itens conciliados. */
export function calcularAjusteConciliado(itens: ItemParaCalculo[]): Prisma.Decimal {
  let soma = new Prisma.Decimal(0);
  for (const item of itens) {
    if (!item.conciliado) continue;
    soma = sinalItem(item) === 1 ? soma.plus(item.valor) : soma.minus(item.valor);
  }
  return soma;
}

/**
 * Invariante central (Requisito 5.3 / Critério 2):
 * diferencaNaoConciliada = (saldoFinalBanco − saldoFinalContabil) − ajusteConciliado
 */
export function calcularDiferencaNaoConciliada(
  saldoFinalBanco: Prisma.Decimal,
  saldoFinalContabil: Prisma.Decimal,
  itens: ItemParaCalculo[],
): Prisma.Decimal {
  return saldoFinalBanco.minus(saldoFinalContabil).minus(calcularAjusteConciliado(itens));
}

// ---------------------------------------------------------------------------
// Auto-match (sugestões — não persiste)
// ---------------------------------------------------------------------------

export interface ItemParaMatch {
  id: string;
  tipo: string; // TipoItemReconciliacao
  tipoMovimento: TipoPartida;
  valor: Prisma.Decimal;
  data: Date;
  conciliado: boolean;
}

export interface MatchSugerido {
  itemRazaoId: string;
  itemExtratoId: string;
  /** Valor comum do par (Decimal serializado). */
  valor: string;
  /** Distância em dias entre as datas dos dois itens. */
  diasDiferenca: number;
}

const MS_POR_DIA = 86_400_000;

/**
 * Sugere pares LANCAMENTO_CONTABIL ↔ EXTRATO_BANCARIO por igualdade de
 * valor + tipoMovimento e proximidade de data (janela em dias).
 * Greedy determinístico: cada item entra no máximo num par; para cada item do
 * razão escolhe-se o extracto elegível mais próximo em data.
 */
export function sugerirMatchesPuro(itens: ItemParaMatch[], janelaDias: number): MatchSugerido[] {
  const razoes = itens.filter((i) => i.tipo === 'LANCAMENTO_CONTABIL' && !i.conciliado);
  const extratos = itens.filter((i) => i.tipo === 'EXTRATO_BANCARIO' && !i.conciliado);
  const usados = new Set<string>();
  const sugestoes: MatchSugerido[] = [];

  for (const razao of razoes) {
    let melhor: { extrato: ItemParaMatch; dias: number } | null = null;
    for (const extrato of extratos) {
      if (usados.has(extrato.id)) continue;
      if (extrato.tipoMovimento !== razao.tipoMovimento) continue;
      if (!extrato.valor.equals(razao.valor)) continue;
      const dias = Math.abs(extrato.data.getTime() - razao.data.getTime()) / MS_POR_DIA;
      if (dias > janelaDias) continue;
      if (!melhor || dias < melhor.dias) melhor = { extrato, dias };
    }
    if (melhor) {
      usados.add(melhor.extrato.id);
      sugestoes.push({
        itemRazaoId: razao.id,
        itemExtratoId: melhor.extrato.id,
        valor: razao.valor.toFixed(2),
        diasDiferenca: Math.round(melhor.dias),
      });
    }
  }
  return sugestoes;
}
