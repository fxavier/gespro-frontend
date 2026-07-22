// Tipos partilhados por todos os serviços de domínio (WS A–G)
// ADR-0003 ponto 6: fonte única — consumidores importam daqui, não criam espelhos locais.
import 'server-only';
import type { Prisma } from '@prisma/client';

/**
 * Contexto de execução injectado pelas actions.
 * tenantId nunca vem do cliente; é sempre do JWT da sessão.
 */
export interface Ctx {
  tenantId: string;
  userId: string;
}

/**
 * Cliente de transacção Prisma.
 * ADR-0003 ponto 6: nos contratos transaccionais (entradaStock, baixarStock,
 * reservarStock, confirmarConsumoStock, libertarStock) o `tx` é o 1.º parâmetro OBRIGATÓRIO.
 */
export type TxClient = Prisma.TransactionClient;

/**
 * Resultado paginado por cursor (cursor-based pagination).
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}
