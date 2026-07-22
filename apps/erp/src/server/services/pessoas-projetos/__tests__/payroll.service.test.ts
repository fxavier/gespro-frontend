/**
 * Testes do serviço de payroll (Spec 06) — Prisma mockado (sem DB).
 *
 * Inclui o property test OBRIGATÓRIO: o lançamento contabilístico gerado
 * (massa salarial e pagamento) tem sempre débito == crédito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

// ── Mocks dos contratos WS D (antes de importar o serviço) ───────────────────
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn().mockResolvedValue({ id: 'lan-001' }),
  estornarLancamento: vi.fn().mockResolvedValue({ id: 'lan-estorno-001' }),
  obterLancamento: vi.fn().mockResolvedValue({ id: 'lan-001', status: 'LANCADO' }),
}));
vi.mock('@/server/services/financas/caixa.service', () => ({
  registarMovimentoCaixa: vi.fn().mockResolvedValue({ id: 'mov-001' }),
}));

// ── Mock do Prisma (transacção devolve o próprio mock) ───────────────────────
const txMock = vi.hoisted(() => ({
  folhaPagamento: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  payroll: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  linhaPayroll: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
  tabelaINSS: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  escalaoIRPS: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  colaborador: { findMany: vi.fn() },
  registoAssiduidade: { groupBy: vi.fn() },
  ausencia: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
  comissao: { findMany: vi.fn() },
  tenant: { findUnique: vi.fn() },
}));

vi.mock('@/server/db/client', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
    ...txMock,
  } as never,
  prismaBase: {} as never,
}));

import {
  PayrollService,
  montarLancamentoFolha,
  montarLancamentoPagamentoFolha,
  dataReferencia,
  PGC_PAYROLL,
  type TotaisFolha,
} from '../payroll.service';
import { TRANSICOES_PAYROLL } from '../payroll.interface';
import { transitar } from '../rh.service';
import {
  registarLancamentoContabilistico,
  estornarLancamento,
  obterLancamento,
} from '@/server/services/financas/contabilidade.service';
import { registarMovimentoCaixa } from '@/server/services/financas/caixa.service';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ctx = { tenantId: 'tenant-test', userId: 'user-test' };

const arbValor = (max: number) => fc.integer({ min: 0, max }).map((c) => D(c).div(100));

/** Soma débitos e créditos de um input de lançamento em Decimal exacto. */
function somas(partidas: { tipo: string; valor: Prisma.Decimal | string }[]) {
  let debito = D(0);
  let credito = D(0);
  for (const p of partidas) {
    const v = D(String(p.valor));
    if (p.tipo === 'DEBITO') debito = debito.plus(v);
    else credito = credito.plus(v);
  }
  return { debito, credito };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_PAYROLL — máquina de estados
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_PAYROLL', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_PAYROLL));
    for (const destinos of Object.values(TRANSICOES_PAYROLL)) {
      for (const d of destinos) expect(estados.has(d)).toBe(true);
    }
  });

  it('ciclo feliz: PENDENTE → PROCESSADO → PAGO', () => {
    expect(() => transitar(TRANSICOES_PAYROLL, 'PENDENTE', 'PROCESSADO')).not.toThrow();
    expect(() => transitar(TRANSICOES_PAYROLL, 'PROCESSADO', 'PAGO')).not.toThrow();
  });

  it('CANCELADO possível a partir de PENDENTE e PROCESSADO, não de PAGO', () => {
    expect(() => transitar(TRANSICOES_PAYROLL, 'PENDENTE', 'CANCELADO')).not.toThrow();
    expect(() => transitar(TRANSICOES_PAYROLL, 'PROCESSADO', 'CANCELADO')).not.toThrow();
    expect(() => transitar(TRANSICOES_PAYROLL, 'PAGO', 'CANCELADO')).toThrow(BusinessRuleError);
  });

  it('PAGO e CANCELADO são terminais; saltos inválidos rejeitados', () => {
    expect(TRANSICOES_PAYROLL.PAGO).toHaveLength(0);
    expect(TRANSICOES_PAYROLL.CANCELADO).toHaveLength(0);
    expect(() => transitar(TRANSICOES_PAYROLL, 'PENDENTE', 'PAGO')).toThrow(BusinessRuleError);
    expect(() => transitar(TRANSICOES_PAYROLL, 'CANCELADO', 'PENDENTE')).toThrow(BusinessRuleError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// montarLancamentoFolha — débito == crédito (property test obrigatório)
// ─────────────────────────────────────────────────────────────────────────────

const folhaRef = { id: 'folha-001', mesReferencia: 6, anoReferencia: 2026 };

const arbTotais: fc.Arbitrary<TotaisFolha> = fc
  .record({
    inssTrab: arbValor(10_000_000),
    inssEnt: arbValor(10_000_000),
    irps: arbValor(50_000_000),
    outros: arbValor(10_000_000),
    margem: arbValor(100_000_000),
  })
  .map((v) => ({
    // bruto ≥ descontos para líquido não-negativo (como garante o motor)
    totalBruto: v.inssTrab.plus(v.irps).plus(v.outros).plus(v.margem),
    totalInssTrabalhador: v.inssTrab,
    totalInssEntidade: v.inssEnt,
    totalIrps: v.irps,
    totalOutrosDescontos: v.outros,
  }));

describe('montarLancamentoFolha', () => {
  it('[property] débito == crédito, sempre', () => {
    fc.assert(
      fc.property(arbTotais, (t) => {
        const input = montarLancamentoFolha(folhaRef, t, new Date('2026-06-30'));
        const { debito, credito } = somas(input.partidas);
        expect(debito.eq(credito)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('[property] débito total = bruto + INSS entidade', () => {
    fc.assert(
      fc.property(arbTotais, (t) => {
        const input = montarLancamentoFolha(folhaRef, t, new Date('2026-06-30'));
        const { debito } = somas(input.partidas);
        expect(debito.eq(t.totalBruto.plus(t.totalInssEntidade))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('usa o diário SALARIOS e as contas PGC da folha', () => {
    const input = montarLancamentoFolha(
      folhaRef,
      {
        totalBruto: D(100000),
        totalInssTrabalhador: D(3000),
        totalInssEntidade: D(4000),
        totalIrps: D(15000),
        totalOutrosDescontos: D(2000),
      },
      new Date('2026-06-30'),
    );
    expect(input.diarioTipo).toBe('SALARIOS');
    expect(input.documentoOrigemTipo).toBe('FolhaPagamento');
    const contas = input.partidas.map((p) => p.contaCodigo);
    expect(contas).toContain(PGC_PAYROLL.GASTOS_REMUNERACOES);
    expect(contas).toContain(PGC_PAYROLL.GASTOS_ENCARGOS);
    expect(contas).toContain(PGC_PAYROLL.INSS_A_PAGAR);
    expect(contas).toContain(PGC_PAYROLL.IRPS_RETIDO_A_PAGAR);
    expect(contas).toContain(PGC_PAYROLL.OUTRAS_RETENCOES);
    expect(contas).toContain(PGC_PAYROLL.REMUNERACOES_A_PAGAR);
    // Crédito de INSS = trabalhador + entidade (7%)
    const inss = input.partidas.find((p) => p.contaCodigo === PGC_PAYROLL.INSS_A_PAGAR);
    expect(String(inss?.valor)).toBe('7000.00');
    // Líquido derivado: 100.000 − 3.000 − 15.000 − 2.000 = 80.000
    const liquido = input.partidas.find((p) => p.contaCodigo === PGC_PAYROLL.REMUNERACOES_A_PAGAR);
    expect(String(liquido?.valor)).toBe('80000.00');
  });

  it('omite partidas de valor zero (excepto bruto e líquido)', () => {
    const input = montarLancamentoFolha(
      folhaRef,
      {
        totalBruto: D(50000),
        totalInssTrabalhador: D(0),
        totalInssEntidade: D(0),
        totalIrps: D(0),
        totalOutrosDescontos: D(0),
      },
      new Date('2026-06-30'),
    );
    const { debito, credito } = somas(input.partidas);
    expect(debito.eq(credito)).toBe(true);
    expect(input.partidas).toHaveLength(2); // 622 débito + 4622 crédito
  });
});

describe('montarLancamentoPagamentoFolha', () => {
  it('[property] débito == crédito, sempre', () => {
    fc.assert(
      fc.property(arbValor(100_000_000), (liquido) => {
        const input = montarLancamentoPagamentoFolha(folhaRef, liquido, new Date());
        const { debito, credito } = somas(input.partidas);
        expect(debito.eq(credito)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('débito 4622 (remunerações a pagar) e crédito 121 (banco)', () => {
    const input = montarLancamentoPagamentoFolha(folhaRef, D(80000), new Date());
    expect(input.partidas).toEqual([
      expect.objectContaining({ contaCodigo: PGC_PAYROLL.REMUNERACOES_A_PAGAR, tipo: 'DEBITO' }),
      expect.objectContaining({ contaCodigo: PGC_PAYROLL.BANCO_DEPOSITOS_ORDEM, tipo: 'CREDITO' }),
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dataReferencia
// ─────────────────────────────────────────────────────────────────────────────

describe('dataReferencia', () => {
  it('devolve o dia 1 do mês em UTC', () => {
    const d = dataReferencia(2026, 6);
    expect(d.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processarFolhaMes — regras de negócio (Prisma mockado)
// ─────────────────────────────────────────────────────────────────────────────

const TABELA_INSS_ROW = {
  id: 'inss-1',
  taxaTrabalhador: D('0.03'),
  taxaEntidade: D('0.04'),
  tetoIncidencia: null,
};

const ESCALOES_ROWS = [
  { ordem: 1, limiteInferior: D(0), limiteSuperior: D(3500), taxa: D('0.10'), parcelaAbater: D(0), vigenciaInicio: new Date('2024-01-01') },
  { ordem: 2, limiteInferior: D(3500), limiteSuperior: D(14000), taxa: D('0.15'), parcelaAbater: D(175), vigenciaInicio: new Date('2024-01-01') },
  { ordem: 3, limiteInferior: D(14000), limiteSuperior: null, taxa: D('0.20'), parcelaAbater: D(875), vigenciaInicio: new Date('2024-01-01') },
];

describe('PayrollService.processarFolhaMes', () => {
  it('lança FOLHA_JA_PROCESSADA se a folha do mês está PROCESSADO', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue({ id: 'f1', status: 'PROCESSADO' });
    await expect(PayrollService.processarFolhaMes({ mes: 6, ano: 2026 }, ctx)).rejects.toMatchObject({
      code: 'FOLHA_JA_PROCESSADA',
    });
  });

  it('lança TABELA_INSS_EM_FALTA sem tabela vigente', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(null);
    txMock.folhaPagamento.create.mockResolvedValue({ id: 'f1', status: 'PENDENTE' });
    txMock.tabelaINSS.findFirst.mockResolvedValue(null);
    await expect(PayrollService.processarFolhaMes({ mes: 6, ano: 2026 }, ctx)).rejects.toMatchObject({
      code: 'TABELA_INSS_EM_FALTA',
    });
  });

  it('lança SEM_COLABORADORES_ACTIVOS quando não há colaboradores', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(null);
    txMock.folhaPagamento.create.mockResolvedValue({ id: 'f1', status: 'PENDENTE' });
    txMock.tabelaINSS.findFirst.mockResolvedValue(TABELA_INSS_ROW);
    txMock.escalaoIRPS.findMany.mockResolvedValue(ESCALOES_ROWS);
    txMock.colaborador.findMany.mockResolvedValue([]);
    await expect(PayrollService.processarFolhaMes({ mes: 6, ano: 2026 }, ctx)).rejects.toMatchObject({
      code: 'SEM_COLABORADORES_ACTIVOS',
    });
  });

  it('processa colaborador activo: cria Payroll + linhas com valores estatutários', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(null);
    txMock.folhaPagamento.create.mockResolvedValue({ id: 'f1', status: 'PENDENTE' });
    txMock.folhaPagamento.update.mockResolvedValue({});
    txMock.tabelaINSS.findFirst.mockResolvedValue(TABELA_INSS_ROW);
    txMock.escalaoIRPS.findMany.mockResolvedValue(ESCALOES_ROWS);
    txMock.colaborador.findMany.mockResolvedValue([
      {
        id: 'col-1',
        salarioBase: D(20000),
        subsidioAlimentacao: null,
        subsidioTransporte: null,
        subsidioHabitacao: null,
        subsidiosOutros: null,
        email: 'a@demo.mz',
      },
    ]);
    txMock.user.findMany.mockResolvedValue([]);
    txMock.payroll.findMany.mockResolvedValue([]); // sem payrolls existentes
    txMock.registoAssiduidade.groupBy.mockResolvedValue([]);
    txMock.ausencia.groupBy.mockResolvedValue([]);
    txMock.payroll.create.mockResolvedValue({ id: 'pay-1' });
    txMock.linhaPayroll.createMany.mockResolvedValue({ count: 3 });
    txMock.payroll.aggregate.mockResolvedValue({
      _sum: {
        salarioBruto: D(20000),
        descontoInss: D(600),
        encargoInssEntidade: D(800),
        descontoIrps: D(3125),
        descontoOutros: D(0),
        salarioLiquido: D(16275),
        custoTotalEntidade: D(20800),
      },
    });

    const r = await PayrollService.processarFolhaMes({ mes: 6, ano: 2026 }, ctx);
    expect(r).toEqual({ folhaId: 'f1', totalColaboradores: 1 });

    const criado = txMock.payroll.create.mock.calls[0][0].data;
    expect(criado.tenantId).toBe(ctx.tenantId);
    expect(criado.salarioBruto.toString()).toBe('20000');
    expect(criado.descontoInss.toString()).toBe('600'); // 3%
    expect(criado.encargoInssEntidade.toString()).toBe('800'); // 4% — encargo
    // baseIrps = 19.400 → 3.º escalão: 19.400×0.20 − 875 = 3.005
    expect(criado.descontoIrps.toString()).toBe('3005');
    expect(criado.salarioLiquido.toString()).toBe('16395'); // 20.000 − 600 − 3.005
    expect(criado.custoTotalEntidade.toString()).toBe('20800');
    expect(criado.status).toBe('PENDENTE');
  });

  it('não toca em payrolls PROCESSADO/PAGO (imutáveis) ao reprocessar', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue({ id: 'f1', status: 'PENDENTE' });
    txMock.folhaPagamento.update.mockResolvedValue({ id: 'f1', status: 'PENDENTE' });
    txMock.tabelaINSS.findFirst.mockResolvedValue(TABELA_INSS_ROW);
    txMock.escalaoIRPS.findMany.mockResolvedValue(ESCALOES_ROWS);
    txMock.colaborador.findMany.mockResolvedValue([
      {
        id: 'col-1',
        salarioBase: D(20000),
        subsidioAlimentacao: null,
        subsidioTransporte: null,
        subsidioHabitacao: null,
        subsidiosOutros: null,
        email: 'a@demo.mz',
      },
    ]);
    txMock.user.findMany.mockResolvedValue([]);
    txMock.registoAssiduidade.groupBy.mockResolvedValue([]);
    txMock.ausencia.groupBy.mockResolvedValue([]);
    txMock.payroll.findMany.mockResolvedValue([
      { id: 'pay-1', status: 'PROCESSADO', colaboradorId: 'col-1' },
    ]);
    txMock.payroll.aggregate.mockResolvedValue({ _sum: {} });

    const r = await PayrollService.processarFolhaMes({ mes: 6, ano: 2026 }, ctx);
    expect(r.totalColaboradores).toBe(0);
    expect(txMock.payroll.create).not.toHaveBeenCalled();
    expect(txMock.payroll.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// marcarProcessada / marcarPaga / cancelar
// ─────────────────────────────────────────────────────────────────────────────

const FOLHA_PENDENTE = {
  id: 'f1',
  tenantId: ctx.tenantId,
  mesReferencia: 6,
  anoReferencia: 2026,
  status: 'PENDENTE',
  totalBruto: D(100000),
  totalInssTrabalhador: D(3000),
  totalInssEntidade: D(4000),
  totalIrps: D(15000),
  totalOutrosDescontos: D(0),
  totalLiquido: D(82000),
  lancamentoId: null,
};

describe('PayrollService.marcarProcessada', () => {
  it('NotFound para folha inexistente (ou cross-tenant)', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(null);
    await expect(PayrollService.marcarProcessada('f-x', ctx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejeita transição inválida (já PROCESSADO)', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue({ ...FOLHA_PENDENTE, status: 'PROCESSADO' });
    await expect(PayrollService.marcarProcessada('f1', ctx)).rejects.toBeInstanceOf(BusinessRuleError);
    expect(registarLancamentoContabilistico).not.toHaveBeenCalled();
  });

  it('gera lançamento SALARIOS equilibrado e congela os payrolls', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PENDENTE);
    // 1.ª chamada: payrolls pendentes; 2.ª: payrolls com líquido negativo
    txMock.payroll.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    txMock.payroll.updateMany.mockResolvedValue({ count: 3 });
    txMock.folhaPagamento.update.mockResolvedValue({});

    const r = await PayrollService.marcarProcessada('f1', ctx);
    expect(r.lancamentoId).toBe('lan-001');

    const input = vi.mocked(registarLancamentoContabilistico).mock.calls[0][1];
    expect(input.diarioTipo).toBe('SALARIOS');
    const { debito, credito } = somas(input.partidas);
    expect(debito.eq(credito)).toBe(true);
    expect(debito.toString()).toBe('104000'); // bruto + INSS entidade

    expect(txMock.payroll.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PROCESSADO' } }),
    );
  });

  it('rejeita folha sem payrolls pendentes (FOLHA_VAZIA)', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PENDENTE);
    txMock.payroll.count.mockResolvedValue(0);
    await expect(PayrollService.marcarProcessada('f1', ctx)).rejects.toMatchObject({ code: 'FOLHA_VAZIA' });
  });

  it('rejeita folha com payroll de líquido negativo (LIQUIDO_NEGATIVO)', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PENDENTE);
    // 3 pendentes, 1 com salarioLiquido < 0
    txMock.payroll.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    await expect(PayrollService.marcarProcessada('f1', ctx)).rejects.toMatchObject({
      code: 'LIQUIDO_NEGATIVO',
    });
    expect(registarLancamentoContabilistico).not.toHaveBeenCalled();
  });
});

describe('PayrollService.marcarPaga', () => {
  const FOLHA_PROCESSADA = { ...FOLHA_PENDENTE, status: 'PROCESSADO', lancamentoId: 'lan-001' };

  it('rejeita pagar folha ainda PENDENTE', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PENDENTE);
    await expect(PayrollService.marcarPaga({ folhaId: 'f1' }, ctx)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('gera lançamento de pagamento equilibrado e marca payrolls PAGO', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PROCESSADA);
    txMock.payroll.updateMany.mockResolvedValue({ count: 3 });
    txMock.folhaPagamento.update.mockResolvedValue({});

    await PayrollService.marcarPaga({ folhaId: 'f1' }, ctx);

    const input = vi.mocked(registarLancamentoContabilistico).mock.calls[0][1];
    const { debito, credito } = somas(input.partidas);
    expect(debito.eq(credito)).toBe(true);
    expect(debito.toString()).toBe('82000'); // líquido
    expect(registarMovimentoCaixa).not.toHaveBeenCalled(); // sem sessão de caixa

    expect(txMock.payroll.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAGO' }) }),
    );
  });

  it('com sessaoCaixaId regista movimento de caixa (SANGRIA) via contrato WS D', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PROCESSADA);
    txMock.payroll.updateMany.mockResolvedValue({ count: 3 });
    txMock.folhaPagamento.update.mockResolvedValue({});

    await PayrollService.marcarPaga(
      { folhaId: 'f1', sessaoCaixaId: 'ckqsessao000000000000000w' },
      ctx,
    );
    expect(registarMovimentoCaixa).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tipo: 'SANGRIA', valor: '82000.00', documentoOrigemTipo: 'FolhaPagamento' }),
      ctx,
    );
  });
});

describe('PayrollService.cancelar', () => {
  it('folha PENDENTE cancela sem estorno', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue(FOLHA_PENDENTE);
    txMock.payroll.updateMany.mockResolvedValue({ count: 3 });
    txMock.folhaPagamento.update.mockResolvedValue({});

    await PayrollService.cancelar('f1', 'erro de processamento', ctx);
    expect(estornarLancamento).not.toHaveBeenCalled();
    expect(txMock.folhaPagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELADO' }) }),
    );
  });

  it('folha PROCESSADO estorna o lançamento (append-only) antes de cancelar', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue({
      ...FOLHA_PENDENTE,
      status: 'PROCESSADO',
      lancamentoId: 'lan-001',
    });
    txMock.payroll.updateMany.mockResolvedValue({ count: 3 });
    txMock.folhaPagamento.update.mockResolvedValue({});

    await PayrollService.cancelar('f1', 'valores errados', ctx);
    expect(estornarLancamento).toHaveBeenCalledWith(
      expect.objectContaining({ lancamentoId: 'lan-001' }),
      ctx,
    );
  });

  it('retry após falha parcial é idempotente: lançamento já ESTORNADO não é estornado de novo', async () => {
    // 1.ª tentativa estornou o lançamento mas a mudança de estados falhou;
    // no retry a folha ainda está PROCESSADO e o lançamento já está ESTORNADO.
    txMock.folhaPagamento.findFirst.mockResolvedValue({
      ...FOLHA_PENDENTE,
      status: 'PROCESSADO',
      lancamentoId: 'lan-001',
    });
    vi.mocked(obterLancamento).mockResolvedValueOnce({ id: 'lan-001', status: 'ESTORNADO' } as never);
    txMock.payroll.updateMany.mockResolvedValue({ count: 3 });
    txMock.folhaPagamento.update.mockResolvedValue({});

    await PayrollService.cancelar('f1', 'retry', ctx);
    expect(estornarLancamento).not.toHaveBeenCalled();
    // O retry completa a mudança de estados
    expect(txMock.folhaPagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELADO' }) }),
    );
  });

  it('folha PAGO não pode ser cancelada', async () => {
    txMock.folhaPagamento.findFirst.mockResolvedValue({ ...FOLHA_PENDENTE, status: 'PAGO' });
    await expect(PayrollService.cancelar('f1', 'x', ctx)).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ajustarLinhaManual / recalcularPayroll — imutabilidade após PROCESSADO
// ─────────────────────────────────────────────────────────────────────────────

describe('imutabilidade após PROCESSADO', () => {
  it('ajustarLinhaManual rejeita payroll não-PENDENTE', async () => {
    txMock.payroll.findFirst.mockResolvedValue({ id: 'pay-1', status: 'PROCESSADO' });
    await expect(
      PayrollService.ajustarLinhaManual(
        {
          payrollId: 'ckqpayroll00000000000000w',
          tipo: 'DESCONTO',
          natureza: 'ADIANTAMENTO',
          descricao: 'Adiantamento',
          valor: 1000,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'PAYROLL_IMUTAVEL' });
    expect(txMock.linhaPayroll.create).not.toHaveBeenCalled();
  });

  it('recalcularPayroll rejeita payroll não-PENDENTE', async () => {
    txMock.payroll.findFirst.mockResolvedValue({
      id: 'pay-1',
      status: 'PAGO',
      folhaId: 'f1',
      colaborador: {},
    });
    await expect(PayrollService.recalcularPayroll('pay-1', ctx)).rejects.toMatchObject({
      code: 'PAYROLL_IMUTAVEL',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LIQUIDO_NEGATIVO — descontos manuais nunca podem tornar o líquido negativo
// ─────────────────────────────────────────────────────────────────────────────

describe('ajustarLinhaManual — LIQUIDO_NEGATIVO', () => {
  it('rejeita desconto manual que excede os proventos (na mesma tx → linha não persiste)', async () => {
    // 1.ª findFirst: verificação de estado; 2.ª (no recálculo): payroll completo
    txMock.payroll.findFirst
      .mockResolvedValueOnce({ id: 'pay-1', status: 'PENDENTE' })
      .mockResolvedValueOnce({
        id: 'pay-1',
        status: 'PENDENTE',
        folhaId: 'f1',
        colaboradorId: 'col-1',
        mesReferencia: 6,
        anoReferencia: 2026,
        colaborador: {
          id: 'col-1',
          salarioBase: D(1000),
          subsidioAlimentacao: null,
          subsidioTransporte: null,
          subsidioHabitacao: null,
          subsidiosOutros: null,
          email: 'a@demo.mz',
        },
      });
    txMock.linhaPayroll.create.mockResolvedValue({ id: 'lin-1' });
    txMock.tabelaINSS.findFirst.mockResolvedValue(TABELA_INSS_ROW);
    txMock.escalaoIRPS.findMany.mockResolvedValue(ESCALOES_ROWS);
    txMock.user.findMany.mockResolvedValue([]);
    txMock.registoAssiduidade.groupBy.mockResolvedValue([]);
    txMock.ausencia.groupBy.mockResolvedValue([]);
    // Linhas manuais persistidas (inclui a acabada de criar): desconto 5.000 > bruto 1.000
    txMock.linhaPayroll.findMany.mockResolvedValue([
      { tipo: 'DESCONTO', natureza: 'ADIANTAMENTO', descricao: 'Adiantamento', valor: D(5000) },
    ]);

    await expect(
      PayrollService.ajustarLinhaManual(
        {
          payrollId: 'ckqpayroll00000000000000w',
          tipo: 'DESCONTO',
          natureza: 'ADIANTAMENTO',
          descricao: 'Adiantamento',
          valor: 5000,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'LIQUIDO_NEGATIVO' });
    // O recálculo abortou antes de gravar valores negativos
    expect(txMock.payroll.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tabelas paramétricas — versionamento por vigência
// ─────────────────────────────────────────────────────────────────────────────

describe('PayrollService.criarTabelaINSS', () => {
  it('fecha a vigência anterior ao criar nova tabela', async () => {
    txMock.tabelaINSS.findFirst.mockResolvedValue({
      id: 'inss-old',
      vigenciaInicio: new Date('2018-01-01'),
      vigenciaFim: null,
    });
    txMock.tabelaINSS.update.mockResolvedValue({});
    txMock.tabelaINSS.create.mockResolvedValue({ id: 'inss-new' });

    const r = await PayrollService.criarTabelaINSS(
      { vigenciaInicio: new Date('2026-01-01'), taxaTrabalhador: 0.03, taxaEntidade: 0.04 },
      ctx,
    );
    expect(r.id).toBe('inss-new');
    expect(txMock.tabelaINSS.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inss-old' } }),
    );
  });

  it('rejeita vigência que não seja posterior à actual', async () => {
    txMock.tabelaINSS.findFirst.mockResolvedValue({
      id: 'inss-old',
      vigenciaInicio: new Date('2026-01-01'),
      vigenciaFim: null,
    });
    await expect(
      PayrollService.criarTabelaINSS(
        { vigenciaInicio: new Date('2025-01-01'), taxaTrabalhador: 0.03, taxaEntidade: 0.04 },
        ctx,
      ),
    ).rejects.toMatchObject({ code: 'VIGENCIA_INVALIDA' });
  });
});
