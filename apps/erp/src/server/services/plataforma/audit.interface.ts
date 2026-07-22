import 'server-only';
import type { Page } from '@/server/db/paginate';
import type { FilterAuditLogInput } from '@/lib/validations/plataforma';

// ---------------------------------------------------------------------------
// Contexto de serviço — nunca vem do cliente
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Tipos de resposta
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  tenantId: string;
  userId: string | null;
  /** Nome do utilizador (join com User.nome). Null se userId=null (acção de sistema). */
  userNome: string | null;
  /** Acção executada. Convenção: 'CREATE' | 'UPDATE' | 'DELETE' | 'TRANSICAO' | 'LOGIN' | … */
  action: string;
  /** Tipo de entidade afectada. Ex.: 'Venda', 'Fatura', 'User'. */
  entity: string;
  /** ID da entidade afectada. Null quando a acção afecta múltiplas entidades. */
  entityId: string | null;
  /** Snapshot JSON dos dados alterados (formato livre, definido por cada WS). */
  data: Record<string, unknown> | null;
  createdAt: Date;
}

/** Opções de dropdown para o ecrã de filtro. */
export interface AuditFiltrosDisponiveis {
  /** Tipos de entidade únicos com registos no tenant. */
  entidades: string[];
  /** Acções únicas com registos no tenant. */
  accoes: string[];
}

// ---------------------------------------------------------------------------
// Interface de serviço
// ---------------------------------------------------------------------------

/**
 * IAuditService — contrato de LEITURA para o ecrã de auditoria.
 *
 * ESCRITA: a responsabilidade de escrever em AuditLog pertence aos serviços
 * de mutação de cada WS (spec 01, task 8 — hook de auditoria na Wave 0-beta).
 * Este serviço é estritamente read-only.
 *
 * Permissão necessária: `auditoria:ler`
 *
 * Índices usados (já em auth.prisma):
 *   @@index([tenantId, createdAt])        — listagem paginada por data
 *   @@index([tenantId, entity, entityId]) — filtro por entidade
 *
 * Implementação em Wave 2: `src/server/services/plataforma/audit.service.ts`
 * Rota de leitura: Server Component chama o serviço directamente (não Route Handler).
 * Route Handler /api/audit/export/route.ts para exportação CSV (Wave 2).
 */
export interface IAuditService {
  /**
   * Lista entradas do AuditLog com paginação cursor e filtros.
   * Ordenação: createdAt DESC (mais recente primeiro).
   * O join com User.nome é feito via select explícito (sem relação pesada).
   */
  listar(filter: FilterAuditLogInput, ctx: Ctx): Promise<Page<AuditLogRow>>;

  /**
   * Obtém uma entrada específica de auditoria pelo id.
   * Cross-tenant → `NotFoundError`.
   */
  obter(auditLogId: string, ctx: Ctx): Promise<AuditLogRow>;

  /**
   * Retorna os valores únicos de `entity` e `action` presentes no tenant.
   * Usado para popular os dropdowns de filtro no ecrã de auditoria.
   * Resultado pode ser cached agressivamente (muda raramente).
   */
  filtrosDisponiveis(ctx: Ctx): Promise<AuditFiltrosDisponiveis>;
}
