import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Corre `fn` com o contexto de tenant activo. O `tenantId` NUNCA vem do cliente.
 *
 * O `await fn()` acontece DENTRO do `storage.run`: liga a execução da query
 * (o `.then` do PrismaPromise lazy) ao contexto ALS activo. Sem isto, um
 * `() => prisma.x()` cru devolvido do callback só executa no `await` exterior
 * — que, sob streaming RSC (Next 16/Turbopack), pode retomar sem a store e
 * lançar SEM_CONTEXTO_TENANT.
 */
export function runWithTenantContext<T>(
  ctx: TenantContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return storage.run(ctx, async () => fn());
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenantContext(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new AppError('SEM_CONTEXTO_TENANT', 'Operação sobre modelo multi-tenant sem contexto', 500);
  }
  return ctx;
}

// Modelos isolados por tenant — DERIVADOS do schema (dmmf): qualquer modelo com
// campo `tenantId`. Auto-regista todos os módulos sem editar este ficheiro
// partilhado (adicionar um módulo novo nunca toca aqui). Excepções globais são
// modelos que têm `tenantId` mas NÃO devem ser isolados por tenant.
const TENANT_MODEL_EXCECOES = new Set<string>([
  'LoginAttempt', // tenantId opcional — rate limiting é global (detecção cross-tenant)
  // Spec 19 — livros de plataforma, escritos nas fronteiras públicas (registo e
  // webhook Stripe) onde NÃO existe contexto de tenant. `tenantId` é opcional e
  // só é conhecido depois de resolvido/provisionado. Acedidos só via prismaBase.
  'EventoWebhookStripe',
  'ChaveIdempotencia',
]);

export const TENANT_MODELS = new Set<string>(
  Prisma.dmmf.datamodel.models
    .filter((m) => !TENANT_MODEL_EXCECOES.has(m.name) && m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name),
);

// Modelos com soft delete — derivados: qualquer modelo tenant-scoped com
// `deletedAt`. Documentos transaccionais não têm `deletedAt` (cancelam por estado).
export const SOFT_DELETE_MODELS = new Set<string>(
  Prisma.dmmf.datamodel.models
    .filter((m) => TENANT_MODELS.has(m.name) && m.fields.some((f) => f.name === 'deletedAt'))
    .map((m) => m.name),
);

// Operações cujo `where` recebe injecção de tenantId (+ soft delete).
const INJECT_WHERE = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy',
]);
// Operações cujo `data` recebe tenantId.
const INJECT_DATA = new Set(['create', 'createMany', 'createManyAndReturn']);

// ponytail: cobre create* e *Many/first (os footguns reais). findUnique/update/
// delete/upsert por chave única ficam intactos — os serviços scopam por tenant
// explicitamente e devolvem NotFound em cross-tenant. Subir para reescrita
// findUnique→findFirst se algum serviço precisar de isolamento nessas ops.
export const tenantExtension = Prisma.defineExtension({
  name: 'multi-tenant',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);
        const ctx = requireTenantContext();
        const a = (args ?? {}) as Record<string, unknown>;

        if (INJECT_DATA.has(operation)) {
          const d = a.data;
          const withTenant = (x: unknown) => ({ ...(x as object), tenantId: ctx.tenantId });
          a.data = Array.isArray(d) ? d.map(withTenant) : withTenant(d);
        } else if (INJECT_WHERE.has(operation)) {
          a.where = {
            ...(a.where as object),
            tenantId: ctx.tenantId,
            ...(SOFT_DELETE_MODELS.has(model) ? { deletedAt: null } : {}),
          };
        }
        return query(a);
      },
    },
  },
});
