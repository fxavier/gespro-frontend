/**
 * Serviço de reconciliação com Prisma mockado. Foco: invariantes do período
 * (um aberto, sem sobreposição, conta trancada), fecho só com residual zero ou
 * justificação (RF §17), reconciliação manual com justificação (RF §13, CA07),
 * dupla reconciliação (RF §14), reversão append-only que respeita o período
 * fechado (RF §19) e sugestão de lançamento (RF §9).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  });
  const db = {
    contaBancaria: model(),
    periodoReconciliacao: model(),
    movimentoBancario: model(),
    movimentoContabilistico: model(),
    correspondenciaBancaria: model(),
    regraSugestaoLancamento: model(),
    $queryRaw: vi.fn(),
  };
  return { db, projetar: vi.fn(), matching: vi.fn() };
});

vi.mock('@/server/db/client', () => ({
  prisma: { ...mocks.db, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.db) },
  prismaBase: mocks.db,
}));
vi.mock('../../financas/contabilidade.service', () => ({
  FILTRO_LANCAMENTO_MAPA: { in: ['LANCADO', 'ESTORNADO'] },
  // Maputo = UTC+2 sem hora de Verão; basta para os testes, que usam o meio-dia.
  diaCivilEmMaputo: (d: Date) => {
    const m = new Date(d.getTime() + 2 * 3600_000);
    return { ano: m.getUTCFullYear(), mes: m.getUTCMonth() + 1, dia: m.getUTCDate() };
  },
}));
vi.mock('../importacao.service', () => ({ projetarMovimentosContabilisticos: mocks.projetar }));
vi.mock('../matching.service', () => ({ executarMatching: mocks.matching }));

import {
  abrirPeriodo,
  cancelarPeriodoReconciliacao,
  confirmarCorrespondencias,
  definirIgnorado,
  executarReconciliacao,
  fecharPeriodoReconciliacao,
  reconciliarManualmente,
  reverterCorrespondencia,
  sugerirLancamento,
} from '../reconciliacao.service';

const db = mocks.db;
const ctx = { tenantId: 'tenant-a', userId: 'user-1' };
const D = (v: string | number) => new Prisma.Decimal(v);
const dia = (d: number, mes = 9) => new Date(2026, mes - 1, d, 12);

const CONTA = {
  id: 'conta-1', ativo: true, contaContabilId: 'pgc-121', toleranciaValor: D(0),
  permitirAgregacao: false, maxMovimentosAgregacao: 5,
};

/** $queryRaw: tranca devolve a linha; o saldo do razão devolve `razao`. */
let razao: { tipo: string; total: Prisma.Decimal }[] = [];
const sql = (strings: TemplateStringsArray) => strings.join('?');

beforeEach(() => {
  vi.clearAllMocks();
  razao = [];
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    sql(strings).includes('FOR UPDATE') ? [{ id: 'trancado' }] : razao,
  );
  db.contaBancaria.findFirst.mockResolvedValue(CONTA);
  db.contaBancaria.count.mockResolvedValue(1);
  db.periodoReconciliacao.findMany.mockResolvedValue([]);
  db.periodoReconciliacao.create.mockImplementation(async (a: { data: object }) => ({ id: 'per-1', ...a.data }));
  db.periodoReconciliacao.update.mockImplementation(async (a: { data: object }) => a.data);
  db.movimentoBancario.findMany.mockResolvedValue([]);
  db.movimentoContabilistico.findMany.mockResolvedValue([]);
  db.correspondenciaBancaria.findMany.mockResolvedValue([]);
  db.correspondenciaBancaria.create.mockResolvedValue({ id: 'corr-nova' });
  db.correspondenciaBancaria.update.mockImplementation(async (a: { data: object }) => a.data);
  db.movimentoBancario.updateMany.mockResolvedValue({ count: 1 });
  db.movimentoContabilistico.updateMany.mockResolvedValue({ count: 1 });
  db.correspondenciaBancaria.updateMany.mockResolvedValue({ count: 1 });
  db.periodoReconciliacao.updateMany.mockResolvedValue({ count: 1 });
});

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

