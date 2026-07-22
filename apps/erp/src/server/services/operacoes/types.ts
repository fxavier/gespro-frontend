// Re-exporta tipos partilhados (ADR-0003 ponto 6: fonte única em @/server/services/types).
// As interfaces do WS F importam Ctx/TxClient/PaginatedResult daqui ou
// directamente de @/server/services/types.

import 'server-only';

export type { Ctx, TxClient, PaginatedResult } from '@/server/services/types';
