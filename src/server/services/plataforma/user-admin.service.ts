import 'server-only';
import { hash } from '@node-rs/argon2';
import { prismaBase } from '@/server/db/client';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import type {
  CreateUserInput,
  UpdateUserInput,
  FilterUserInput,
  AssignRoleInput,
  CreateRoleInput,
  UpdateRoleInput,
} from '@/lib/validations/plataforma';
import type { IUserAdminService, UserRow, RoleRow, PermissionRow } from './user-admin.interface';

// ---------------------------------------------------------------------------
// Tipos auxiliares (evitar importar tipos gerados complexos)
// ---------------------------------------------------------------------------

type PrismaPermission = { id: string; code: string; descricao: string | null };

type PrismaRoleWithPerms = {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{ permission: PrismaPermission }>;
};

type PrismaUserWithRoles = {
  id: string;
  tenantId: string;
  nome: string;
  email: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  roles: Array<{ role: PrismaRoleWithPerms }>;
};

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------

function mapPerm(p: PrismaPermission): PermissionRow {
  return { id: p.id, code: p.code, descricao: p.descricao };
}

function mapRole(r: PrismaRoleWithPerms): RoleRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    nome: r.nome,
    descricao: r.descricao,
    isSystem: r.isSystem,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    permissions: r.permissions.map((rp) => mapPerm(rp.permission)),
  };
}

function mapUser(u: PrismaUserWithRoles): UserRow {
  return {
    id: u.id,
    tenantId: u.tenantId,
    nome: u.nome,
    email: u.email,
    ativo: u.ativo,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    deletedAt: u.deletedAt,
    roles: u.roles.map((ur) => mapRole(ur.role)),
    permissoes: [
      ...new Set(u.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    ],
  };
}

// Inclusão de roles+permissões padrão para queries de utilizadores
const USER_INCLUDE = {
  roles: {
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  },
} as const;

// Inclusão de permissões para queries de roles
const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
} as const;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Conta utilizadores activos com o papel ADMIN no tenant.
 * excludeUserId: excluir um utilizador da contagem (para o guard de desactivação).
 */
async function contarAdminsAtivos(
  tenantId: string,
  opts?: { excludeUserId?: string; excludeRoleId?: string },
): Promise<number> {
  return prismaBase.user.count({
    where: {
      tenantId,
      ativo: true,
      deletedAt: null,
      ...(opts?.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      roles: {
        some: {
          role: {
            nome: 'ADMIN',
            tenantId,
            ...(opts?.excludeRoleId ? { id: { not: opts.excludeRoleId } } : {}),
          },
        },
      },
    },
  });
}

async function findUser(userId: string, ctx: Ctx): Promise<PrismaUserWithRoles> {
  const user = await prismaBase.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
    include: USER_INCLUDE,
  });
  if (!user) throw new NotFoundError('Utilizador não encontrado');
  return user as unknown as PrismaUserWithRoles;
}