describe('abrirPeriodo', () => {
  const abrir = (extra: object = {}) =>
    abrirPeriodo(
      { contaBancariaId: 'conta-1', dataInicio: dia(1), dataFim: dia(30), saldoInicialBanco: D(1000), saldoFinalBanco: D(5000), ...extra },
      ctx,
    );

  it('tranca a conta (FOR UPDATE, com tenant) antes de verificar os invariantes', async () => {
    await abrir();
    const [strings, ...valores] = db.$queryRaw.mock.calls[0];
    expect(sql(strings)).toMatch(/FROM "ContaBancaria"[\s\S]*FOR UPDATE/);
    expect(valores).toEqual(['conta-1', 'tenant-a']);
  });

  it('conta de outro tenant → NotFoundError', async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    await expect(abrir()).rejects.toBeInstanceOf(NotFoundError);
    expect(db.periodoReconciliacao.create).not.toHaveBeenCalled();
  });

  it('um só período activo por conta', async () => {
    db.periodoReconciliacao.findMany.mockResolvedValue([{ id: 'p0', estado: 'EM_RECONCILIACAO', dataInicio: dia(1, 8), dataFim: dia(31, 8) }]);
    await expect(abrir()).rejects.toMatchObject({ code: 'PERIODO_RECONCILIACAO_EM_ABERTO' });
  });

  it('nenhum período sobreposto (fronteira inclusiva) — os cancelados não contam', async () => {
    db.periodoReconciliacao.findMany.mockResolvedValue([{ id: 'p0', estado: 'RECONCILIADO', dataInicio: dia(1, 8), dataFim: dia(1) }]);
    await expect(abrir()).rejects.toMatchObject({ code: 'PERIODO_RECONCILIACAO_SOBREPOSTO' });
    expect(db.periodoReconciliacao.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 'tenant-a', contaBancariaId: 'conta-1', estado: { not: 'CANCELADO' },
    });
  });

  it('conta PGC partilhada e conta inactiva são recusadas', async () => {
    db.contaBancaria.count.mockResolvedValueOnce(2);
    await expect(abrir()).rejects.toMatchObject({ code: 'CONTA_PGC_PARTILHADA' });
    db.contaBancaria.findFirst.mockResolvedValueOnce({ ...CONTA, ativo: false });
    await expect(abrir()).rejects.toMatchObject({ code: 'CONTA_BANCARIA_INATIVA' });
  });

  it('abre em ABERTO com os saldos do razão (LANCADO ∪ ESTORNADO, por dia civil de Maputo)', async () => {
    razao = [{ tipo: 'DEBITO', total: D(700) }, { tipo: 'CREDITO', total: D(200) }];
    const p = await abrir();
    expect(p).toMatchObject({ estado: 'ABERTO', tenantId: 'tenant-a', responsavelId: 'user-1' });
    expect((p as { saldoFinalContabil: Prisma.Decimal }).saldoFinalContabil.equals(D(500))).toBe(true);
    const saldo = db.$queryRaw.mock.calls.find(([s]) => sql(s).includes('PartidaLancamento'))!;
    expect(sql(saldo[0])).toMatch(/AT TIME ZONE 'Africa\/Maputo'/);
    expect(saldo.slice(1)).toContain('tenant-a');
  });
});

