/**
 * Testes do serviço de reconciliação bancária com Prisma mockado (a DB
 * partilhada não tem as colunas novas até à migração do orquestrador).
 * Foco: isolamento multi-tenant (fecho do BLOCKER da Wave 2), regras de
 * negócio (RECONCILIACAO_EM_ABERTO, RECONCILIACAO_NAO_BALANCEADA,
 * RECONCILIACAO_IMUTAVEL) e idempotência de geração/importação.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors';

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn(),
  });
  const db = {
    contaPGC: model(),
    contaBancaria: model(),
    reconciliacaoBancaria: model(),
    itemReconciliacaoBancaria: model(),
    partidaLancamento: model(),
  };
  return { db };
});

vi.mock('@/server/db/client', () => ({
  prisma: mocks.db,
  prismaBase: {
    ...mocks.db,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mocks.db),
  },
}));

import {
  iniciarReconciliacao,
  gerarItensRazao,
  importarExtrato,
  marcarItemReconciliado,
  concluirReconciliacao,
  cancelarReconciliacao,
  obterReconciliacao,
  saldoContabilAte,
  criarContaBancaria,
} from '../contabilidade.service';

const db = mocks.db;
const ctx = { tenantId: 'tenant-a', userId: 'user-1' };
const D = (v: string | number) => new Prisma.Decimal(v);

beforeEach(() => {
  vi.clearAllMocks();
  // defaults seguros
  db.partidaLancamento.findMany.mockResolvedValue([]);
  db.partidaLancamento.groupBy.mockResolvedValue([]);
  db.itemReconciliacaoBancaria.findMany.mockResolvedValue([]);
  db.itemReconciliacaoBancaria.createMany.mockResolvedValue({ count: 0 });
  db.itemReconciliacaoBancaria.updateMany.mockResolvedValue({ count: 1 });
  db.reconciliacaoBancaria.update.mockImplementation(async (args: { data: unknown }) => args.data);
});

// ---------------------------------------------------------------------------
// saldoContabilAte
// ---------------------------------------------------------------------------

describe('saldoContabilAte', () => {
  it('conta devedora: saldo = Σ débitos − Σ créditos de lançamentos LANCADO', async () => {
    db.partidaLancamento.groupBy.mockResolvedValue([
      { tipo: 'DEBITO', _sum: { valor: D('1500.00') } },
      { tipo: 'CREDITO', _sum: { valor: D('600.00') } },
    ]);
    const saldo = await saldoContabilAte('conta-1', new Date('2026-06-30'), ctx);
    expect(saldo.equals(D('900.00'))).toBe(true);

    const where = db.partidaLancamento.groupBy.mock.calls[0][0].where;
    expect(where.tenantId).toBe(ctx.tenantId);
    expect(where.lancamento.status).toBe('LANCADO');
    expect(where.lancamento.data).toEqual({ lte: new Date('2026-06-30') });
  });

  it('exclusivo usa < (saldo de abertura)', async () => {
    await saldoContabilAte('conta-1', new Date('2026-06-01'), ctx, { exclusivo: true });
    const where = db.partidaLancamento.groupBy.mock.calls[0][0].where;
    expect(where.lancamento.data).toEqual({ lt: new Date('2026-06-01') });
  });
});

// ---------------------------------------------------------------------------
// iniciarReconciliacao
// ---------------------------------------------------------------------------

describe('iniciarReconciliacao', () => {
  const input = {
    contaBancariaId: 'c'.repeat(25),
    dataInicio: new Date('2026-06-01'),
    dataFim: new Date('2026-06-30'),
    saldoInicialBanco: 500,
    saldoFinalBanco: 1000,
  };

  it('conta bancária de outro tenant → NotFoundError (filtro tenantId)', async () => {
    db.contaBancaria.findFirst.mockResolvedValue(null);
    await expect(iniciarReconciliacao(input, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.contaBancaria.findFirst.mock.calls[0][0].where.tenantId).toBe(ctx.tenantId);
  });

  it('já existe EM_ANDAMENTO para a conta → RECONCILIACAO_EM_ABERTO', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({ id: input.contaBancariaId, contaContabilId: 'pgc-1' });
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ id: 'rec-aberta' });
    await expect(iniciarReconciliacao(input, ctx)).rejects.toMatchObject({
      code: 'RECONCILIACAO_EM_ABERTO',
    });
  });

  it('calcula saldos contabilísticos reais e gera itens do razão', async () => {
    db.contaBancaria.findFirst.mockResolvedValue({ id: input.contaBancariaId, contaContabilId: 'pgc-1' });
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(null);
    // saldo inicial (lt): 500 − 100 = 400; saldo final (lte): 1200 − 300 = 900
    db.partidaLancamento.groupBy
      .mockResolvedValueOnce([
        { tipo: 'DEBITO', _sum: { valor: D('500') } },
        { tipo: 'CREDITO', _sum: { valor: D('100') } },
      ])
      .mockResolvedValueOnce([
        { tipo: 'DEBITO', _sum: { valor: D('1200') } },
        { tipo: 'CREDITO', _sum: { valor: D('300') } },
      ]);
    db.reconciliacaoBancaria.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'rec-1',
      ...args.data,
    }));
    db.partidaLancamento.findMany.mockResolvedValue([
      {
        lancamentoId: 'l-1',
        tipo: 'DEBITO',
        valor: D('250.00'),
        historico: null,
        lancamento: { data: new Date('2026-06-10'), historico: 'Depósito' },
      },
    ]);

    await iniciarReconciliacao(input, ctx);

    const criado = db.reconciliacaoBancaria.create.mock.calls[0][0].data;
    expect(criado.tenantId).toBe(ctx.tenantId);
    expect(criado.saldoInicialContabil.equals(D('400'))).toBe(true);
    expect(criado.saldoFinalContabil.equals(D('900'))).toBe(true);
    expect(criado.diferencaNaoConciliada.equals(D('100'))).toBe(true); // 1000 − 900
    expect(criado.status).toBe('EM_ANDAMENTO');

    // item do razão gerado
    const item = db.itemReconciliacaoBancaria.create.mock.calls[0][0].data;
    expect(item).toMatchObject({
      tenantId: ctx.tenantId,
      tipo: 'LANCAMENTO_CONTABIL',
      lancamentoId: 'l-1',
      tipoMovimento: 'DEBITO',
      conciliado: false,
      descricao: 'Depósito',
    });
  });
});

// ---------------------------------------------------------------------------
// gerarItensRazao (idempotência)
// ---------------------------------------------------------------------------

describe('gerarItensRazao', () => {
  it('não duplica itens de lançamentos já representados', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({
      id: 'rec-1',
      dataInicio: new Date('2026-06-01'),
      dataFim: new Date('2026-06-30'),
      contaBancariaId: 'cb-1',
      status: 'EM_ANDAMENTO',
    });
    db.contaBancaria.findFirst.mockResolvedValue({ contaContabilId: 'pgc-1' });
    db.partidaLancamento.findMany.mockResolvedValue([
      { lancamentoId: 'l-1', tipo: 'DEBITO', valor: D('10'), historico: null, lancamento: { data: new Date(), historico: 'A' } },
      { lancamentoId: 'l-2', tipo: 'CREDITO', valor: D('20'), historico: 'x', lancamento: { data: new Date(), historico: 'B' } },
    ]);
    db.itemReconciliacaoBancaria.findMany.mockResolvedValue([{ lancamentoId: 'l-1' }]);

    const res = await gerarItensRazao('rec-1', ctx);
    expect(res.criados).toBe(1);
    expect(db.itemReconciliacaoBancaria.create).toHaveBeenCalledTimes(1);
    expect(db.itemReconciliacaoBancaria.create.mock.calls[0][0].data.lancamentoId).toBe('l-2');
  });

  it('reconciliação concluída é imutável', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ id: 'rec-1', status: 'CONCLUIDA' });
    await expect(gerarItensRazao('rec-1', ctx)).rejects.toMatchObject({ code: 'RECONCILIACAO_IMUTAVEL' });
  });
});

// ---------------------------------------------------------------------------
// importarExtrato (idempotência por extratoReferencia)
// ---------------------------------------------------------------------------

describe('importarExtrato', () => {
  const linhas = [
    { extratoReferencia: 'REF-1', data: new Date('2026-06-05'), descricao: 'TRF', valor: 100, tipoMovimento: 'DEBITO' as const },
    { extratoReferencia: 'REF-2', data: new Date('2026-06-06'), descricao: 'TAXA', valor: 50, tipoMovimento: 'CREDITO' as const },
  ];

  it('linhas já importadas são ignoradas (não duplica)', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ id: 'rec-1', status: 'EM_ANDAMENTO' });
    db.itemReconciliacaoBancaria.findMany.mockResolvedValue([{ extratoReferencia: 'REF-1' }]);
    db.itemReconciliacaoBancaria.createMany.mockResolvedValue({ count: 1 });

    const res = await importarExtrato({ reconciliacaoId: 'rec-1', linhas }, ctx);
    expect(res).toEqual({ criados: 1, ignorados: 1 });

    const args = db.itemReconciliacaoBancaria.createMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toHaveLength(1);
    expect(args.data[0]).toMatchObject({
      tenantId: ctx.tenantId,
      tipo: 'EXTRATO_BANCARIO',
      extratoReferencia: 'REF-2',
    });
    expect(args.data[0].valor.equals(D('50.00'))).toBe(true);
  });

  it('reconciliação de outro tenant → NotFoundError', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(null);
    await expect(importarExtrato({ reconciliacaoId: 'rec-x', linhas }, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.reconciliacaoBancaria.findFirst.mock.calls[0][0].where.tenantId).toBe(ctx.tenantId);
  });

  it('reconciliação concluída → RECONCILIACAO_IMUTAVEL', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ id: 'rec-1', status: 'CONCLUIDA' });
    await expect(importarExtrato({ reconciliacaoId: 'rec-1', linhas }, ctx)).rejects.toMatchObject({
      code: 'RECONCILIACAO_IMUTAVEL',
    });
  });
});

// ---------------------------------------------------------------------------
// marcarItemReconciliado
// ---------------------------------------------------------------------------

describe('marcarItemReconciliado', () => {
  const recAberta = {
    id: 'rec-1',
    status: 'EM_ANDAMENTO',
    saldoFinalBanco: D('1000.00'),
    saldoFinalContabil: D('900.00'),
  };
  const inputBase = {
    reconciliacaoId: 'rec-1',
    itemId: 'item-1',
    conciliado: true,
  };

  it('reconciliação cross-tenant → NotFoundError e filtro por tenantId', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(null);
    await expect(marcarItemReconciliado(inputBase, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.reconciliacaoBancaria.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'rec-1',
      tenantId: ctx.tenantId,
    });
  });

  it('item cross-tenant/da reconciliação errada → NotFoundError', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(recAberta);
    db.itemReconciliacaoBancaria.findFirst.mockResolvedValue(null);
    await expect(marcarItemReconciliado(inputBase, ctx)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.itemReconciliacaoBancaria.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'item-1',
      tenantId: ctx.tenantId,
      reconciliacaoId: 'rec-1',
    });
  });

  it('concluída é imutável', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ ...recAberta, status: 'CONCLUIDA' });
    await expect(marcarItemReconciliado(inputBase, ctx)).rejects.toMatchObject({
      code: 'RECONCILIACAO_IMUTAVEL',
    });
  });

  it('conciliar item de extracto recalcula a diferença na transacção', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(recAberta);
    db.itemReconciliacaoBancaria.findFirst.mockResolvedValue({
      id: 'item-1',
      tipo: 'EXTRATO_BANCARIO',
      itemParId: null,
      observacoes: null,
    });
    // Estado após a escrita: item conciliado explica os 100 de diferença
    db.itemReconciliacaoBancaria.findMany.mockResolvedValue([
      { tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'DEBITO', valor: D('100.00'), conciliado: true },
    ]);

    await marcarItemReconciliado(inputBase, ctx);

    const updateItem = db.itemReconciliacaoBancaria.updateMany.mock.calls[0][0];
    expect(updateItem.where).toMatchObject({ id: 'item-1', tenantId: ctx.tenantId });
    expect(updateItem.data.conciliado).toBe(true);

    const updateRec = db.reconciliacaoBancaria.update.mock.calls[0][0];
    expect(updateRec.data.diferencaNaoConciliada.isZero()).toBe(true);
  });

  it('conciliar em par: par do mesmo lado → PAR_INVALIDO', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(recAberta);
    db.itemReconciliacaoBancaria.findFirst
      .mockResolvedValueOnce({ id: 'item-1', tipo: 'EXTRATO_BANCARIO', itemParId: null, observacoes: null })
      .mockResolvedValueOnce({ id: 'item-2', tipo: 'EXTRATO_BANCARIO' });
    await expect(
      marcarItemReconciliado({ ...inputBase, itemParId: 'i'.repeat(25) }, ctx),
    ).rejects.toMatchObject({ code: 'PAR_INVALIDO' });
  });

  it('desconciliar desfaz também o par associado (com filtro de tenant)', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(recAberta);
    db.itemReconciliacaoBancaria.findFirst.mockResolvedValue({
      id: 'item-1',
      tipo: 'LANCAMENTO_CONTABIL',
      itemParId: 'item-2',
      observacoes: null,
    });
    await marcarItemReconciliado({ ...inputBase, conciliado: false }, ctx);

    const calls = db.itemReconciliacaoBancaria.updateMany.mock.calls;
    const updatePar = calls.find((c: { where: { id: string } }[]) => c[0].where.id === 'item-2');
    expect(updatePar).toBeDefined();
    expect(updatePar![0].where).toMatchObject({ tenantId: ctx.tenantId, reconciliacaoId: 'rec-1' });
    expect(updatePar![0].data).toMatchObject({ conciliado: false, itemParId: null });
  });
});

// ---------------------------------------------------------------------------
// concluir / cancelar
// ---------------------------------------------------------------------------

describe('concluirReconciliacao', () => {
  const rec = {
    id: 'rec-1',
    status: 'EM_ANDAMENTO',
    contaBancariaId: 'cb-1',
    dataInicio: new Date('2026-06-01'),
    dataFim: new Date('2026-06-30'),
    saldoFinalBanco: D('1000.00'),
    saldoFinalContabil: D('900.00'),
    observacoes: null,
  };

  beforeEach(() => {
    db.contaBancaria.findFirst.mockResolvedValue({ contaContabilId: 'pgc-1' });
    // saldo contabilístico recalculado: 900 (inicial e final iguais para o teste)
    db.partidaLancamento.groupBy.mockResolvedValue([{ tipo: 'DEBITO', _sum: { valor: D('900') } }]);
  });

  it('diferença ≠ 0 sem justificação → RECONCILIACAO_NAO_BALANCEADA', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(rec);
    db.itemReconciliacaoBancaria.findMany.mockResolvedValue([]);
    await expect(concluirReconciliacao({ id: 'rec-1' }, ctx)).rejects.toMatchObject({
      code: 'RECONCILIACAO_NAO_BALANCEADA',
    });
  });

  it('diferença ≠ 0 com justificação → conclui com observações', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(rec);
    db.itemReconciliacaoBancaria.findMany.mockResolvedValue([]);
    await concluirReconciliacao({ id: 'rec-1', observacoes: 'Taxa bancária por lançar' }, ctx);
    const update = db.reconciliacaoBancaria.update.mock.calls[0][0];
    expect(update.data.status).toBe('CONCLUIDA');
    expect(update.data.observacoes).toBe('Taxa bancária por lançar');
    expect(update.data.diferencaNaoConciliada.equals(D('100'))).toBe(true);
  });

  it('diferença 0 → conclui sem justificação', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(rec);
    db.itemReconciliacaoBancaria.findMany.mockResolvedValue([
      { tipo: 'EXTRATO_BANCARIO', tipoMovimento: 'DEBITO', valor: D('100.00'), conciliado: true },
    ]);
    await concluirReconciliacao({ id: 'rec-1' }, ctx);
    expect(db.reconciliacaoBancaria.update.mock.calls[0][0].data.status).toBe('CONCLUIDA');
  });

  it('já concluída → TRANSICAO_INVALIDA', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ ...rec, status: 'CONCLUIDA' });
    await expect(concluirReconciliacao({ id: 'rec-1' }, ctx)).rejects.toMatchObject({
      code: 'TRANSICAO_INVALIDA',
    });
  });
});

describe('cancelarReconciliacao', () => {
  it('EM_ANDAMENTO → CANCELADA', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ id: 'rec-1', status: 'EM_ANDAMENTO' });
    await cancelarReconciliacao('rec-1', ctx);
    expect(db.reconciliacaoBancaria.update.mock.calls[0][0].data.status).toBe('CANCELADA');
  });

  it('CANCELADA é terminal', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({ id: 'rec-1', status: 'CANCELADA' });
    await expect(cancelarReconciliacao('rec-1', ctx)).rejects.toMatchObject({ code: 'TRANSICAO_INVALIDA' });
  });
});

// ---------------------------------------------------------------------------
// obterReconciliacao
// ---------------------------------------------------------------------------

describe('obterReconciliacao', () => {
  it('cross-tenant devolve null (404 na camada acima)', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue(null);
    const res = await obterReconciliacao('rec-x', ctx);
    expect(res).toBeNull();
    expect(db.reconciliacaoBancaria.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'rec-x',
      tenantId: ctx.tenantId,
    });
  });

  it('separa itens razão vs extracto', async () => {
    db.reconciliacaoBancaria.findFirst.mockResolvedValue({
      id: 'rec-1',
      contaBancaria: { id: 'cb-1', banco: 'BIM', agencia: '001', numeroConta: '123', contaContabilId: 'pgc-1' },
      itens: [
        { id: 'i1', tipo: 'LANCAMENTO_CONTABIL' },
        { id: 'i2', tipo: 'EXTRATO_BANCARIO' },
        { id: 'i3', tipo: 'LANCAMENTO_CONTABIL' },
      ],
    });
    const res = await obterReconciliacao('rec-1', ctx);
    expect(res?.itensRazao.map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(res?.itensExtrato.map((i) => i.id)).toEqual(['i2']);
  });
});

// ---------------------------------------------------------------------------
// criarContaBancaria (Requisito 1)
// ---------------------------------------------------------------------------

describe('criarContaBancaria', () => {
  const input = {
    banco: 'BIM',
    agencia: '001',
    numeroConta: '12345',
    tipoConta: 'CORRENTE' as const,
    moeda: 'MZN',
    contaContabilId: 'p'.repeat(25),
  };

  it('conta PGC inexistente no tenant → NotFoundError', async () => {
    db.contaPGC.findFirst.mockResolvedValue(null);
    await expect(criarContaBancaria(input, ctx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('conta PGC não-folha ou fora da classe 1 → CONTA_CONTABIL_INVALIDA', async () => {
    db.contaPGC.findFirst.mockResolvedValue({ aceitaLancamento: true, classe: 'CLASSE_4' });
    await expect(criarContaBancaria(input, ctx)).rejects.toMatchObject({ code: 'CONTA_CONTABIL_INVALIDA' });
  });

  it('duplicado [tenantId, banco, numeroConta] → CONTA_BANCARIA_DUPLICADA', async () => {
    db.contaPGC.findFirst.mockResolvedValue({ aceitaLancamento: true, classe: 'CLASSE_1' });
    db.contaBancaria.findFirst.mockResolvedValue({ id: 'cb-1' });
    await expect(criarContaBancaria(input, ctx)).rejects.toMatchObject({ code: 'CONTA_BANCARIA_DUPLICADA' });
  });

  it('cria com saldoAtual 0 (derivado, nunca do input)', async () => {
    db.contaPGC.findFirst.mockResolvedValue({ aceitaLancamento: true, classe: 'CLASSE_1' });
    db.contaBancaria.findFirst.mockResolvedValue(null);
    db.contaBancaria.create.mockImplementation(async (args: { data: unknown }) => args.data);
    await criarContaBancaria(input, ctx);
    const data = db.contaBancaria.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(ctx.tenantId);
    expect(data.saldoAtual.isZero()).toBe(true);
  });
});
