import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockTx = {
    user: { create: vi.fn() },
    userRole: { createMany: vi.fn(), deleteMany: vi.fn() },
    role: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    rolePermission: { createMany: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    mockTx,
    userFindFirst: vi.fn(),
    userFindMany: vi.fn(),
    userCount: vi.fn(), // Wave 3: contarAdminsAtivos
    userUpdate: vi.fn(),
    roleFindFirst: vi.fn(),
    roleFindMany: vi.fn(),
    roleDelete: vi.fn(),
    permFindMany: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  };
});

vi.mock('@node-rs/argon2', () => ({ hash: vi.fn(async () => 'hashed') }));

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    user: {
      findFirst: mocks.userFindFirst,
      findMany: mocks.userFindMany,
      count: mocks.userCount,
      update: mocks.userUpdate,
    },
    role: {
      findFirst: mocks.roleFindFirst,
      findMany: mocks.roleFindMany,
      delete: mocks.roleDelete,
    },
    permission: { findMany: mocks.permFindMany },
    userRole: { upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: mocks.$transaction,
  },
}));

import { userAdminService } from '../user-admin.service';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';

const CTX = { tenantId: 'tenant-1', userId: 'caller-id' };

const PERM_VER = { id: 'perm-1', code: 'vendas:ver', descricao: null };
const PERM_CRIAR = { id: 'perm-2', code: 'vendas:criar', descricao: null };

const DEMO_ROLE = {
  id: 'role-1',
  tenantId: 'tenant-1',
  nome: 'VENDEDOR',
  descricao: null,
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  permissions: [{ permission: PERM_VER }],
};

const SYSTEM_ROLE = { ...DEMO_ROLE, id: 'role-sys', nome: 'ADMIN', isSystem: true };

const DEMO_USER = {
  id: 'user-42',
  tenantId: 'tenant-1',
  nome: 'Alice',
  email: 'alice@demo.mz',
  ativo: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  roles: [{ role: DEMO_ROLE }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindFirst.mockResolvedValue(DEMO_USER);
  mocks.roleFindFirst.mockResolvedValue(DEMO_ROLE);
  mocks.permFindMany.mockResolvedValue([PERM_VER, PERM_CRIAR]);
  // Por defeito: há 2 admins activos → guard não dispara
  mocks.userCount.mockResolvedValue(2);
  mocks.$transaction.mockImplementation(async (fn: (tx: typeof mocks.mockTx) => unknown) => fn(mocks.mockTx));
});

