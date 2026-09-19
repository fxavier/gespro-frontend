/**
 * Testes unitários para o ciclo de períodos (ADR-0033 §5, §6, §7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mocks hoisted (vi.hoisted é seguro em vi.mock factories)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  periodoFindFirst: vi.fn(),
  periodoUpsert:    vi.fn(),
  periodoUpdate:    vi.fn(),
  exercicioUpsert:  vi.fn(),
  lancamentoCount:  vi.fn(),
  sessaoCaixaCount: vi.fn(),
  reconciliacaoCount: vi.fn(),
  faturaCount:      vi.fn(),
  partidaGroupBy:   vi.fn(),
  userFindFirst:    vi.fn(),
  reaberturaPeriodoCreate: vi.fn(),
  transaction:      vi.fn(),
  queryRaw:         vi.fn(),
}));

vi.mock('@/server/db/client', () => {
  // Construído inline — só referencia `mocks` (hoisted, seguro aqui)
  const tx = {
    periodoContabil:    { findFirst: mocks.periodoFindFirst, upsert: mocks.periodoUpsert, update: mocks.periodoUpdate },
    exercicioContabil:  { upsert: mocks.exercicioUpsert },
    lancamento:         { count: mocks.lancamentoCount },
    sessaoCaixa:        { count: mocks.sessaoCaixaCount },
    reconciliacaoBancaria: { count: mocks.reconciliacaoCount },
    fatura:             { count: mocks.faturaCount },
    partidaLancamento:  { groupBy: mocks.partidaGroupBy },
    user:               { findFirst: mocks.userFindFirst },
    reaberturaPeriodo:  { create: mocks.reaberturaPeriodoCreate },
    $queryRaw:          mocks.queryRaw,
  };
  return {
    prisma: tx,
    prismaBase: { ...tx, $transaction: mocks.transaction },
  };
});

vi.mock('@/server/observability/context', () => ({
  getRequestContext: vi.fn(() => ({ requestId: 'req-test-123' })),
}));

import {
  resolverPeriodo,
  fecharPeriodo,
  reabrirPeriodo,
  periodoFiscalDe,
} from '../contabilidade.service';

const CTX = { tenantId: 'tenant-test', userId: 'user-test' };

// TX para uso nos corpos dos testes (passado como argumento a resolverPeriodo)
// Mesmo conjunto de mocks — qualquer chamada vai para os vi.fn() acima
const TX_PARA_TESTES = {
  periodoContabil:   { findFirst: mocks.periodoFindFirst, upsert: mocks.periodoUpsert, update: mocks.periodoUpdate },
  exercicioContabil: { upsert: mocks.exercicioUpsert },
  $queryRaw:         mocks.queryRaw,
} as unknown as import('@prisma/client').Prisma.TransactionClient;

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction chama o callback com o tx completo (o mesmo que está no mock)
  mocks.transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      periodoContabil:    { findFirst: mocks.periodoFindFirst, upsert: mocks.periodoUpsert, update: mocks.periodoUpdate },
      exercicioContabil:  { upsert: mocks.exercicioUpsert },
      lancamento:         { count: mocks.lancamentoCount },
      sessaoCaixa:        { count: mocks.sessaoCaixaCount },
      reconciliacaoBancaria: { count: mocks.reconciliacaoCount },
      fatura:             { count: mocks.faturaCount },
      partidaLancamento:  { groupBy: mocks.partidaGroupBy },
      user:               { findFirst: mocks.userFindFirst },
      reaberturaPeriodo:  { create: mocks.reaberturaPeriodoCreate },
      $queryRaw:          mocks.queryRaw,
    }),
  );
});

// ---------------------------------------------------------------------------
// Invariante periodoFiscal === periodo.codigo (ADR-0033 §1)
// ---------------------------------------------------------------------------

describe('Invariante periodoFiscal === periodo.codigo (ADR-0033 §1)', () => {
  it('periodoFiscalDe devolve o mesmo código que o campo codigo do período', () => {
    // 15 de Junho às 10h UTC = 15 de Junho às 12h Maputo → "2026-06"
    expect(periodoFiscalDe(new Date('2026-06-15T10:00:00Z'))).toBe('2026-06');
    // A escrita faz periodoFiscal = periodoLocked.codigo, e o periodo foi
    // encontrado com codigo === periodoFiscalDe(data), logo são iguais.
  });

  it('fronteira de mês: 1 de Março às 00:30 Maputo (28/Fev 22:30 UTC) → "2026-03"', () => {
    expect(periodoFiscalDe(new Date('2026-02-28T22:30:00Z'))).toBe('2026-03');
  });
});

// ---------------------------------------------------------------------------
// resolverPeriodo
// ---------------------------------------------------------------------------

describe('resolverPeriodo — caminho normal (período existe)', () => {
  it('devolve o período existente sem criar exercício', async () => {
    const per = { id: 'per-1', codigo: '2026-06', estado: 'ABERTO' };
    mocks.periodoFindFirst.mockResolvedValue(per);

    const result = await resolverPeriodo(TX_PARA_TESTES, new Date('2026-06-15T10:00:00Z'), CTX.tenantId);

    expect(result).toEqual(per);
    expect(mocks.exercicioUpsert).not.toHaveBeenCalled();
  });
});

describe('resolverPeriodo — rede de segurança (exercício não existe)', () => {
  it('cria exercício e 13 períodos quando o período não existe', async () => {
    const perNovo = { id: 'per-novo', codigo: '2026-06', estado: 'ABERTO' };
    mocks.periodoFindFirst
      .mockResolvedValueOnce(null)      // antes da criação: não existe
      .mockResolvedValueOnce(perNovo);  // após criação: existe
    mocks.exercicioUpsert.mockResolvedValue({ id: 'exc-2026' });
    mocks.periodoUpsert.mockResolvedValue({ id: 'per-novo' });

    const result = await resolverPeriodo(TX_PARA_TESTES, new Date('2026-06-15T10:00:00Z'), CTX.tenantId);

    expect(result).toEqual(perNovo);
    expect(mocks.exercicioUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_codigo: { tenantId: CTX.tenantId, codigo: '2026' } },
      }),
    );
    expect(mocks.periodoUpsert).toHaveBeenCalledTimes(13); // 12 meses + período 13
  });

  it('idempotente: segundo resolverPeriodo não cria de novo', async () => {
    const per = { id: 'per-1', codigo: '2026-06', estado: 'ABERTO' };
    mocks.periodoFindFirst.mockResolvedValue(per);

    await resolverPeriodo(TX_PARA_TESTES, new Date('2026-06-15T10:00:00Z'), CTX.tenantId);
    await resolverPeriodo(TX_PARA_TESTES, new Date('2026-06-15T10:00:00Z'), CTX.tenantId);

    expect(mocks.exercicioUpsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fecharPeriodo — helper de setup
// ---------------------------------------------------------------------------

function setupFechoOk(overrides: Partial<{
  rascunhos: number; sessoesCaixa: number; reconciliacoes: number;
  faturasSem: number; debitos: string; creditos: string; estadoAnterior: string;
}> = {}) {
  const {
    rascunhos = 0, sessoesCaixa = 0, reconciliacoes = 0,
    faturasSem = 0, debitos = '1000', creditos = '1000', estadoAnterior = 'FECHADO',
  } = overrides;

  // $queryRaw é chamado 4 vezes:
  // 1. FOR UPDATE do período
  // 2. estado do exercício
  // 3. datas do período (para verificações de sessão/reconciliação)
  // 4. estado do período anterior (ordem - 1)
  mocks.queryRaw
    .mockResolvedValueOnce([{
      id: 'per-1', codigo: '2026-06', estado: 'ABERTO',
      exercicioId: 'exc-1', ordem: 2, tenantId: CTX.tenantId,
    }])
    .mockResolvedValueOnce([{ estado: 'ABERTO' }])
    .mockResolvedValueOnce([{
      data_inicio: new Date('2026-05-31T22:00:00Z'),
      data_fim:    new Date('2026-06-30T21:59:59.999Z'),
    }])
    .mockResolvedValueOnce([{ estado: estadoAnterior }]);

  mocks.lancamentoCount.mockResolvedValue(rascunhos);
  mocks.sessaoCaixaCount.mockResolvedValue(sessoesCaixa);
  mocks.reconciliacaoCount.mockResolvedValue(reconciliacoes);
  mocks.faturaCount.mockResolvedValue(faturasSem);
  mocks.partidaGroupBy.mockResolvedValue([
    { tipo: 'DEBITO',  _sum: { valor: new Prisma.Decimal(debitos)  } },
    { tipo: 'CREDITO', _sum: { valor: new Prisma.Decimal(creditos) } },
  ]);
  mocks.periodoUpdate.mockResolvedValue({
    id: 'per-1', codigo: '2026-06', estado: 'FECHADO',
  });
}

// ---------------------------------------------------------------------------
// fecharPeriodo — pré-condições
// ---------------------------------------------------------------------------

describe('fecharPeriodo — pré-condição 1: RASCUNHOS_NO_PERIODO', () => {
  it('impedimento quando há lançamentos em RASCUNHO', async () => {
    setupFechoOk({ rascunhos: 3 });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.impedimentos).toContain('RASCUNHOS_NO_PERIODO');
  });
});

describe('fecharPeriodo — pré-condição 2: SESSAO_CAIXA_ABERTA', () => {
  it('impedimento quando há sessão de caixa aberta', async () => {
    setupFechoOk({ sessoesCaixa: 1 });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.impedimentos).toContain('SESSAO_CAIXA_ABERTA');
  });
});

describe('fecharPeriodo — pré-condição 3: RECONCILIACAO_EM_ANDAMENTO', () => {
  it('impedimento quando há reconciliação em andamento', async () => {
    setupFechoOk({ reconciliacoes: 2 });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.impedimentos).toContain('RECONCILIACAO_EM_ANDAMENTO');
  });
});

describe('fecharPeriodo — pré-condição 4: DOCUMENTO_SEM_LANCAMENTO', () => {
  it('impedimento quando há factura emitida sem lancamentoId', async () => {
    setupFechoOk({ faturasSem: 1 });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.impedimentos).toContain('DOCUMENTO_SEM_LANCAMENTO');
  });
});

describe('fecharPeriodo — pré-condição 5: BALANCETE_DESEQUILIBRADO', () => {
  it('impedimento quando débitos ≠ créditos', async () => {
    setupFechoOk({ debitos: '1000', creditos: '999.50' });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.impedimentos).toContain('BALANCETE_DESEQUILIBRADO');
  });
});

describe('fecharPeriodo — pré-condição 6: PERIODO_ANTERIOR_ABERTO', () => {
  it('impedimento quando período anterior não está fechado', async () => {
    setupFechoOk({ estadoAnterior: 'ABERTO' });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.impedimentos).toContain('PERIODO_ANTERIOR_ABERTO');
  });
});

describe('fecharPeriodo — todos os impedimentos de uma vez', () => {
  it('devolve o conjunto completo (não para à primeira falha)', async () => {
    setupFechoOk({ rascunhos: 1, faturasSem: 2, debitos: '1000', creditos: '500', estadoAnterior: 'ABERTO' });
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.impedimentos).toContain('RASCUNHOS_NO_PERIODO');
      expect(r.impedimentos).toContain('DOCUMENTO_SEM_LANCAMENTO');
      expect(r.impedimentos).toContain('BALANCETE_DESEQUILIBRADO');
      expect(r.impedimentos).toContain('PERIODO_ANTERIOR_ABERTO');
      expect(r.impedimentos.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('fecharPeriodo — sucesso', () => {
  it('fecha o período quando todas as pré-condições estão satisfeitas', async () => {
    setupFechoOk();
    const r = await fecharPeriodo({ id: 'per-1' }, CTX);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.periodo.estado).toBe('FECHADO');
    expect(mocks.periodoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'per-1' },
        data: expect.objectContaining({ estado: 'FECHADO' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// reabrirPeriodo
// ---------------------------------------------------------------------------

describe('reabrirPeriodo', () => {
  it('recusa se o período não estiver fechado', async () => {
    mocks.queryRaw.mockResolvedValueOnce([{
      id: 'per-1', codigo: '2026-06', estado: 'ABERTO',
      exercicioId: 'exc-1', tenantId: CTX.tenantId,
    }]);
    await expect(
      reabrirPeriodo({ id: 'per-1', motivo: 'Correcção necessária de erro' }, CTX),
    ).rejects.toMatchObject({ code: 'PERIODO_NAO_FECHADO' });
  });

  it('recusa se o exercício estiver ENCERRADO', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([{
        id: 'per-1', codigo: '2026-06', estado: 'FECHADO',
        exercicioId: 'exc-1', tenantId: CTX.tenantId,
      }])
      .mockResolvedValueOnce([{ estado: 'ENCERRADO' }]);
    await expect(
      reabrirPeriodo({ id: 'per-1', motivo: 'Correcção necessária de erro' }, CTX),
    ).rejects.toMatchObject({ code: 'EXERCICIO_ENCERRADO' });
  });

  it('grava ReaberturaPeriodo com requestId e keycloakSub', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([{
        id: 'per-1', codigo: '2026-06', estado: 'FECHADO',
        exercicioId: 'exc-1', tenantId: CTX.tenantId,
      }])
      .mockResolvedValueOnce([{ estado: 'ABERTO' }]);
    mocks.userFindFirst.mockResolvedValue({ keycloakSub: 'kc-sub-abc' });
    mocks.periodoUpdate.mockResolvedValue({ id: 'per-1', codigo: '2026-06', estado: 'ABERTO' });
    mocks.reaberturaPeriodoCreate.mockResolvedValue({});

    await reabrirPeriodo({ id: 'per-1', motivo: 'Correcção necessária de erro' }, CTX);

    expect(mocks.reaberturaPeriodoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: CTX.tenantId,
          periodoId: 'per-1',
          motivo: 'Correcção necessária de erro',
          reabertoPorId: CTX.userId,
          keycloakSub: 'kc-sub-abc',
          requestId: 'req-test-123',
        }),
      }),
    );
  });
});
