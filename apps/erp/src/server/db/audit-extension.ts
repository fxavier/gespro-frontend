import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { getTenantContext } from './tenant-extension';

// Prisma.InputJsonValue é exportado pelo cliente gerado.
type JsonSafe = Prisma.InputJsonValue;

// ---------------------------------------------------------------------------
// Modelos que são auditados. Domínios acrescentam os seus após merge.
// ---------------------------------------------------------------------------
export const AUDIT_MODELS = new Set<string>([
  'User', 'Role', 'Permission', 'UserRole', 'RolePermission',
]);

/**
 * Entidades críticas: auditoria escrita na MESMA transacção da mutação.
 * Resto é assíncrono (fire-and-forget com log de erro).
 */
export const CRITICAL_ENTITIES = new Set<string>([
  // Serão adicionados na Wave 2: 'LancamentoContabil', 'Fatura', 'MovimentoCaixa'
  'User', 'Role',
]);

// ---------------------------------------------------------------------------
// Utilitário: converte PascalCase (model name) → camelCase (delegate key).
// ---------------------------------------------------------------------------
function toCamelCase(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

// ---------------------------------------------------------------------------
// Factory — recebe o cliente base para escrever AuditLog sem circular dep.
// ---------------------------------------------------------------------------
export function createAuditExtension(base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'audit',
    query: {
      $allModels: {
        // ------------------------------------------------------------------
        // CREATE — regista o novo registo.
        // ------------------------------------------------------------------
        async create({ model, args, query }) {
          const result = await query(args);
          if (!model || !AUDIT_MODELS.has(model)) return result;
          const ctx = getTenantContext();
          if (!ctx) return result;

          const write = base.auditLog.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              entity: model,
              entityId: (result as { id?: string }).id,
              action: 'CREATE',
              data: { after: result as JsonSafe },
            },
          });

          if (CRITICAL_ENTITIES.has(model)) {
            await write;
          } else {
            write.catch((e) => console.error('[audit-extension] create log failed', e));
          }

          return result;
        },

        // ------------------------------------------------------------------
        // UPDATE — captura antes/depois.
        // ------------------------------------------------------------------
        async update({ model, args, query }) {
          if (!model || !AUDIT_MODELS.has(model)) return query(args);
          const ctx = getTenantContext();

          // Busca estado anterior via modelo dinâmico (base sem extensão).
          let before: unknown = undefined;
          try {
            const delegate = (base as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[toCamelCase(model)];
            if (delegate && args.where) {
              before = await delegate.findFirst({ where: args.where });
            }
          } catch { /* silencioso — auditoria não bloqueia mutação */ }

          const result = await query(args);
          if (!ctx) return result;

          const write = base.auditLog.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              entity: model,
              entityId: (result as { id?: string }).id,
              action: 'UPDATE',
              data: { before: before as JsonSafe, after: result as JsonSafe },
            },
          });

          if (CRITICAL_ENTITIES.has(model)) {
            await write;
          } else {
            write.catch((e) => console.error('[audit-extension] update log failed', e));
          }

          return result;
        },

        // ------------------------------------------------------------------
        // DELETE — captura o registo antes de apagar.
        // ------------------------------------------------------------------
        async delete({ model, args, query }) {
          if (!model || !AUDIT_MODELS.has(model)) return query(args);
          const ctx = getTenantContext();

          let before: unknown = undefined;
          try {
            const delegate = (base as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[toCamelCase(model)];
            if (delegate && args.where) {
              before = await delegate.findFirst({ where: args.where });
            }
          } catch { /* silencioso */ }

          const result = await query(args);
          if (!ctx) return result;

          const entityId = (before as { id?: string })?.id ?? (result as { id?: string })?.id;

          const write = base.auditLog.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              entity: model,
              entityId,
              action: 'DELETE',
              data: { before: before as JsonSafe, after: null },
            },
          });

          if (CRITICAL_ENTITIES.has(model)) {
            await write;
          } else {
            write.catch((e) => console.error('[audit-extension] delete log failed', e));
          }

          return result;
        },
      },
    },
  });
}
