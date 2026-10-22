'use server';
/**
 * Server Actions — Plataforma (WS G)
 * Todas as mutações via createSafeAction.
 * Leituras: Server Components chamam os serviços directamente.
 *
 * Permissões:
 *   plataforma: true        — gestão de tenants (administrador de plataforma, #41)
 *   core_tenancy:configurar — dados/configuração fiscal do PRÓPRIO tenant
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
  DadosEmpresaSchema,
  CreateUserSchema,
  UpdateUserSchema,
  AssignRoleSchema,
  CreateRoleSchema,
  UpdateRoleSchema,
} from '@/lib/validations/plataforma';

// ---------------------------------------------------------------------------
// Gestão de Tenants — só o administrador de plataforma (ADR-0049 §5, #41).
// `plataforma: true`: sessão SEM tenant e com o papel `plataforma-admin`; a qualquer
// sessão de tenant (o ADMIN inclusive, que tem `core_tenancy:configurar`) responde
// NAO_ENCONTRADO. O autor (`sub` do Keycloak) fica no trilho `AuditoriaPlataforma`.
// ---------------------------------------------------------------------------

export const criarTenant = createSafeAction({
  plataforma: true,
  schema: CreateTenantSchema,
  revalidate: { tags: ['tenants'] },
  handler: async (input, ctx) => tenantAdminService.criar(input, { keycloakSub: ctx.userId }),
});

export const actualizarTenant = createSafeAction({
  plataforma: true,
  schema: z.object({
    id: z.string().cuid('ID de tenant inválido'),
    data: UpdateTenantSchema,
  }),
  revalidate: { tags: ['tenants'] },
  handler: async ({ id, data }, ctx) =>
    tenantAdminService.actualizar(id, data, { keycloakSub: ctx.userId }),
});

export const desactivarTenant = createSafeAction({
  plataforma: true,
  schema: z.object({ id: z.string().cuid('ID de tenant inválido') }),
  revalidate: { tags: ['tenants'] },
  handler: async ({ id }, ctx) => {
    await tenantAdminService.desactivar(id, { keycloakSub: ctx.userId });
    return { id };
  },
});

export const reactivarTenant = createSafeAction({
  plataforma: true,
  schema: z.object({ id: z.string().cuid('ID de tenant inválido') }),
  revalidate: { tags: ['tenants'] },
  handler: async ({ id }, ctx) => {
    await tenantAdminService.reactivar(id, { keycloakSub: ctx.userId });
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

/**
 * Dados da empresa (#177) — o ecrã `/definicoes/empresa`. O tenant vem SEMPRE da sessão:
 * o schema não tem `id`/`tenantId`, e `slug`/`planoAssinatura`/`statusAtivo` são removidos.
 */
export const actualizarDadosEmpresa = createSafeAction({
  schema: DadosEmpresaSchema,
  permission: 'core_tenancy:configurar',
  revalidate: { paths: ['/definicoes/empresa'], tags: ['tenants', 'configuracao'] },
  handler: async (input, ctx) => tenantAdminService.actualizarDadosEmpresa(input, ctx),
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

/**
 * Repõe a palavra-passe (ADR-0030 §6). A temporária vem no resultado — é
 * mostrada uma vez ao administrador e não fica em lado nenhum.
 */
export const reporPalavraPasse = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID de utilizador inválido') }),
  permission: 'admin:gerir_utilizadores',
  // Escreve — mas só no Keycloak, e por isso não há nada em Postgres para
  // revalidar. É a única action da casa em que o `revalidate` não serve de
  // sinal, daí a declaração explícita: em Leitura não se repõem palavras-passe.
  // Quem estiver em Leitura e precisar disto começa por subscrever um plano.
  permiteEmLeitura: false,
  handler: async ({ id }, ctx) => ({
    palavraPasse: await userAdminService.reporPalavraPasse(id, ctx),
  }),
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

/** #179 — o caminho de volta de `desactivarUtilizador`. */
export const reactivarUtilizador = createSafeAction({
  schema: z.object({ id: z.string().cuid('ID de utilizador inválido') }),
  permission: 'admin:gerir_utilizadores',
  revalidate: { tags: ['utilizadores'] },
  handler: async ({ id }, ctx) => {
    await userAdminService.reactivarUtilizador(id, ctx);
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