describe('fecharPeriodoReconciliacao — RF §17', () => {
  const periodo = {
    id: 'per-1', tenantId: 'tenant-a', contaBancariaId: 'conta-1', estado: 'EM_RECONCILIACAO',
    dataInicio: dia(1), dataFim: dia(30), saldoInicialBanco: D(0), saldoFinalBanco: D(100),
  };

  beforeEach(() => {
    db.periodoReconciliacao.findFirst.mockImplementation(async (a: { orderBy?: object }) =>
      a.orderBy ? { dataInicio: dia(1), saldoInicialBanco: D(0) } : periodo,
    );
    // Razão: +100 dentro do período, nada antes.
    db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      if (sql(strings).includes('FOR UPDATE')) return [{ id: 'per-1' }];
      // O operador chega como fragmento Prisma.sql entre os valores: `<=` = «até», `<` = «antes».
      const ate = valores.some((v) => typeof v === 'object' && v !== null && 'strings' in v && (v as { strings: string[] }).strings.join('') === '<=');
      return ate ? [{ tipo: 'DEBITO', total: D(100) }] : [];
    });
    db.movimentoBancario.findMany.mockResolvedValue([
      { id: 'b', dataMovimento: dia(10), valor: D(100), natureza: 'DEBITO', correspondenciaAtivaId: 'c' },
    ]);
    db.movimentoContabilistico.findMany.mockResolvedValue([
      { id: 'k', dataContabilistica: dia(9), valor: D(100), natureza: 'DEBITO', correspondenciaAtivaId: 'c' },
    ]);
    db.correspondenciaBancaria.findMany.mockResolvedValue([{
      id: 'c', confirmadaEm: new Date(), valorBanco: D(100), valorContabilistico: D(100),
      linhasBanco: [{ movimentoBancario: { dataMovimento: dia(10), natureza: 'DEBITO' } }],
      linhasContabilidade: [{ movimentoContabilistico: { dataContabilistica: dia(9), natureza: 'DEBITO' } }],
    }]);
  });

  it('tudo explicado: fecha RECONCILIADO sem justificação, grava o mapa e prende as correspondências ao período', async () => {
    const r = await fecharPeriodoReconciliacao({ periodoId: 'per-1' }, ctx);
    expect(r).toMatchObject({ estado: 'RECONCILIADO', fechadoPorId: 'user-1', totalReconciliados: 2 });
    expect((r as { diferencaResidual: Prisma.Decimal }).diferencaResidual.isZero()).toBe(true);
    expect(db.correspondenciaBancaria.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['c'] }, periodoId: null },
      data: { periodoId: 'per-1' },
    });
  });

  it('diferença residual sem justificação → RECONCILIACAO_COM_DIFERENCA, nada gravado', async () => {
    db.periodoReconciliacao.findFirst.mockImplementation(async (a: { orderBy?: object }) =>
      a.orderBy ? { dataInicio: dia(1), saldoInicialBanco: D(0) } : { ...periodo, saldoFinalBanco: D(150) },
    );
    const e = await fecharPeriodoReconciliacao({ periodoId: 'per-1', justificacao: '   ' }, ctx).catch((x) => x);
    expect(e).toBeInstanceOf(BusinessRuleError);
    expect(e.code).toBe('RECONCILIACAO_COM_DIFERENCA');
    expect(e.details).toEqual({ diferencaResidual: '50.00' });
    expect(db.periodoReconciliacao.update).not.toHaveBeenCalled();
  });

  it('diferença residual COM justificação fecha, e a justificação fica gravada', async () => {
    db.periodoReconciliacao.findFirst.mockImplementation(async (a: { orderBy?: object }) =>
      a.orderBy ? { dataInicio: dia(1), saldoInicialBanco: D(0) } : { ...periodo, saldoFinalBanco: D(150) },
    );
    const r = await fecharPeriodoReconciliacao({ periodoId: 'per-1', justificacao: 'Comissão não lançada, corrigida em Outubro' }, ctx);
    expect(r).toMatchObject({ estado: 'RECONCILIADO', justificacao: 'Comissão não lançada, corrigida em Outubro' });
  });

  it('período já fechado ou cancelado não fecha de novo', async () => {
    db.periodoReconciliacao.findFirst.mockImplementation(async (a: { orderBy?: object }) =>
      a.orderBy ? { dataInicio: dia(1), saldoInicialBanco: D(0) } : { ...periodo, estado: 'RECONCILIADO' },
    );
    await expect(fecharPeriodoReconciliacao({ periodoId: 'per-1' }, ctx)).rejects.toMatchObject({ code: 'TRANSICAO_INVALIDA' });
  });

  it('período de outro tenant → NotFoundError', async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    await expect(fecharPeriodoReconciliacao({ periodoId: 'alheio' }, ctx)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('cancelarPeriodoReconciliacao', () => {
  it('tranca o período e recusa cancelar um já RECONCILIADO (terminal)', async () => {
    db.periodoReconciliacao.findFirst.mockResolvedValue({ id: 'per-1', estado: 'RECONCILIADO' });
    await expect(cancelarPeriodoReconciliacao('per-1', ctx)).rejects.toMatchObject({ code: 'TRANSICAO_INVALIDA' });
    expect(sql(db.$queryRaw.mock.calls[0][0])).toMatch(/FROM "PeriodoReconciliacao"[\s\S]*FOR UPDATE/);
    expect(db.periodoReconciliacao.update).not.toHaveBeenCalled();
  });

  it('cancela um período activo', async () => {
    db.periodoReconciliacao.findFirst.mockResolvedValue({ id: 'per-1', estado: 'EM_RECONCILIACAO' });
    expect(await cancelarPeriodoReconciliacao('per-1', ctx)).toEqual({ estado: 'CANCELADO' });
  });
});

describe('executarReconciliacao', () => {
  it('projecta, corre o motor e passa um período ABERTO a EM_RECONCILIACAO', async () => {
    mocks.projetar.mockResolvedValue({ criados: 4 });
    mocks.matching.mockResolvedValue({ propostas: 2 });
    const r = await executarReconciliacao('conta-1', ctx);
    expect(r).toEqual({ projectados: 4, matching: { propostas: 2 } });
    expect(mocks.projetar.mock.invocationCallOrder[0]).toBeLessThan(mocks.matching.mock.invocationCallOrder[0]);
    // Condicional ao estado: um período cancelado ou fechado entretanto não é tocado.
    expect(db.periodoReconciliacao.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', contaBancariaId: 'conta-1', estado: 'ABERTO' },
      data: { estado: 'EM_RECONCILIACAO' },
    });
  });
});

// ---------------------------------------------------------------------------
// Correspondências
// ---------------------------------------------------------------------------

describe('confirmarCorrespondencias', () => {
  const sugestao = (extra: object = {}) => ({
    id: 'c1', confirmadaEm: null, diferencaValor: D(0), contaBancariaId: 'conta-1',
    linhasBanco: [{ movimentoBancarioId: 'b1' }], linhasContabilidade: [{ movimentoContabilisticoId: 'k1' }], ...extra,
  });
  beforeEach(() => {
    db.correspondenciaBancaria.findFirst.mockResolvedValue(sugestao());
    db.movimentoBancario.findMany.mockResolvedValue([{ estado: 'PENDENTE', correspondenciaAtivaId: 'c1' }]);
    db.movimentoContabilistico.findMany.mockResolvedValue([{ estado: 'EM_TRANSITO', correspondenciaAtivaId: 'c1' }]);
  });

  it('confirma: os dois lados passam a RECONCILIADO e a correspondência ganha autor e data', async () => {
    expect(await confirmarCorrespondencias({ ids: ['c1'] }, ctx)).toEqual({ confirmadas: ['c1'], recusadas: [] });
    expect(db.movimentoBancario.updateMany.mock.calls[0][0]).toEqual({
      where: { tenantId: 'tenant-a', correspondenciaAtivaId: 'c1', id: { in: ['b1'] } },
      data: { estado: 'RECONCILIADO' },
    });
    expect(db.correspondenciaBancaria.update.mock.calls[0][0].data).toMatchObject({ confirmadaPorId: 'user-1' });
  });

  it('RF §10: diferença acima da tolerância só com justificação, e fica RECONCILIADO_MANUALMENTE', async () => {
    db.correspondenciaBancaria.findFirst.mockResolvedValue(sugestao({ diferencaValor: D(-500) }));
    const sem = await confirmarCorrespondencias({ ids: ['c1'] }, ctx);
    expect(sem.recusadas).toEqual([{ id: 'c1', motivo: expect.stringMatching(/justifique/) }]);
    expect(db.movimentoBancario.updateMany).not.toHaveBeenCalled();

    const com = await confirmarCorrespondencias({ ids: ['c1'], justificacao: 'Comissão retida pelo banco na origem' }, ctx);
    expect(com.confirmadas).toEqual(['c1']);
    expect(db.movimentoBancario.updateMany.mock.calls[0][0].data).toEqual({ estado: 'RECONCILIADO_MANUALMENTE' });
  });

  it('um lote com uma recusa não desfaz as outras', async () => {
    db.correspondenciaBancaria.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sugestao({ id: 'c2' }));
    db.movimentoBancario.findMany.mockResolvedValue([{ estado: 'PENDENTE', correspondenciaAtivaId: 'c2' }]);
    db.movimentoContabilistico.findMany.mockResolvedValue([{ estado: 'PENDENTE', correspondenciaAtivaId: 'c2' }]);
    const r = await confirmarCorrespondencias({ ids: ['c-alheia', 'c2'] }, ctx);
    expect(r.confirmadas).toEqual(['c2']);
    expect(r.recusadas.map((x) => x.id)).toEqual(['c-alheia']);
    expect(db.correspondenciaBancaria.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-a', revertida: false });
  });

  it('movimento que já não pertence à correspondência → recusada, nada escrito', async () => {
    db.movimentoBancario.findMany.mockResolvedValue([{ estado: 'PENDENTE', correspondenciaAtivaId: 'outra' }]);
    const r = await confirmarCorrespondencias({ ids: ['c1'] }, ctx);
    expect(r.recusadas).toHaveLength(1);
    expect(db.movimentoBancario.updateMany).not.toHaveBeenCalled();
  });
});

describe('reconciliarManualmente — RF §13, CA07', () => {
  const bancos = [{ id: 'b1', contaBancariaId: 'conta-1', estado: 'BANCO_SEM_CONTABILIZACAO', correspondenciaAtivaId: null, valor: D(100500), natureza: 'CREDITO', dataMovimento: dia(12) }];
  const contabs = [{ id: 'k1', contaBancariaId: 'conta-1', estado: 'CONTABILIDADE_SEM_BANCO', correspondenciaAtivaId: null, valor: D(100000), natureza: 'CREDITO', dataContabilistica: dia(10) }];
  const manual = (extra: object = {}) =>
    reconciliarManualmente({ movimentosBancariosIds: ['b1'], movimentosContabilisticosIds: ['k1'], justificacao: 'Transferência processada dois dias depois', ...extra }, ctx);

  beforeEach(() => {
    db.movimentoBancario.findMany.mockResolvedValue(bancos);
    db.movimentoContabilistico.findMany.mockResolvedValue(contabs);
  });

  it('CA07: cria a correspondência MANUAL com justificação, autor e diferença, e reclama os dois lados', async () => {
    await manual();
    const data = db.correspondenciaBancaria.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: 'tenant-a', tipo: 'MANUAL', regra: 'MANUAL', automatica: false,
      justificacao: 'Transferência processada dois dias depois', confirmadaPorId: 'user-1', diferencaDias: 2,
    });
    expect(data.diferencaValor.equals(D(500))).toBe(true);
    expect(db.movimentoBancario.updateMany.mock.calls[0][0]).toEqual({
      where: { tenantId: 'tenant-a', id: { in: ['b1'] }, correspondenciaAtivaId: null },
      data: { correspondenciaAtivaId: 'corr-nova', estado: 'RECONCILIADO_MANUALMENTE' },
    });
  });

  it('justificação em branco é recusada', async () => {
    await expect(manual({ justificacao: '   ' })).rejects.toMatchObject({ code: 'JUSTIFICACAO_OBRIGATORIA' });
  });

  it('RF §14: movimento com correspondência activa → MOVIMENTO_RESERVADO', async () => {
    db.movimentoBancario.findMany.mockResolvedValue([{ ...bancos[0], correspondenciaAtivaId: 'sugestao' }]);
    await expect(manual()).rejects.toMatchObject({ code: 'MOVIMENTO_RESERVADO' });
    expect(db.correspondenciaBancaria.create).not.toHaveBeenCalled();
  });

  it('RF §14: reclamado entre a leitura e a escrita → lança, e a transacção desfaz a correspondência', async () => {
    db.movimentoContabilistico.updateMany.mockResolvedValue({ count: 0 });
    await expect(manual()).rejects.toMatchObject({ code: 'MOVIMENTO_RESERVADO' });
  });

  it('RF §15: N:M só com permitirAgregacao e dentro do tecto', async () => {
    db.movimentoContabilistico.findMany.mockResolvedValue([contabs[0], { ...contabs[0], id: 'k2' }]);
    await expect(manual({ movimentosContabilisticosIds: ['k1', 'k2'] })).rejects.toMatchObject({ code: 'AGREGACAO_NAO_PERMITIDA' });
    db.contaBancaria.findFirst.mockResolvedValue({ ...CONTA, permitirAgregacao: true });
    db.movimentoContabilistico.updateMany.mockResolvedValue({ count: 2 });
    await manual({ movimentosContabilisticosIds: ['k1', 'k2'] });
    expect(db.correspondenciaBancaria.create.mock.calls[0][0].data.tipo).toBe('AGREGADO');
  });

  it('não reconcilia entradas com saídas, nem movimentos de contas diferentes, nem de outro tenant', async () => {
    db.movimentoContabilistico.findMany.mockResolvedValueOnce([{ ...contabs[0], natureza: 'DEBITO' }]);
    await expect(manual()).rejects.toMatchObject({ code: 'NATUREZA_DIVERGENTE' });
    db.movimentoContabilistico.findMany.mockResolvedValueOnce([{ ...contabs[0], contaBancariaId: 'conta-2' }]);
    await expect(manual()).rejects.toMatchObject({ code: 'CONTAS_DIFERENTES' });
    db.movimentoContabilistico.findMany.mockResolvedValueOnce([]);
    await expect(manual()).rejects.toBeInstanceOf(NotFoundError);
    expect(db.movimentoContabilistico.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-a' });
  });
});

