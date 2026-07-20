import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditFindMany: vi.fn(),
  auditFindFirst: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    auditLog: {
      findMany: mocks.auditFindMany,
      findFirst: mocks.auditFindFirst,
    },
    user: { findMany: mocks.userFindMany },
  },
}));

import { auditService } from '../audit.service';
import { NotFoundError } from '@/lib/errors';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

const LOG_1 = {
  id: 'log-1',
  tenantId: 'tenant-1',
  userId: 'user-42',
  action: 'CREATE',
  entity: 'Venda',
  entityId: 'venda-1',
  data: { total: '1000.00' },
  createdAt: new Date('2025-06-01T10:00:00Z'),
};

const LOG_2 = {
  ...LOG_1,
  id: 'log-2',
  userId: null,
  entity: 'Tenant',
};

const USER_42 = { id: 'user-42', nome: 'Alice' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindMany.mockResolvedValue([USER_42]);
});

describe('auditService.listar', () => {
  it('enriquece logs com userNome em batch único (sem N+1)', async () => {
    mocks.auditFindMany.mockResolvedValue([LOG_1, LOG_2]);

    const page = await auditService.listar({ take: 25 }, CTX);

    expect(page.items).toHaveLength(2);
    expect(page.items[0].userNome).toBe('Alice');
    expect(page.items[1].userNome).toBeNull();
    // User.findMany chamado 1 vez (não N vezes)
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
  });

  it('não chama user.findMany quando não há logs com userId', async () => {
    mocks.auditFindMany.mockResolvedValue([LOG_2]);

    await auditService.listar({ take: 25 }, CTX);

    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it('filtra por entity e action', async () => {
    mocks.auditFindMany.mockResolvedValue([LOG_1]);
    mocks.userFindMany.mockResolvedValue([USER_42]);

    await auditService.listar({ entity: 'Venda', action: 'CREATE', take: 25 }, CTX);

    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ entity: 'Venda', action: 'CREATE' }),
      }),
    );
  });

  it('filtra por intervalo de datas', async () => {
    mocks.auditFindMany.mockResolvedValue([]);
    await auditService.listar(
      { dateFrom: '2025-01-01T00:00:00Z', dateTo: '2025-12-31T23:59:59Z', take: 25 },
      CTX,
    );
    expect(mocks.auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2025-01-01T00:00:00Z'),
            lte: new Date('2025-12-31T23:59:59Z'),
          },
        }),
      }),
    );
  });
});

describe('auditService.obter', () => {
  it('retorna log com userNome quando existe', async () => {
    mocks.auditFindFirst.mockResolvedValue(LOG_1);

    const row = await auditService.obter('log-1', CTX);
    expect(row.id).toBe('log-1');
    expect(row.userNome).toBe('Alice');
  });

  it('lança NotFoundError quando não encontrado', async () => {
    mocks.auditFindFirst.mockResolvedValue(null);
    await expect(auditService.obter('nao-existe', CTX)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('auditService.filtrosDisponiveis', () => {
  it('retorna entidades e acções distintas em paralelo', async () => {
    mocks.auditFindMany
      .mockResolvedValueOnce([{ entity: 'Venda' }, { entity: 'Cliente' }])
      .mockResolvedValueOnce([{ action: 'CREATE' }, { action: 'UPDATE' }]);

    const filtros = await auditService.filtrosDisponiveis(CTX);
    expect(filtros.entidades).toEqual(['Venda', 'Cliente']);
    expect(filtros.accoes).toEqual(['CREATE', 'UPDATE']);
    expect(mocks.auditFindMany).toHaveBeenCalledTimes(2);
  });
});
