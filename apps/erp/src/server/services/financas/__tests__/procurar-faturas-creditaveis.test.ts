/**
 * Oráculo da issue #258 — a factura a creditar escolhe-se pelo NÚMERO, com
 * pesquisa no servidor.
 *
 * Contrato de `procurarFaturasCreditaveis(q, ctx)`:
 *  - só facturas do tenant do contexto (o `tenantId` nunca vem do cliente);
 *  - só as creditáveis: EMITIDA, PARCIALMENTE_PAGA, PAGA, VENCIDA — nunca
 *    RASCUNHO nem CANCELADA (fonte única: `ESTADOS_FATURA_CREDITAVEL`);
 *  - `q` com texto ⇒ `numero contains q.trim()`, insensível a maiúsculas;
 *    `q` vazio, só espaços ou `undefined` ⇒ sem filtro de número;
 *  - as 20 mais recentes (`dataEmissao desc`), só `id/numero/dataEmissao/total`.
 *
 * O Prisma é um duplo: afirma-se sobre os argumentos do `findMany`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { emailVerificado: true } }),
}));

vi.mock('@/server/db/client', () => ({
  prisma: { fatura: { findMany: h.findMany } },
  prismaBase: { $transaction: vi.fn() },
}));

import { procurarFaturasCreditaveis } from '../faturacao.service';
import { ESTADOS_FATURA_CREDITAVEL } from '../faturacao.interface';

const ctx = { tenantId: 'tenant-258', userId: 'user-258' };

const LINHA = {
  id: 'fat-1',
  numero: 'FAT/2026/000042',
  dataEmissao: new Date('2026-09-01T10:00:00+02:00'),
  total: new Prisma.Decimal('1160'),
};

/** Argumentos da única chamada ao `findMany`. */
function argumentos() {
  expect(h.findMany).toHaveBeenCalledTimes(1);
  return h.findMany.mock.calls[0][0];
}

beforeEach(() => {
  h.findMany.mockReset();
  h.findMany.mockResolvedValue([LINHA]);
});

describe('ESTADOS_FATURA_CREDITAVEL', () => {
  it('são exactamente os quatro estados de uma factura emitida e não anulada', () => {
    expect([...ESTADOS_FATURA_CREDITAVEL].sort()).toEqual(
      ['EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA'].sort(),
    );
    expect(ESTADOS_FATURA_CREDITAVEL).toHaveLength(4);
    expect(ESTADOS_FATURA_CREDITAVEL).not.toContain('RASCUNHO');
    expect(ESTADOS_FATURA_CREDITAVEL).not.toContain('CANCELADA');
  });
});

describe('procurarFaturasCreditaveis', () => {
  it('devolve o que o findMany devolveu', async () => {
    await expect(procurarFaturasCreditaveis('42', ctx)).resolves.toEqual([LINHA]);
  });

  it('filtra pelo tenant do contexto', async () => {
    await procurarFaturasCreditaveis('42', ctx);
    expect(argumentos().where.tenantId).toBe('tenant-258');
  });

  it('só os quatro estados creditáveis — nunca RASCUNHO nem CANCELADA', async () => {
    await procurarFaturasCreditaveis(undefined, ctx);
    const estados: string[] = [...argumentos().where.status.in];
    expect(estados.sort()).toEqual(['EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA'].sort());
    expect(estados).not.toContain('RASCUNHO');
    expect(estados).not.toContain('CANCELADA');
  });

  it('com termo: número contém o termo aparado, insensível a maiúsculas', async () => {
    await procurarFaturasCreditaveis('  fat/2026/00004  ', ctx);
    expect(argumentos().where.numero).toEqual({ contains: 'fat/2026/00004', mode: 'insensitive' });
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['undefined', undefined],
  ])('sem termo (%s): nenhum filtro de número', async (_rotulo, q) => {
    await procurarFaturasCreditaveis(q, ctx);
    const where = argumentos().where;
    expect(where.numero).toBeUndefined();
    // o resto do filtro continua lá
    expect(where.tenantId).toBe('tenant-258');
    expect(where.status).toBeDefined();
  });

  it('as 20 mais recentes, só com id, número, data e total', async () => {
    await procurarFaturasCreditaveis('42', ctx);
    const a = argumentos();
    expect(a.orderBy).toEqual({ dataEmissao: 'desc' });
    expect(a.take).toBe(20);
    expect(a.select).toEqual({ id: true, numero: true, dataEmissao: true, total: true });
  });
});
