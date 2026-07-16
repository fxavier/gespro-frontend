'use server';
/**
 * Server Actions — Plataforma (WS G)
 * Todas as mutações via createSafeAction.
 * Leituras: Server Components chamam os serviços directamente.
 *
 * Permissões:
 *   core_tenancy:configurar — gestão de tenants (plataforma)
 *   admin:gerir_utilizadores — CRUD de utilizadores do tenant
 *   admin:gerir_roles       — CRUD de papéis/permissões
 *   admin:ver_auditoria     — sem acções de escrita (só leitura)
 *   analytics:ver           — sem acções de escrita (só leitura via serviço)
 */
import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import { tenantAdminService } from '@/server/services/plataforma/tenant-admin.service';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  ConfiguracaoFiscalSchema,
  CreateUserSchema,
  UpdateUserSchema,
  AssignRoleSchema,
  CreateRoleSchema,
  UpdateRoleSchema,
} from '@/lib/validations/plataforma';

// ---------------------------------------------------------------------------
// Gestão de Tenants — permissão: core_tenancy:configurar (plataforma admin)
// ---------------------------------------------------------------------------

export const criarTenant = createSafeAction({
  schema: CreateTenantSchema,
  permission: 'core_tenancy:configurar',
  revalidate: { tags: ['tenants'] },
  handler: async (input, _ctx) => tenantAdminService.criar(input),
});

export const actualizarTenant = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID de tenant inválido'),
    data: UpdateTenantSchema,
  }),
  permission: 'core_tenancy:configurar',
  revalidate: { tags: ['tenants'] },
  handler: async ({ id, data }, _ctx) => tenantAdminService.actualizar(id, data),
});

export const desactivarTenant = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID de tenant inválido') }),
  permission: 'core_tenancy:configurar',
  revalidate: { tags: ['tenants'] },
  handler: async ({ id }, _ctx) => {
    await tenantAdminService.desactivar(id);
    return { id };
  },
});

export const reactivarTenant = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID de tenant inválido') }),
  permission: 'core_tenancy:configurar',
  revalidate: { tags: ['tenants'] },
  handler: async ({ id }, _ctx) => {
    await tenantAdminService.reactivar(id);
    return { id };
  },
});

// ---------------------------------------------------------------------------
// Configuração Fiscal — permissão: core_tenancy:configurar
// (actualiza o tenant do utilizador autenticado)
// ---------------------------------------------------------------------------

export const actualizarConfiguracaoFiscal = createSafeAction({
  schema: ConfiguracaoFiscalSchema,
  permission: 'core_tenancy:configurar',
  revalidate: { tags: ['tenants', 'configuracao'] },
  handler: async (input, ctx) =>
    tenantAdminService.actualizarConfiguracaoFiscal(ctx.tenantId, input, ctx),
});

// ---------------------------------------------------------------------------
// Gestão de Utilizadores — permissão: admin:gerir_utilizadores
// ---------------------------------------------------------------------------

export const criarUtilizador = createSafeAction({
  schema: CreateUserSchema,
  permission: 'admin:gerir_utilizadores',
  revalidate: { tags: ['utilizadores'] },
  handler: async (input, ctx) => userAdminService.criarUtilizador(input, ctx),
});

export const actualizarUtilizador = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID de utilizador inválido'),
    data: UpdateUserSchema,
  }),
  permission: 'admin:gerir_utilizadores',
  revalidate: { tags: ['utilizadores'] },
  handler: async ({ id, data }, ctx) => userAdminService.actualizarUtilizador(id, data, ctx),
});

export const desactivarUtilizador = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID de utilizador inválido') }),
  permission: 'admin:gerir_utilizadores',
  revalidate: { tags: ['utilizadores'] },
  handler: async ({ id }, ctx) => {
    await userAdminService.desactivarUtilizador(id, ctx);
    return { id };
  },
});

export const atribuirRoles = createSafeAction({
  schema: AssignRoleSchema,
  permission: 'admin:gerir_utilizadores',
  revalidate: { tags: ['utilizadores'] },
  handler: async (input, ctx) => userAdminService.atribuirRoles(input, ctx),
});

// ---------------------------------------------------------------------------
// Gestão de Roles — permissão: admin:gerir_roles
// ---------------------------------------------------------------------------

export const criarRole = createSafeAction({
  schema: CreateRoleSchema,
  permission: 'admin:gerir_roles',
  revalidate: { tags: ['roles'] },
  handler: async (input, ctx) => userAdminService.criarRole(input, ctx),
});

export const actualizarRole = createSafeAction({
  schema: z.object({
    id: z.string().cuid('ID de papel inválido'),
    data: UpdateRoleSchema,
  }),
  permission: 'admin:gerir_roles',
  revalidate: { tags: ['roles'] },
  handler: async ({ id, data }, ctx) => userAdminService.actualizarRole(id, data, ctx),
});

export const removerRole = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID de papel inválido') }),
  permission: 'admin:gerir_roles',
  revalidate: { tags: ['roles'] },
  handler: async ({ id }, ctx) => {
    await userAdminService.removerRole(id, ctx);
    return { id };
  },
});
