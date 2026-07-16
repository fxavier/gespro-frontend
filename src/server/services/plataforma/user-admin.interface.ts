import 'server-only';
import type { Page } from '@/server/db/paginate';
import type {
  CreateUserInput,
  UpdateUserInput,
  FilterUserInput,
  AssignRoleInput,
  CreateRoleInput,
  UpdateRoleInput,
} from '@/lib/validations/plataforma';

// ---------------------------------------------------------------------------
// Tipos de resposta (Wave 1 — sem tipos Prisma gerados)
// ---------------------------------------------------------------------------

export interface PermissionRow {
  id: string;
  /** Formato `modulo:accao`. Ex.: 'vendas:criar', 'stock:ler'. */
  code: string;
  descricao: string | null;
}

export interface RoleRow {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string | null;
  /** Roles de sistema não podem ser removidos. */
  isSystem: boolean;
  permissions: PermissionRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  roles: RoleRow[];
  /** Conjunto de codes de permissão efectiva (flatten de roles). */
  permissoes: string[];
}

// ---------------------------------------------------------------------------
// Contexto de serviço — nunca vem do cliente
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Interface de serviço
// ---------------------------------------------------------------------------

/**
 * IUserAdminService — gestão de utilizadores e roles do tenant.
 *
 * Permissão base: `utilizadores:gerir` para operações sobre utilizadores;
 * `roles:gerir` para operações sobre roles.
 * O tenantId vem sempre do contexto — nunca do cliente.
 *
 * Implementação em Wave 2: `src/server/services/plataforma/user-admin.service.ts`
 */
export interface IUserAdminService {
  // -------------------------------------------------------------------------
  // Utilizadores
  // -------------------------------------------------------------------------

  /**
   * Lista utilizadores do tenant com paginação e filtros.
   * Soft delete: utilizadores com deletedAt nunca aparecem nas listagens.
   */
  listarUtilizadores(filter: FilterUserInput, ctx: Ctx): Promise<Page<UserRow>>;

  /**
   * Obtém um utilizador por id, verificando que pertence ao tenant.
   * Cross-tenant → `NotFoundError` (nunca 403).
   */
  obterUtilizador(userId: string, ctx: Ctx): Promise<UserRow>;

  /**
   * Cria utilizador no tenant, faz hash da password com argon2 e associa roles.
   * Operação atómica: User + UserRole em `$transaction`.
   * Lança `BusinessRuleError('EMAIL_DUPLICADO')` se email já existir no tenant.
   */
  criarUtilizador(input: CreateUserInput, ctx: Ctx): Promise<UserRow>;

  /**
   * Actualiza campos do utilizador. Se `password` for fornecida, gera novo hash.
   * Não permite alterar o email para um já existente no tenant.
   */
  actualizarUtilizador(userId: string, input: UpdateUserInput, ctx: Ctx): Promise<UserRow>;

  /**
   * Soft-delete do utilizador: preenche deletedAt e ativo=false.
   * Não permite desactivar o próprio utilizador autenticado.
   * Lança `BusinessRuleError('ULTIMO_ADMIN')` se for o único admin do tenant.
   */
  desactivarUtilizador(userId: string, ctx: Ctx): Promise<void>;

  /**
   * Substitui atomicamente todos os roles do utilizador pelos fornecidos.
   * DELETE * FROM UserRole WHERE userId + INSERT dos novos, numa transacção.
   * Lança `BusinessRuleError('ULTIMO_ADMIN')` se a operação deixaria o tenant sem admins.
   */
  atribuirRoles(input: AssignRoleInput, ctx: Ctx): Promise<UserRow>;

  // -------------------------------------------------------------------------
  // Roles
  // -------------------------------------------------------------------------

  /** Lista todos os roles do tenant incluindo permissões associadas. */
  listarRoles(ctx: Ctx): Promise<RoleRow[]>;

  /**
   * Obtém um role por id, verificando que pertence ao tenant.
   * Cross-tenant → `NotFoundError`.
   */
  obterRole(roleId: string, ctx: Ctx): Promise<RoleRow>;

  /**
   * Cria um role para o tenant e associa as permissões pelos codes fornecidos.
   * Lança `BusinessRuleError('ROLE_DUPLICADO')` se nome já existir no tenant.
   */
  criarRole(input: CreateRoleInput, ctx: Ctx): Promise<RoleRow>;

  /**
   * Actualiza nome/descrição e/ou re-sincroniza a lista de permissões.
   * Se permissionCodes for fornecido, substitui toda a lista (delete + insert).
   */
  actualizarRole(roleId: string, input: UpdateRoleInput, ctx: Ctx): Promise<RoleRow>;

  /**
   * Remove um role e todos os UserRole associados.
   * Lança `BusinessRuleError('ROLE_SISTEMA')` se `isSystem=true`.
   * Lança `BusinessRuleError('ULTIMO_ADMIN')` se a remoção deixaria o tenant sem admins.
   */
  removerRole(roleId: string, ctx: Ctx): Promise<void>;

  // -------------------------------------------------------------------------
  // Catálogo de Permissões (global, sem tenant)
  // -------------------------------------------------------------------------

  /**
   * Lista todas as Permission disponíveis no catálogo global.
   * Resultado é estático após seed; pode ser cached de forma agressiva.
   */
  listarPermissoes(): Promise<PermissionRow[]>;
}