describe('reverterCorrespondencia — RF §18, §19', () => {
  it('reverte: marca revertida com autor, liberta os lados e devolve os reconciliados a PENDENTE', async () => {
    db.correspondenciaBancaria.findFirst.mockResolvedValue({ id: 'c1', periodo: null });
    db.movimentoBancario.findMany.mockResolvedValue([{ estado: 'RECONCILIADO' }]);
    db.movimentoContabilistico.findMany.mockResolvedValue([{ estado: 'RECONCILIADO' }]);
    const r = await reverterCorrespondencia('c1', ctx);
    expect(r).toMatchObject({ revertida: true, revertidaPorId: 'user-1' });
    expect(db.movimentoBancario.updateMany.mock.calls[0][0]).toEqual({
      where: { tenantId: 'tenant-a', correspondenciaAtivaId: 'c1', estado: { in: ['RECONCILIADO', 'RECONCILIADO_MANUALMENTE', 'DIFERENCA_VALOR'] } },
      data: { correspondenciaAtivaId: null, estado: 'PENDENTE' },
    });
  });

  it('sugestão rejeitada: os lados ficam livres sem mudar de estado (EM_TRANSITO não volta a PENDENTE)', async () => {
    db.correspondenciaBancaria.findFirst.mockResolvedValue({ id: 'c1', periodo: null });
    db.movimentoBancario.findMany.mockResolvedValue([{ estado: 'BANCO_SEM_CONTABILIZACAO' }]);
    db.movimentoContabilistico.findMany.mockResolvedValue([{ estado: 'EM_TRANSITO' }]);
    await reverterCorrespondencia('c1', ctx);
    expect(db.movimentoContabilistico.updateMany.mock.calls[1][0]).toEqual({
      where: { tenantId: 'tenant-a', correspondenciaAtivaId: 'c1' },
      data: { correspondenciaAtivaId: null },
    });
  });

  it('correspondência de um período já reconciliado não se reverte', async () => {
    db.correspondenciaBancaria.findFirst.mockResolvedValue({ id: 'c1', periodo: { estado: 'RECONCILIADO' } });
    await expect(reverterCorrespondencia('c1', ctx)).rejects.toMatchObject({ code: 'PERIODO_RECONCILIACAO_FECHADO' });
    expect(db.correspondenciaBancaria.update).not.toHaveBeenCalled();
  });

  it('correspondência de outro tenant, ou já revertida → NotFoundError', async () => {
    db.correspondenciaBancaria.findFirst.mockResolvedValue(null);
    await expect(reverterCorrespondencia('c1', ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.correspondenciaBancaria.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', tenantId: 'tenant-a', revertida: false });
  });
});

describe('definirIgnorado', () => {
  it('ignora um movimento livre por `update` de uma linha (auditado)', async () => {
    db.movimentoBancario.findFirst.mockResolvedValue({ id: 'b1', estado: 'BANCO_SEM_CONTABILIZACAO', correspondenciaAtivaId: null });
    db.movimentoBancario.update.mockResolvedValue({});
    await definirIgnorado({ lado: 'BANCO', id: 'b1', ignorado: true }, ctx);
    expect(db.movimentoBancario.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { estado: 'IGNORADO' } });
  });

  it('não ignora um movimento reservado, nem «reactiva» um que não está ignorado', async () => {
    db.movimentoContabilistico.findFirst.mockResolvedValueOnce({ id: 'k1', estado: 'PENDENTE', correspondenciaAtivaId: 'c1' });
    await expect(definirIgnorado({ lado: 'CONTABILIDADE', id: 'k1', ignorado: true }, ctx)).rejects.toMatchObject({ code: 'MOVIMENTO_RESERVADO' });
    db.movimentoContabilistico.findFirst.mockResolvedValueOnce({ id: 'k1', estado: 'EM_TRANSITO', correspondenciaAtivaId: null });
    await expect(definirIgnorado({ lado: 'CONTABILIDADE', id: 'k1', ignorado: false }, ctx)).rejects.toMatchObject({ code: 'TRANSICAO_INVALIDA' });
  });
});

describe('sugerirLancamento — RF §9', () => {
  const mov = { id: 'b1', contaBancariaId: 'conta-1', descricao: 'Comissão de manutenção', natureza: 'CREDITO', valor: D(500), dataMovimento: dia(15), estado: 'BANCO_SEM_CONTABILIZACAO' };

  it('sugere Débito contrapartida / Crédito banco pela regra configurada, sem criar nada', async () => {
    db.movimentoBancario.findFirst.mockResolvedValue(mov);
    db.regraSugestaoLancamento.findMany.mockResolvedValue([
      { id: 'r1', contaBancariaId: null, padrao: 'COMISSAO|ENCARGO', natureza: 'CREDITO', contaContrapartidaId: 'pgc-6981', prioridade: 100 },
    ]);
    const s = await sugerirLancamento('b1', ctx);
    expect(s!.regraId).toBe('r1');
    expect(s!.partidas.map((p) => [p.contaId, p.tipo, p.valor.toFixed(2)])).toEqual([
      ['pgc-121', 'CREDITO', '500.00'],
      ['pgc-6981', 'DEBITO', '500.00'],
    ]);
    expect(db.regraSugestaoLancamento.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'tenant-a', ativo: true });
  });

  it('sem regra que case, ou movimento que não é BANCO_SEM_CONTABILIZACAO → null', async () => {
    db.movimentoBancario.findFirst.mockResolvedValue(mov);
    db.regraSugestaoLancamento.findMany.mockResolvedValue([]);
    expect(await sugerirLancamento('b1', ctx)).toBeNull();
    db.movimentoBancario.findFirst.mockResolvedValue({ ...mov, estado: 'RECONCILIADO' });
    expect(await sugerirLancamento('b1', ctx)).toBeNull();
  });
});
