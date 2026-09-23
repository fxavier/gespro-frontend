/**
 * Serviço do motor com Prisma mockado. Foco: isolamento multi-tenant, recuperação
 * de candidatos POR ÍNDICE (nunca o lado contabilístico inteiro), confirmação só
 * com autoReconciliacao e limiar, reclamação condicional dos dois lados (RF §14)
 * e classificação do que fica sem par (RF §8/§9/§22).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors';

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  });
  const db = {
    contaBancaria: model(),
    movimentoBancario: model(),
    movimentoContabilistico: model(),
    correspondenciaBancaria: model(),
  };
  return { db };
});

vi.mock('@/server/db/client', () => ({
  prisma: { ...mocks.db, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.db) },
  prismaBase: mocks.db,
}));

import { executarMatching } from '../matching.service';

const db = mocks.db;
const ctx = { tenantId: 'tenant-a', userId: 'user-1' };
const D = (v: string | number) => new Prisma.Decimal(v);
const dia = (d: number) => new Date(2026, 8, d, 12);

const CONTA = {
  id: 'conta-1',
  toleranciaDias: 5,
  toleranciaValor: D(0),
  permitirMatchPorReferencia: true,
  permitirMatchPorValor: true,
  permitirMatchPorDescricao: false,
  autoReconciliacao: false,
  limiarConfianca: 90,
};

type Linha = Record<string, unknown> & { id: string };
const banco = (id: string, extra: object = {}): Linha => ({
  id, tenantId: 'tenant-a', contaBancariaId: 'conta-1', dataMovimento: dia(10), valor: D('1000.00'),
  natureza: 'DEBITO', referencia: 'TRF-0458', referenciaNormalizada: 'TRF0458', descricao: 'transferencia',
  estado: 'PENDENTE', correspondenciaAtivaId: null, ...extra,
});
const contab = (id: string, extra: object = {}): Linha => ({
  id, tenantId: 'tenant-a', contaBancariaId: 'conta-1', dataContabilistica: dia(9), valor: D('1000.00'),
  natureza: 'DEBITO', referencia: 'TRF-0458', referenciaNormalizada: 'TRF0458', descricao: 'recebimento',
  documento: null, estado: 'PENDENTE', correspondenciaAtivaId: null, ...extra,
});

// Fake com estado: avalia os `where` que o serviço usa (igualdade, null, in, gt/gte/lte, OR),
// aplica `orderBy`/`take` e muda as linhas no `updateMany`. Não depende da ordem das chamadas.
const cmp = (a: unknown, b: unknown) =>
  a instanceof Prisma.Decimal ? a.comparedTo(b as Prisma.Decimal)
    : a instanceof Date ? a.getTime() - (b as Date).getTime()
      : a! < b! ? -1 : a! > b! ? 1 : 0;
function casa(row: Linha, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Record<string, unknown>[]).some((w) => casa(row, w));
    const x = row[k];
    if (v === null) return x === null;
    if (v instanceof Date || v instanceof Prisma.Decimal || typeof v !== 'object') return cmp(x, v) === 0;
    const o = v as Record<string, unknown>;
    return (!('in' in o) || (o.in as unknown[]).includes(x))
      && (!('gt' in o) || cmp(x, o.gt) > 0)
      && (!('gte' in o) || cmp(x, o.gte) >= 0)
      && (!('lte' in o) || cmp(x, o.lte) <= 0);
  });
}
function fake(model: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }, linhas: () => Linha[]) {
  model.findMany.mockImplementation(async (a: { where: Record<string, unknown>; orderBy?: object | object[]; take?: number }) => {
    let r = linhas().filter((l) => casa(l, a.where));
    const ordem = [a.orderBy ?? []].flat().flatMap((o) => Object.keys(o));
    r = [...r].sort((x, y) => ordem.reduce((acc, k) => acc || cmp(x[k], y[k]), 0));
    return r.slice(0, a.take ?? r.length).map((l) => ({ ...l }));
  });
  model.updateMany.mockImplementation(async (a: { where: Record<string, unknown>; data: object }) => {
    const alvo = linhas().filter((l) => casa(l, a.where));
    for (const l of alvo) Object.assign(l, a.data);
    return { count: alvo.length };
  });
}

let bancos: Linha[] = [];
let contabs: Linha[] = [];
let nCorr = 0;

beforeEach(() => {
  vi.clearAllMocks();
  bancos = [banco('b1')];
  contabs = [contab('c1')];
  nCorr = 0;
  db.contaBancaria.findFirst.mockResolvedValue(CONTA);
  fake(db.movimentoBancario, () => bancos);
  fake(db.movimentoContabilistico, () => contabs);
  db.correspondenciaBancaria.create.mockImplementation(async () => ({ id: `corr-${++nCorr}` }));
  db.correspondenciaBancaria.count.mockResolvedValue(0);
  db.movimentoBancario.aggregate.mockImplementation(async () => ({
    _max: { dataMovimento: bancos.reduce<Date | null>((m, b) => (!m || (b.dataMovimento as Date) > m ? (b.dataMovimento as Date) : m), null) },
  }));
});

const candidatos = () =>
  db.movimentoContabilistico.findMany.mock.calls.map(([a]) => a).filter((a) => !('orderBy' in a));

describe('executarMatching — isolamento e recuperação por índice', () => {
  it('conta de outro tenant → NotFoundError (404), sem tocar em movimentos', async () => {
    db.contaBancaria.findFirst.mockResolvedValue(null);
    await expect(executarMatching('conta-alheia', ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.contaBancaria.findFirst.mock.calls[0][0].where).toEqual({ id: 'conta-alheia', tenantId: 'tenant-a' });
    expect(db.movimentoBancario.findMany).not.toHaveBeenCalled();
  });

  it('todas as leituras e escritas filtram por tenantId e contaBancariaId', async () => {
    await executarMatching('conta-1', ctx);
    const todas = [
      ...db.movimentoBancario.findMany.mock.calls,
      ...db.movimentoContabilistico.findMany.mock.calls,
      ...db.movimentoBancario.updateMany.mock.calls,
      ...db.movimentoContabilistico.updateMany.mock.calls,
      ...db.movimentoBancario.aggregate.mock.calls,
    ];
    expect(todas.length).toBeGreaterThan(0);
    for (const [args] of todas) {
      expect(args.where.tenantId).toBe('tenant-a');
      expect(args.where.contaBancariaId).toBe('conta-1');
    }
    expect(db.correspondenciaBancaria.create.mock.calls[0][0].data.tenantId).toBe('tenant-a');
  });

  it('RF §19: cada query de candidatos é restringida por referência ou pela blocking key', async () => {
    bancos.push(banco('b2', { referencia: null, referenciaNormalizada: null, valor: D('7.00') }));
    await executarMatching('conta-1', ctx);
    const qs = candidatos();
    expect(qs.some((a) => a.where.referenciaNormalizada?.in)).toBe(true);
    expect(qs.some((a) => a.where.OR)).toBe(true);
    for (const a of qs) {
      expect(a.where.correspondenciaAtivaId).toBeNull();
      expect(a.where.estado.in).toEqual(['PENDENTE', 'EM_TRANSITO', 'BANCO_SEM_CONTABILIZACAO', 'CONTABILIDADE_SEM_BANCO']);
      const porRef = a.where.referenciaNormalizada?.in;
      const porBloco = a.where.OR;
      expect(porRef ?? porBloco, 'query sem chave de procura').toBeDefined();
      if (porRef) expect(a.where.dataContabilistica.gte).toBeDefined();
      if (porBloco) {
        for (const ramo of porBloco) {
          expect(ramo.natureza).toBeDefined();
          expect(ramo.valor.gte).toBeDefined();
          expect(ramo.dataContabilistica.gte).toBeDefined();
        }
      }
    }
  });

  it('RF §6: a prioridade é global — uma regra fraca num lote não rouba o par de uma forte no lote seguinte', async () => {
    // 199 bancários sem par no dia 1 + A (dia 9, sem referência) enchem o 1.º lote de 200;
    // B (dia 11, com a referência de c1) cai no 2.º. A casaria c1 por VALOR_NATUREZA_DATA.
    bancos = [
      ...Array.from({ length: 199 }, (_, i) =>
        banco(`f${String(i).padStart(3, '0')}`, { dataMovimento: dia(1), referencia: null, referenciaNormalizada: null, valor: D('3.00') })),
      banco('A', { dataMovimento: dia(9), referencia: null, referenciaNormalizada: null }),
      banco('B', { dataMovimento: dia(11) }),
    ];
    contabs = [contab('c1', { dataContabilistica: dia(10) })];
    const r = await executarMatching('conta-1', ctx);
    expect(r.propostas).toBe(1);
    expect(db.correspondenciaBancaria.create.mock.calls[0][0].data.regra).toBe('REFERENCIA_EXACTA');
    expect(db.correspondenciaBancaria.create.mock.calls[0][0].data.linhasBanco.create.movimentoBancarioId).toBe('B');
  });

  it('sem nenhuma regra ligada, não há query de candidatos', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({
      ...CONTA, permitirMatchPorReferencia: false, permitirMatchPorValor: false, permitirMatchPorDescricao: false,
    });
    const r = await executarMatching('conta-1', ctx);
    expect(r.propostas).toBe(0);
    expect(db.movimentoContabilistico.findMany.mock.calls.filter(([a]) => !('orderBy' in a))).toEqual([]);
  });
});

describe('executarMatching — confirmação e sugestão', () => {
  it('autoReconciliacao desligada: grava sugestão sem confirmar e sem mudar o estado', async () => {
    const r = await executarMatching('conta-1', ctx);
    expect(r).toMatchObject({ propostas: 1, sugeridas: 1, confirmadas: 0 });
    const data = db.correspondenciaBancaria.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ regra: 'REFERENCIA_EXACTA', confirmadaEm: null, confirmadaPorId: null, automatica: true });
    expect(db.movimentoBancario.updateMany.mock.calls[0][0].data).toEqual({ correspondenciaAtivaId: 'corr-1' });
  });

  it('autoReconciliacao ligada e confiança ≥ limiar: confirma e passa ambos a RECONCILIADO', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({ ...CONTA, autoReconciliacao: true });
    const r = await executarMatching('conta-1', ctx);
    expect(r.confirmadas).toBe(1);
    const data = db.correspondenciaBancaria.create.mock.calls[0][0].data;
    expect(data.confirmadaPorId).toBe('user-1');
    expect(data.confirmadaEm).toBeInstanceOf(Date);
    for (const m of [db.movimentoBancario, db.movimentoContabilistico]) {
      expect(m.updateMany.mock.calls[0][0].data).toEqual({ correspondenciaAtivaId: 'corr-1', estado: 'RECONCILIADO' });
    }
  });

  it('confiança abaixo do limiar não confirma, mesmo com autoReconciliacao', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({ ...CONTA, autoReconciliacao: true, limiarConfianca: 100 });
    const r = await executarMatching('conta-1', ctx); // 1 dia de diferença → confiança 98
    expect(r).toMatchObject({ confirmadas: 0, sugeridas: 1 });
  });

  it('referência igual com valor diferente: DIFERENCA_VALOR nos dois lados, nunca confirmada', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({ ...CONTA, autoReconciliacao: true });
    contabs = [contab('c1', { valor: D('1500.00') })];
    const r = await executarMatching('conta-1', ctx);
    expect(r.comDiferencaValor).toBe(1);
    const data = db.correspondenciaBancaria.create.mock.calls[0][0].data;
    expect(data.confirmadaEm).toBeNull();
    expect(data.diferencaValor.equals(D('-500.00'))).toBe(true);
    expect(db.movimentoBancario.updateMany.mock.calls[0][0].data.estado).toBe('DIFERENCA_VALOR');
  });
});

describe('executarMatching — RF §14 (dupla reconciliação)', () => {
  it('reclama cada lado só se continuar livre e no estado lido', async () => {
    await executarMatching('conta-1', ctx);
    expect(db.movimentoBancario.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'b1', estado: 'PENDENTE', correspondenciaAtivaId: null,
    });
    expect(db.movimentoContabilistico.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 'c1', estado: 'PENDENTE', correspondenciaAtivaId: null,
    });
  });

  it('um lado já reclamado entretanto: conta como conflito e a corrida continua', async () => {
    db.movimentoContabilistico.updateMany.mockResolvedValueOnce({ count: 0 });
    const r = await executarMatching('conta-1', ctx);
    expect(r).toMatchObject({ propostas: 1, conflitos: 1, sugeridas: 0 });
  });

  it('um par que o utilizador já rejeitou (revertido) não volta a ser proposto', async () => {
    db.correspondenciaBancaria.count.mockResolvedValue(1);
    const r = await executarMatching('conta-1', ctx);
    // O par fica livre e as passagens seguintes voltam a encontrá-lo: é recusado em todas.
    expect(r.propostas).toBeGreaterThan(0);
    expect(r).toMatchObject({ jaRejeitadas: r.propostas, sugeridas: 0, confirmadas: 0 });
    expect(db.correspondenciaBancaria.create).not.toHaveBeenCalled();
    expect(db.correspondenciaBancaria.count.mock.calls[0][0].where).toMatchObject({
      tenantId: 'tenant-a', revertida: true, confirmadaEm: null,
      linhasBanco: { some: { movimentoBancarioId: 'b1' } },
      linhasContabilidade: { some: { movimentoContabilisticoId: 'c1' } },
    });
  });

  it('um erro que não é conflito propaga', async () => {
    db.correspondenciaBancaria.create.mockRejectedValue(new Error('db em baixo'));
    await expect(executarMatching('conta-1', ctx)).rejects.toThrow('db em baixo');
  });
});

describe('executarMatching — classificação sem correspondência', () => {
  const semPar = { referencia: null, referenciaNormalizada: null, valor: D('1.00') };
  beforeEach(() => {
    bancos = [banco('b-sem', { ...semPar, valor: D('7.00'), dataMovimento: dia(20) })];
    contabs = [
      contab('recente', { ...semPar, dataContabilistica: dia(17) }),
      contab('antigo', { ...semPar, estado: 'EM_TRANSITO', dataContabilistica: dia(2) }),
      contab('ja-em-transito', { ...semPar, estado: 'EM_TRANSITO', dataContabilistica: dia(19) }),
      contab('futuro', { ...semPar, dataContabilistica: dia(30) }),
    ];
  });

  it('bancários PENDENTE livres → BANCO_SEM_CONTABILIZACAO', async () => {
    await executarMatching('conta-1', ctx);
    expect(db.movimentoBancario.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', contaBancariaId: 'conta-1', correspondenciaAtivaId: null, estado: 'PENDENTE' },
      data: { estado: 'BANCO_SEM_CONTABILIZACAO' },
    });
    expect(bancos[0].estado).toBe('BANCO_SEM_CONTABILIZACAO');
  });

  it('contabilísticos: na tolerância → EM_TRANSITO; fora → CONTABILIDADE_SEM_BANCO; posteriores ao extracto → EM_TRANSITO', async () => {
    const r = await executarMatching('conta-1', ctx);
    const estado = Object.fromEntries(contabs.map((c) => [c.id, c.estado]));
    expect(estado).toEqual({
      recente: 'EM_TRANSITO',
      antigo: 'CONTABILIDADE_SEM_BANCO',
      'ja-em-transito': 'EM_TRANSITO',
      futuro: 'EM_TRANSITO',
    });
    expect(r.classificados).toBe(1 + 3);
    for (const [a] of db.movimentoContabilistico.updateMany.mock.calls) {
      expect(a.where.id.in).not.toContain('ja-em-transito');
    }
  });

  it('sem extracto nenhum na conta, nada se classifica', async () => {
    bancos = [];
    const r = await executarMatching('conta-1', ctx);
    expect(r.classificados).toBe(0);
    expect(db.movimentoBancario.updateMany).not.toHaveBeenCalled();
    expect(db.movimentoContabilistico.updateMany).not.toHaveBeenCalled();
    expect(contabs.every((c) => c.estado !== 'CONTABILIDADE_SEM_BANCO' || c.id === 'antigo')).toBe(true);
  });
});
