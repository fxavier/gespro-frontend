/**
 * ADR-0039 §3 — o motivo de cancelamento de ND e NC tem coluna própria e
 * `observacoes` deixa de ser sobrescrita. (O estorno do lançamento é do nó
 * contabilizacao; aqui só o destino do motivo.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  notaDebito: { findFirst: vi.fn(), update: vi.fn(async (a: unknown) => a) },
  notaCredito: { findFirst: vi.fn(), update: vi.fn(async (a: unknown) => a) },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/server/services/financas/contabilidade.service', () => ({ registarLancamentoContabilistico: vi.fn() }));
vi.mock('@/server/db/client', () => ({ prisma: db, prismaBase: db }));

import { cancelarNotaCredito, cancelarNotaDebito } from '../faturacao.service';

const ctx = { tenantId: 'tenant-a', userId: 'u1' };

beforeEach(() => {
  vi.clearAllMocks();
  db.notaDebito.findFirst.mockResolvedValue({ id: 'nd1', status: 'EMITIDA', observacoes: 'Entregar ao Sr. Mário' });
  db.notaCredito.findFirst.mockResolvedValue({ id: 'nc1', status: 'EMITIDA', observacoes: 'Devolução parcial' });
});

describe.each([
  ['nota de débito', cancelarNotaDebito, db.notaDebito, 'nd1'],
  ['nota de crédito', cancelarNotaCredito, db.notaCredito, 'nc1'],
] as const)('cancelar %s', (_, cancelar, modelo, id) => {
  it('grava o motivo em motivoCancelamento e não toca em observacoes', async () => {
    await cancelar(id, 'Emitida em duplicado', ctx);
    const { data } = modelo.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toEqual({ status: 'CANCELADA', motivoCancelamento: 'Emitida em duplicado' });
    expect(data).not.toHaveProperty('observacoes');
  });

  it('procura só no tenant do contexto', async () => {
    await cancelar(id, 'x', ctx);
    expect(modelo.findFirst.mock.calls[0][0]).toEqual({ where: { id, tenantId: 'tenant-a' } });
  });
});
