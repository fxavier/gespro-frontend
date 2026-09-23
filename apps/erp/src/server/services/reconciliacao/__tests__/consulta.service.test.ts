/**
 * Leituras do ecrã de reconciliação, com Prisma mockado. Foco: tenant em todas
 * as queries, as vistas por estado (RF §23), o aviso de conta PGC partilhada, e
 * o mapa de um período fechado vir do que foi GRAVADO, nunca recalculado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors';

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() });
  return {
    db: {
      contaBancaria: model(),
      movimentoBancario: model(),
      movimentoContabilistico: model(),
      correspondenciaBancaria: model(),
      periodoReconciliacao: model(),
    },
    obterMapaFecho: vi.fn(),
  };
});
vi.mock('@/server/db/client', () => ({ prisma: mocks.db, prismaBase: mocks.db }));
vi.mock('../reconciliacao.service', () => ({ obterMapaFecho: mocks.obterMapaFecho }));

import {
  VISTAS,
  listarContasReconciliacao,
  listarMovimentos,
  obterContaReconciliacao,
  obterFechoPeriodo,
  obterMovimentosEscolhidos,
} from '../consulta.service';

const db = mocks.db;
const ctx = { tenantId: 'tenant-a', userId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  db.contaBancaria.findMany.mockResolvedValue([
    { id: 'bci', banco: 'BCI', numeroConta: '1', contaContabilId: 'pgc-121', contaContabil: { codigo: '121', nome: 'DO' } },
    { id: 'bim', banco: 'BIM', numeroConta: '2', contaContabilId: 'pgc-121', contaContabil: { codigo: '121', nome: 'DO' } },
    { id: 'sb', banco: 'SB', numeroConta: '3', contaContabilId: 'pgc-123', contaContabil: { codigo: '123', nome: 'DP' } },
  ]);
  db.movimentoBancario.groupBy.mockResolvedValue([{ contaBancariaId: 'sb', estado: 'BANCO_SEM_CONTABILIZACAO', _count: { _all: 4 } }]);
  db.movimentoContabilistico.groupBy.mockResolvedValue([{ contaBancariaId: 'sb', estado: 'EM_TRANSITO', _count: { _all: 2 } }]);
  db.correspondenciaBancaria.groupBy.mockResolvedValue([{ contaBancariaId: 'sb', _count: { _all: 3 } }]);
  db.periodoReconciliacao.findMany.mockResolvedValue([]);
  db.movimentoBancario.findMany.mockResolvedValue([]);
  db.movimentoContabilistico.findMany.mockResolvedValue([]);
});

describe('listarContasReconciliacao', () => {
  it('conta por estado e por lado, marca a conta PGC partilhada, e filtra tudo por tenant', async () => {
    const contas = await listarContasReconciliacao(ctx);
    const sb = contas.find((c) => c.id === 'sb')!;
    expect(sb.contagens).toEqual({ banco: { BANCO_SEM_CONTABILIZACAO: 4 }, contabilidade: { EM_TRANSITO: 2 }, sugestoes: 3 });
    expect(sb.pgcPartilhada).toBe(false);
    expect(contas.filter((c) => c.pgcPartilhada).map((c) => c.id)).toEqual(['bci', 'bim']);
    expect(db.contaBancaria.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-a', ativo: true });
    for (const m of [db.movimentoBancario, db.movimentoContabilistico, db.correspondenciaBancaria]) {
      expect(m.groupBy.mock.calls[0][0].where.tenantId).toBe('tenant-a');
    }
    expect(db.correspondenciaBancaria.groupBy.mock.calls[0][0].where).toMatchObject({ confirmadaEm: null, revertida: false });
  });

  it('conta de outro tenant (ou inexistente) → NotFoundError', async () => {
    await expect(obterContaReconciliacao('alheia', ctx)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listarMovimentos — vistas por estado (RF §23)', () => {
  it('as excepções são exactamente os quatro estados que pedem decisão humana', () => {
    expect([...VISTAS.excecoes].sort()).toEqual(['BANCO_SEM_CONTABILIZACAO', 'CONTABILIDADE_SEM_BANCO', 'DIFERENCA_VALOR', 'DIVERGENCIA']);
  });

  it('as vistas partem os estados sem sobreposição', () => {
    const todos = Object.values(VISTAS).flat();
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('pagina cada lado por cursor, com tenant, conta e estados da vista', async () => {
    await listarMovimentos('sb', 'excecoes', { banco: 'cur-b' }, ctx);
    const a = db.movimentoBancario.findMany.mock.calls[0][0];
    expect(a.where).toEqual({ tenantId: 'tenant-a', contaBancariaId: 'sb', estado: { in: [...VISTAS.excecoes] } });
    expect(a).toMatchObject({ take: 51, cursor: { id: 'cur-b' }, skip: 1 });
    expect(db.movimentoContabilistico.findMany.mock.calls[0][0].cursor).toBeUndefined();
  });

  it('os movimentos escolhidos para a manual são só os da conta e do tenant', async () => {
    await obterMovimentosEscolhidos('sb', { banco: ['b1'], contabilidade: ['k1'] }, ctx);
    expect(db.movimentoBancario.findMany.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-a', contaBancariaId: 'sb', id: { in: ['b1'] } });
  });
});

describe('obterFechoPeriodo', () => {
  it('período fechado: o mapa é o GRAVADO, nunca recalculado', async () => {
    const fechado = { id: 'p1', estado: 'RECONCILIADO', diferencaResidual: new Prisma.Decimal(0) };
    db.periodoReconciliacao.findFirst.mockResolvedValue(fechado);
    const r = await obterFechoPeriodo('p1', ctx);
    expect(r).toEqual({ periodo: fechado, mapa: fechado, aoVivo: false });
    expect(mocks.obterMapaFecho).not.toHaveBeenCalled();
    expect(db.periodoReconciliacao.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', tenantId: 'tenant-a' });
  });

  it('período em curso: o mapa é calculado agora', async () => {
    db.periodoReconciliacao.findFirst.mockResolvedValue({ id: 'p1', estado: 'EM_RECONCILIACAO' });
    mocks.obterMapaFecho.mockResolvedValue({ mapa: { vivo: true } });
    expect(await obterFechoPeriodo('p1', ctx)).toMatchObject({ mapa: { vivo: true }, aoVivo: true });
  });

  it('período de outro tenant → NotFoundError', async () => {
    db.periodoReconciliacao.findFirst.mockResolvedValue(null);
    await expect(obterFechoPeriodo('p1', ctx)).rejects.toBeInstanceOf(NotFoundError);
  });
});