async function findRole(roleId: string, ctx: Ctx): Promise<PrismaRoleWithPerms> {
  const role = await prismaBase.role.findFirst({
    where: { id: roleId, tenantId: ctx.tenantId },
    include: ROLE_INCLUDE,
  });
  if (!role) throw new NotFoundError('Papel não encontrado');
  return role as unknown as PrismaRoleWithPerms;
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export const userAdminService: IUserAdminService = {
  // ---- Utilizadores ----

  async listarUtilizadores(filter: FilterUserInput, ctx: Ctx) {
    return paginate(
      async ({ take, cursor, skip }) => {
        const users = await prismaBase.user.findMany({
          take,
          ...(cursor ? { cursor, skip } : {}),
          where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            ...(filter.ativo !== undefined ? { ativo: filter.ativo } : {}),
            ...(filter.roleId ? { roles: { some: { roleId: filter.roleId } } } : {}),
            ...(filter.search
              ? {
                  OR: [
                    { nome: { contains: filter.search, mode: 'insensitive' } },
                    { email: { contains: filter.search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          include: USER_INCLUDE,
          orderBy: { createdAt: 'desc' },
        });
        return users.map((u) => mapUser(u as unknown as PrismaUserWithRoles));
      },
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obterUtilizador(userId: string, ctx: Ctx) {
    return mapUser(await findUser(userId, ctx));
  },

  async criarUtilizador(input: CreateUserInput, ctx: Ctx) {
    // Verificar unicidade de email no tenant
    const existing = await prismaBase.user.findFirst({
      where: { tenantId: ctx.tenantId, email: input.email, deletedAt: null },
    });
    if (existing) {
      throw new BusinessRuleError('EMAIL_DUPLICADO', 'Email já existe neste tenant');
    }

    // Verificar que os roles existem e pertencem ao tenant
    const roles = await prismaBase.role.findMany({
      where: { id: { in: input.roleIds }, tenantId: ctx.tenantId },
    });
    if (roles.length !== input.roleIds.length) {
      throw new NotFoundError('Um ou mais papéis não existem neste tenant');
    }

    const passwordHash = await hash(input.password);

    const user = await prismaBase.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          nome: input.nome,
          email: input.email,
          passwordHash,
          ativo: input.ativo ?? true,
        },
      });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: u.id, roleId })),
      });
      return u;
    });

    return mapUser(await findUser(user.id, ctx));
  },

  async actualizarUtilizador(userId: string, input: UpdateUserInput, ctx: Ctx) {
    await findUser(userId, ctx); // garante que existe e pertence ao tenant

    if (input.email) {
      const conflict = await prismaBase.user.findFirst({
        where: { tenantId: ctx.tenantId, email: input.email, id: { not: userId }, deletedAt: null },
      });
      if (conflict) throw new BusinessRuleError('EMAIL_DUPLICADO', 'Email já existe neste tenant');
    }

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) data.nome = input.nome;
    if (input.email !== undefined) data.email = input.email;
    if (input.ativo !== undefined) data.ativo = input.ativo;
    if (input.password) data.passwordHash = await hash(input.password);

    await prismaBase.user.update({ where: { id: userId }, data });
    return mapUser(await findUser(userId, ctx));
  },

  async desactivarUtilizador(userId: string, ctx: Ctx) {
    const user = await findUser(userId, ctx);

    // Não permitir desactivar o próprio utilizador
    if (userId === ctx.userId) {
      throw new BusinessRuleError('AUTO_DESACTIVACAO', 'Não pode desactivar o próprio utilizador');
    }

    // Guarda ULTIMO_ADMIN (Wave 3): impede desactivar o último admin activo do tenant
    const temRoleAdmin = user.roles.some((ur) => ur.role.nome === 'ADMIN');
    if (temRoleAdmin) {
      const adminsRestantes = await contarAdminsAtivos(ctx.tenantId, { excludeUserId: userId });
      if (adminsRestantes === 0) {
        throw new BusinessRuleError(
          'ULTIMO_ADMIN',
          'Não é possível desactivar o último administrador do tenant',
        );
      }
    }

    await prismaBase.user.update({
      where: { id: userId },
      data: { ativo: false, deletedAt: new Date() },
    });
  },

  async atribuirRoles(input: AssignRoleInput, ctx: Ctx) {
    await findUser(input.userId, ctx);

    const roles = await prismaBase.role.findMany({
      where: { id: { in: input.roleIds }, tenantId: ctx.tenantId },
    });
    if (roles.length !== input.roleIds.length) {
      throw new NotFoundError('Um ou mais papéis não existem neste tenant');
    }

    await prismaBase.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: input.userId } });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: input.userId, roleId })),
      });
    });

    return mapUser(await findUser(input.userId, ctx));
  },

  // ---- Roles ----

  async listarRoles(ctx: Ctx) {
    const roles = await prismaBase.role.findMany({
      where: { tenantId: ctx.tenantId },
      include: ROLE_INCLUDE,
      orderBy: { nome: 'asc' },
    });
    return roles.map((r) => mapRole(r as unknown as PrismaRoleWithPerms));
  },

  async obterRole(roleId: string, ctx: Ctx) {
    return mapRole(await findRole(roleId, ctx));
  },

  async criarRole(input: CreateRoleInput, ctx: Ctx) {
    const existing = await prismaBase.role.findFirst({
      where: { tenantId: ctx.tenantId, nome: input.nome },
    });
    if (existing) throw new BusinessRuleError('ROLE_DUPLICADO', 'Papel com este nome já existe');

    const allPerms = input.permissionCodes.length > 0
      ? await prismaBase.permission.findMany({ where: { code: { in: input.permissionCodes } } })
      : [];
    const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p]));

    const role = await prismaBase.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: { tenantId: ctx.tenantId, nome: input.nome, descricao: input.descricao },
      });
      if (allPerms.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissionCodes
            .filter((code) => permByCode[code])
            .map((code) => ({ roleId: r.id, permissionId: permByCode[code].id })),
          skipDuplicates: true,
        });
      }
      return r;
    });

    return mapRole(await findRole(role.id, ctx));
  },

  async actualizarRole(roleId: string, input: UpdateRoleInput, ctx: Ctx) {
    await findRole(roleId, ctx);

    await prismaBase.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (input.nome !== undefined) data.nome = input.nome;
      if (input.descricao !== undefined) data.descricao = input.descricao;
      if (Object.keys(data).length > 0) {
        await tx.role.update({ where: { id: roleId }, data });
      }

      if (input.permissionCodes !== undefined) {
        const allPerms = input.permissionCodes.length > 0
          ? await prismaBase.permission.findMany({ where: { code: { in: input.permissionCodes } } })
          : [];
        const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p]));

        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (allPerms.length > 0) {
          await tx.rolePermission.createMany({
            data: input.permissionCodes
              .filter((code) => permByCode[code])
              .map((code) => ({ roleId, permissionId: permByCode[code].id })),
            skipDuplicates: true,
          });
        }
      }
    });

    return mapRole(await findRole(roleId, ctx));
  },

  async removerRole(roleId: string, ctx: Ctx) {
    const role = await findRole(roleId, ctx);
    if (role.isSystem) {
      throw new BusinessRuleError('ROLE_SISTEMA', 'Papéis de sistema não podem ser removidos');
    }

    // Guarda ULTIMO_ADMIN (Wave 3): se este role for o único a conferir estado ADMIN no tenant,
    // e a sua remoção deixaria o tenant sem admins activos, bloqueia.
    // Verifica: há admins activos cuja única relação com ADMIN seria via este roleId?
    // Implementação: após excluir este role da contagem, quantos admins ficam?
    const adminsRestantes = await contarAdminsAtivos(ctx.tenantId, { excludeRoleId: roleId });
    const totalAdmins = await contarAdminsAtivos(ctx.tenantId);
    if (totalAdmins > 0 && adminsRestantes === 0) {
      throw new BusinessRuleError(
        'ULTIMO_ADMIN',
        'Não é possível remover o papel que confere acesso de administrador ao último administrador',
      );
    }

    // Cascade: RolePermission + UserRole eliminados pelo onDelete: Cascade do schema
    await prismaBase.role.delete({ where: { id: roleId } });
  },

  // ---- Catálogo de Permissões ----

  async listarPermissoes() {
    const perms = await prismaBase.permission.findMany({ orderBy: { code: 'asc' } });
    return perms.map(mapPerm);
  },
};
