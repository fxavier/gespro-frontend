'use server';
/**
 * Server Actions — catálogo de planos (ADR-0049 §1–§5, #526).
 *
 * Só para o administrador de plataforma: `createSafeAction({ plataforma: true })` — sem o papel
 * `plataforma-admin` respondem NAO_ENCONTRADO, não correm em contexto de tenant e não são
 * travadas pela Leitura de nenhum tenant. O autor (o `sub` do Keycloak, que é o `id` da sessão
 * só-plataforma) segue para o serviço e fica no trilho `AuditoriaPlataforma`.
 */
import { createSafeAction } from '@/server/safe-action';
import { planoAdminService } from '@/server/services/plataforma/plano-admin.service';
import {
  PlanoActualizarSchema,
  PlanoCriarSchema,
  PlanoIdSchema,
} from '@/lib/validations/planos';

/** A lista da área e o catálogo público (`GET /api/publico/planos`) mudam com qualquer escrita. */
const REVALIDAR = { paths: ['/plataforma/planos', '/api/publico/planos'] };

export const listarPlanosAdmin = createSafeAction({
  plataforma: true,
  handler: async () => planoAdminService.listarPlanosAdmin(),
});

export const criarPlano = createSafeAction({
  plataforma: true,
  schema: PlanoCriarSchema,
  revalidate: REVALIDAR,
  handler: async (input, ctx) => planoAdminService.criarPlano(input, { keycloakSub: ctx.userId }),
});

export const actualizarPlano = createSafeAction({
  plataforma: true,
  schema: PlanoActualizarSchema,
  revalidate: REVALIDAR,
  handler: async ({ id, ...campos }, ctx) =>
    planoAdminService.actualizarPlano(id, campos, { keycloakSub: ctx.userId }),
});

export const arquivarPlano = createSafeAction({
  plataforma: true,
  schema: PlanoIdSchema,
  revalidate: REVALIDAR,
  handler: async ({ id }, ctx) => planoAdminService.arquivarPlano(id, { keycloakSub: ctx.userId }),
});

export const desarquivarPlano = createSafeAction({
  plataforma: true,
  schema: PlanoIdSchema,
  revalidate: REVALIDAR,
  handler: async ({ id }, ctx) => planoAdminService.desarquivarPlano(id, { keycloakSub: ctx.userId }),
});

export const apagarPlano = createSafeAction({
  plataforma: true,
  schema: PlanoIdSchema,
  revalidate: REVALIDAR,
  handler: async ({ id }, ctx) => {
    await planoAdminService.apagarPlano(id, { keycloakSub: ctx.userId });
    return { id };
  },
});
