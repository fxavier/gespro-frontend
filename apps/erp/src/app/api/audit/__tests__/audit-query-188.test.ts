/**
 * ORÁCULO — issue #188 em `GET /api/audit` (nó A:withapi-traceid-zod-envelope-187-189).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato: `take` que não seja um inteiro positivo (`abc`, `-1`, `1.5`, `0`)
 * é recusado com 422 `VALIDACAO` ANTES de tocar na base — hoje `Number('abc')`
 * dá `NaN`, chega ao Prisma e sai 500. Um `take` válido continua a responder no
 * envelope `{ data: { items, nextCursor } }`; sem `take`, a omissão continua 20.
 * Acima de 100: o tecto actual (clamp a 100) pode manter-se, ou a rota pode
 * recusar com 422 — ambos são aceites; nunca pedir mais de 101 linhas à base.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/server/db/client', () => ({
  prismaBase: { auditLog: { findMany: mocks.findMany } },
  prisma: {},
}));

import { GET } from '../route';

function sessao(permissions: string[] = ['admin:ver_auditoria']) {
  return { user: { id: 'user-1', tenantId: 'tenant-1', permissions, acesso: 'normal' } };
}

function pedido(query: string) {
  return new NextRequest(new URL(`/api/audit${query}`, 'http://localhost:3000'), {
    method: 'GET',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(sessao());
  mocks.findMany.mockResolvedValue([]);
});

describe('#188 — /api/audit valida a query', () => {
  it.each(['abc', '-1', '1.5', '0'])('take=%s → 422 VALIDACAO, sem tocar na base', async (take) => {
    const res = await GET(pedido(`?take=${take}`));

    expect(res.status, `take=${take} não foi recusado`).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe('VALIDACAO');
    expect(corpo.error.details?.fieldErrors?.take).toBeDefined();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('take=10 → 200 no envelope { data } e pede 11 linhas (take + 1)', async () => {
    const res = await GET(pedido('?take=10&entity=Fatura'));

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data).toEqual({ items: [], nextCursor: null });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.findMany.mock.calls[0][0];
    expect(args.take).toBe(11);
    expect(args.where).toMatchObject({ tenantId: 'tenant-1', entity: 'Fatura' });
  });

  it('sem take → omissão de 20 (pede 21 linhas)', async () => {
    const res = await GET(pedido(''));
    expect(res.status).toBe(200);
    expect(mocks.findMany.mock.calls[0][0].take).toBe(21);
  });

  it('take=500 → tecto de 100 ou 422; nunca mais de 101 linhas pedidas', async () => {
    const res = await GET(pedido('?take=500'));
    if (res.status === 200) {
      expect(mocks.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(101);
    } else {
      expect(res.status).toBe(422);
      expect(mocks.findMany).not.toHaveBeenCalled();
    }
  });

  it('sem a permissão → 403, antes da validação', async () => {
    mocks.auth.mockResolvedValue(sessao([]));
    const res = await GET(pedido('?take=abc'));
    expect(res.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
