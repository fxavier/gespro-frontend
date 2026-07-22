// Tipos do módulo de inventário (WS A)
// Re-exporta os tipos partilhados e acrescenta os específicos do módulo.
import 'server-only';

export type { Ctx, TxClient, PaginatedResult } from '@/server/services/types';

/**
 * Códigos de erro de regra de negócio estáveis para o módulo de inventário.
 * Lançados via BusinessRuleError (src/lib/errors.ts).
 */
export type BusinessRuleCode =
  | 'TRANSICAO_INVALIDA'
  | 'STOCK_INSUFICIENTE'
  | 'STOCK_JA_RESERVADO'
  | 'RESERVA_NAO_ENCONTRADA'
  | 'ATIVO_EM_USO'
  | 'INVENTARIO_EM_ANDAMENTO'
  | 'AMORTIZACAO_JA_CALCULADA'
  | 'ATIVO_NAO_ENCONTRADO'
  | 'PRODUTO_NAO_ENCONTRADO'
  | 'LOCALIZACAO_NAO_ENCONTRADA';