describe('userAdminService.obterUtilizador', () => {
  it('mapeia roles e permissões correctamente', async () => {
    const row = await userAdminService.obterUtilizador('user-42', CTX);
    expect(row.roles).toHaveLength(1);
    expect(row.roles[0].nome).toBe('VENDEDOR');
    expect(row.permissoes).toContain('vendas:ver');
  });

  it('lança NotFoundError se utilizador não existe no tenant', async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    await expect(userAdminService.obterUtilizador('x', CTX)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('userAdminService.criarUtilizador', () => {
  it('cria user + userRole em transacção com hash da password', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null); // sem duplicado email
    mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
    mocks.mockTx.user.create.mockResolvedValue(DEMO_USER);
    mocks.mockTx.userRole.createMany.mockResolvedValue({ count: 1 });
    mocks.userFindFirst.mockResolvedValueOnce(DEMO_USER); // fetchUser após criar

    const row = await userAdminService.criarUtilizador(
      { nome: 'Alice', email: 'alice@demo.mz', password: 'password1', roleIds: ['role-1'], ativo: true },
      CTX,
    );
    expect(mocks.$transaction).toHaveBeenCalledOnce();
    expect(row.email).toBe('alice@demo.mz');
  });

  it('lança BusinessRuleError em email duplicado', async () => {
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);
    await expect(
      userAdminService.criarUtilizador(
        { nome: 'X', email: 'alice@demo.mz', password: 'password1', roleIds: ['role-1'], ativo: true },
        CTX,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('lança NotFoundError se roleId não existe no tenant', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null); // sem duplicado email
    mocks.roleFindMany.mockResolvedValue([]);
    await expect(
      userAdminService.criarUtilizador(
        { nome: 'X', email: 'x@x.com', password: 'password1', roleIds: ['role-nao-existe'], ativo: true },
        CTX,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('userAdminService.desactivarUtilizador', () => {
  it('lança BusinessRuleError ao auto-desactivar', async () => {
    mocks.userFindFirst.mockResolvedValue({ ...DEMO_USER, id: 'caller-id' });
    await expect(
      userAdminService.desactivarUtilizador('caller-id', CTX),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('desactiva o utilizador sem ser self (utilizador sem role ADMIN)', async () => {
    const userSemAdmin = { ...DEMO_USER, roles: [] }; // sem role ADMIN
    mocks.userFindFirst.mockResolvedValue(userSemAdmin);
    mocks.userUpdate.mockResolvedValue(DEMO_USER);
    await expect(
      userAdminService.desactivarUtilizador('user-42', CTX),
    ).resolves.toBeUndefined();
  });

  it('Wave 3: lança ULTIMO_ADMIN ao desactivar o único admin activo', async () => {
    const adminUser = {
      ...DEMO_USER,
      id: 'user-42',
      roles: [{ role: { ...DEMO_ROLE, nome: 'ADMIN' } }],
    };
    mocks.userFindFirst.mockResolvedValue(adminUser);
    // Após excluir user-42, há 0 admins restantes
    mocks.userCount.mockResolvedValue(0);

    await expect(
      userAdminService.desactivarUtilizador('user-42', CTX),
    ).rejects.toMatchObject({ code: 'ULTIMO_ADMIN' });
  });

  it('Wave 3: desactiva admin quando há outro admin activo', async () => {
    const adminUser = {
      ...DEMO_USER,
      id: 'user-42',
      roles: [{ role: { ...DEMO_ROLE, nome: 'ADMIN' } }],
    };
    mocks.userFindFirst.mockResolvedValue(adminUser);
    // Há 1 outro admin activo (depois de excluir user-42)
    mocks.userCount.mockResolvedValue(1);
    mocks.userUpdate.mockResolvedValue(DEMO_USER);

    await expect(
      userAdminService.desactivarUtilizador('user-42', CTX),
    ).resolves.toBeUndefined();
  });
});

describe('userAdminService.atribuirRoles', () => {
  it('substitui roles em transacção (delete + createMany)', async () => {
    mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
    mocks.mockTx.userRole.deleteMany.mockResolvedValue({ count: 1 });
    mocks.mockTx.userRole.createMany.mockResolvedValue({ count: 1 });
    mocks.userFindFirst.mockResolvedValue(DEMO_USER); // findUser + fetchUser após atribuir

    const row = await userAdminService.atribuirRoles(
      { userId: 'user-42', roleIds: ['role-1'] },
      CTX,
    );
    expect(mocks.$transaction).toHaveBeenCalledOnce();
    expect(row.roles[0].id).toBe('role-1');
  });
});

describe('userAdminService.criarRole', () => {
  it('cria role com permissões em transacção', async () => {
    mocks.roleFindFirst.mockResolvedValueOnce(null); // sem duplicado
    mocks.mockTx.role.create.mockResolvedValue(DEMO_ROLE);
    mocks.mockTx.rolePermission.createMany.mockResolvedValue({ count: 2 });
    mocks.roleFindFirst.mockResolvedValueOnce(DEMO_ROLE); // findRole após criar

    const row = await userAdminService.criarRole(
      { nome: 'VENDEDOR', permissionCodes: ['vendas:ver', 'vendas:criar'] },
      CTX,
    );
    expect(row.nome).toBe('VENDEDOR');
  });

  it('lança BusinessRuleError em nome duplicado', async () => {
    mocks.roleFindFirst.mockResolvedValue(DEMO_ROLE);
    await expect(
      userAdminService.criarRole({ nome: 'VENDEDOR', permissionCodes: [] }, CTX),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('userAdminService.removerRole', () => {
  it('lança BusinessRuleError para roles de sistema', async () => {
    mocks.roleFindFirst.mockResolvedValue(SYSTEM_ROLE);
    await expect(userAdminService.removerRole('role-sys', CTX)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('elimina role personalizado quando há admins noutros papéis', async () => {
    // userCount: adminsRestantes (excludeRoleId) = 2, totalAdmins = 2 → OK
    mocks.userCount.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    mocks.roleDelete.mockResolvedValue(DEMO_ROLE);
    await expect(userAdminService.removerRole('role-1', CTX)).resolves.toBeUndefined();
  });

  it('Wave 3: lança ULTIMO_ADMIN ao remover o único papel que confere acesso admin', async () => {
    // totalAdmins = 1, adminsRestantes (após excluir roleId) = 0
    mocks.userCount
      .mockResolvedValueOnce(0) // adminsRestantes com excludeRoleId
      .mockResolvedValueOnce(1); // totalAdmins

    await expect(
      userAdminService.removerRole('role-1', CTX),
    ).rejects.toMatchObject({ code: 'ULTIMO_ADMIN' });
  });

  it('Wave 3: não lança ULTIMO_ADMIN quando não há admins (totalAdmins = 0)', async () => {
    // Se já não há admins, a condição "totalAdmins > 0 && adminsRestantes === 0" é falsa
    mocks.userCount
      .mockResolvedValueOnce(0) // adminsRestantes
      .mockResolvedValueOnce(0); // totalAdmins
    mocks.roleDelete.mockResolvedValue(DEMO_ROLE);

    await expect(userAdminService.removerRole('role-1', CTX)).resolves.toBeUndefined();
  });
});

describe('userAdminService.listarPermissoes', () => {
  it('retorna lista de permissões sem filtro de tenant', async () => {
    mocks.permFindMany.mockResolvedValue([PERM_VER]);
    const perms = await userAdminService.listarPermissoes();
    expect(perms[0].code).toBe('vendas:ver');
  });
});
