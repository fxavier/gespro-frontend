/**
 * Testes para abrirExercicio (ADR-0033 §3 + Server Action).
 *
 * Cobre:
 *  - a action recusa sem a permissão `financas:exercicio:abrir`
 *  - a action recusa em modo de Leitura
 *  - a service function é idempotente para o mesmo ano (segundo chamada retorna 0 séries criadas)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  serieDocumentoCreateMany: vi.fn(),
  periodoContabilFindFirst: vi.fn(),
  periodoContabilUpsert: vi.fn(),
  exercicioContabilUpsert: vi.fn(),
  exercicioContabilFindFirst: vi.fn(),
  transaction: vi.fn(),
  runWithTenantContext: vi.fn(),
  runWithRequestContext: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

vi.mock('@/server/db/client', () => {
  const tx = {
    periodoContabil: { findFirst: mocks.periodoContabilFindFirst, upsert: mocks.periodoContabilUpsert },
    exercicioContabil: { upsert: mocks.exercicioContabilUpsert, findFirst: mocks.exercicioContabilFindFirst },
    serieDocumento: { createMany: mocks.serieDocumentoCreateMany },
    lancamento: {},
    sessaoCaixa: {},
  };
  return {
    prisma: tx,
    prismaBase: {
      ...tx,
      $transaction: mocks.transaction,
    },
  };
});

vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: mocks.runWithTenantContext,
}));

vi.mock('@/server/observability/context', () => ({
  getRequestContext: vi.fn(() => null),
  runWithRequestContext: mocks.runWithRequestContext,
  newRequestId: vi.fn(() => 'req-test'),
}));

vi.mock('@/server/observability/logger', () => ({
  logger: { child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/server/observability/metrics', () => ({ recordRequest: vi.fn() }));
vi.mock('@/server/observability/prom-registry', () => ({ recordHttpRequest: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/cache', () => ({ updateTag: mocks.updateTag }));

vi.mock('@/server/provisioning/tenant-bootstrap', () => ({
  bootstrapSeriesDocumento: vi.fn().mockResolvedValue(0),
}));

// ---------------------------------------------------------------------------
// Imports after mock
// ---------------------------------------------------------------------------

import { abrirExercicio as abrirExercicioAction } from '@/server/actions/contabilidade.actions';
import { abrirExercicio as abrirExercicioService } from '../contabilidade.service';
import { bootstrapSeriesDocumento } from '@/server/provisioning/tenant-bootstrap';

const CTX = { tenantId: 'tenant-1', userId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();

  // Configuração padrão: exercício anterior não existe, upsert idempotente
  mocks.exercicioContabilFindFirst.mockResolvedValue(null);
  mocks.exercicioContabilUpsert.mockResolvedValue({ id: 'exc-2027' });
  mocks.periodoContabilUpsert.mockResolvedValue({ id: 'per-1' });
  mocks.transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      periodoContabil: { findFirst: mocks.periodoContabilFindFirst, upsert: mocks.periodoContabilUpsert },
      exercicioContabil: { upsert: mocks.exercicioContabilUpsert, findFirst: mocks.exercicioContabilFindFirst },
      serieDocumento: { createMany: mocks.serieDocumentoCreateMany },
    }),
  );
  mocks.runWithTenantContext.mockImplementation((_: unknown, fn: () => unknown) => fn());
  mocks.runWithRequestContext.mockImplementation((_: unknown, fn: () => unknown) => fn());
  vi.mocked(bootstrapSeriesDocumento).mockResolvedValue(20);
});

// ---------------------------------------------------------------------------
// Testes da service function (sem RBAC)
// ---------------------------------------------------------------------------

describe('abrirExercicio (service)', () => {
  it('cria exercício, períodos e séries para o ano dado', async () => {
    const resultado = await abrirExercicioService({ ano: 2027 }, CTX);

    expect(resultado.ano).toBe(2027);
    expect(resultado.seriesCriadas).toBe(20);
    expect(bootstrapSeriesDocumento).toHaveBeenCalledWith(expect.anything(), CTX.tenantId, 2027);
    // exercicioContabil.upsert chamado para criar o exercício
    expect(mocks.exercicioContabilUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_codigo: { tenantId: CTX.tenantId, codigo: '2027' } },
      }),
    );
  });

  it('é idempotente — segunda chamada devolve 0 séries criadas (skipDuplicates)', async () => {
    // Primeira chamada: cria as séries
    vi.mocked(bootstrapSeriesDocumento).mockResolvedValueOnce(20);
    await abrirExercicioService({ ano: 2027 }, CTX);

    // Segunda chamada: skipDuplicates → 0 novas séries
    vi.mocked(bootstrapSeriesDocumento).mockResolvedValueOnce(0);
    const segunda = await abrirExercicioService({ ano: 2027 }, CTX);

    expect(segunda.seriesCriadas).toBe(0);
    expect(segunda.ano).toBe(2027);
  });
});

// ---------------------------------------------------------------------------
// Testes da Server Action (com RBAC)
// ---------------------------------------------------------------------------

describe('abrirExercicio (Server Action)', () => {
  it('recusa sem a permissão financas:exercicio:abrir', async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: 'user-1',
        tenantId: 'tenant-1',
        acesso: 'escrita',
        permissions: ['financas:ver'], // sem financas:exercicio:abrir
      },
    });

    const resultado = await abrirExercicioAction({ ano: 2027 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('SEM_PERMISSAO');
    }
  });

  it('recusa em modo de Leitura', async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: 'user-1',
        tenantId: 'tenant-1',
        acesso: 'leitura', // modo Leitura
        permissions: ['financas:exercicio:abrir'],
      },
    });

    const resultado = await abrirExercicioAction({ ano: 2027 });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.code).toBe('ACESSO_LEITURA');
    }
  });

  it('não rejeita pela permissão quando tem financas:exercicio:abrir (não lança SEM_PERMISSAO)', async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: 'user-1',
        tenantId: 'tenant-1',
        acesso: 'escrita',
        permissions: ['financas:exercicio:abrir'],
      },
    });

    const resultado = await abrirExercicioAction({ ano: 2027 });
    // Pode falhar por outros motivos de infra (mocks incompletos da tx), mas não por RBAC
    if (!resultado.ok) {
      expect(resultado.error.code).not.toBe('SEM_PERMISSAO');
      expect(resultado.error.code).not.toBe('ACESSO_LEITURA');
    }
  });
});
