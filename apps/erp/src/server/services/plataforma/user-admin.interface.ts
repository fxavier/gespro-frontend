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
  /**
   * Primeiro login bem sucedido (ADR-0013 §5-bis). «Por activar» é `null` —
   * o convite foi enviado mas a pessoa nunca entrou. Substitui o
   * `UserInvite.acceptedAt` sem chamada de rede por linha.
   */
  primeiroAcessoEm: Date | null;
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
export interface CriacaoUtilizador {
  utilizador: UserRow;
  /** Só no modo `palavra-passe`; não volta em nenhuma leitura posterior. */
  palavraPasseInicial: string | null;
}

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
   * Convida um colaborador: identidade no Keycloak (sem palavra-passe, acções
   * pendentes), User local com papéis, e-mail de acções (ADR-0013 §5-bis).
   * Operação atómica do lado Postgres: User + UserRole em `$transaction`.
   * Lança `BusinessRuleError('EMAIL_JA_REGISTADO')` se o email já existir em
   * QUALQUER tenant — o email é único em todo o sistema (CONTEXT.md).
   */
  /**
   * Devolve o utilizador e, no modo `palavra-passe`, a temporária gerada —
   * UMA vez, fora do modelo persistido (ADR-0030 §2).
   */
  criarUtilizador(input: CreateUserInput, ctx: Ctx): Promise<CriacaoUtilizador>;
  /** Nova palavra-passe temporária, devolvida uma vez (ADR-0030 §6). */
  reporPalavraPasse(userId: string, ctx: Ctx): Promise<string>;

  /**
   * Actualiza nome/estado. Email e palavra-passe são da Identidade (Keycloak)
   * e não se editam aqui; mudanças de `ativo` sincronizam os dois lados.
   */
  actualizarUtilizador(userId: string, input: UpdateUserInput, ctx: Ctx): Promise<UserRow>;

  /**
   * Soft-delete do utilizador: desactiva no Keycloak (com logout de sessões)
   * e localmente (deletedAt + ativo=false).
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
