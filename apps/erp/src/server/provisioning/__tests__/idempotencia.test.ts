import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    chaveIdempotencia: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));

import {
  concluirChave,
  falharChave,
  fingerprintDe,
  reservarChave,
} from '../idempotencia';

const ENDPOINT = 'POST /api/publico/registo';
const CORPO = { empresa: { nome: 'Alfa' } };

function p2002() {
  return Object.assign(new Error('unique'), { code: 'P2002' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe('fingerprint', () => {
  it('é estável para o mesmo corpo e diferente para corpos diferentes', () => {
    expect(fingerprintDe(CORPO)).toBe(fingerprintDe({ empresa: { nome: 'Alfa' } }));
    expect(fingerprintDe(CORPO)).not.toBe(fingerprintDe({ empresa: { nome: 'Beta' } }));
  });
});

describe('reservarChave', () => {
  it('primeira utilização reserva a chave (NOVA)', async () => {
    mocks.create.mockResolvedValue({});
    const r = await reservarChave('k1', ENDPOINT, fingerprintDe(CORPO));
    expect(r).toEqual({ tipo: 'NOVA' });
    expect(mocks.create.mock.calls[0][0].data.estado).toBe('EM_CURSO');
  });

  it('repetição com o mesmo corpo devolve a MESMA resposta (não reprovisiona)', async () => {
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fp,
      estado: 'CONCLUIDA',
      respostaJson: { tenantSlug: 'alfa', handoffToken: 'tok' },
      updatedAt: new Date(),
    });

    const r = await reservarChave('k1', ENDPOINT, fp);
    expect(r).toEqual({
      tipo: 'REPETIDA',
      resposta: { tenantSlug: 'alfa', handoffToken: 'tok' },
    });
  });

  it('mesma chave com corpo diferente é CONFLITO', async () => {
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fingerprintDe(CORPO),
      estado: 'CONCLUIDA',
      respostaJson: {},
      updatedAt: new Date(),
    });

    const r = await reservarChave('k1', ENDPOINT, fingerprintDe({ empresa: { nome: 'Beta' } }));
    expect(r).toEqual({ tipo: 'CONFLITO' });
  });

  it('mesma chave noutro endpoint é CONFLITO', async () => {
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: 'POST /outro',
      fingerprint: fp,
      estado: 'CONCLUIDA',
      respostaJson: {},
      updatedAt: new Date(),
    });
    expect(await reservarChave('k1', ENDPOINT, fp)).toEqual({ tipo: 'CONFLITO' });
  });

  it('pedido ainda a decorrer devolve EM_CURSO (não duplica o provisionamento)', async () => {
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fp,
      estado: 'EM_CURSO',
      respostaJson: null,
      updatedAt: new Date(),
    });
    expect(await reservarChave('k1', ENDPOINT, fp)).toEqual({ tipo: 'EM_CURSO' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('MAJOR-4: EM_CURSO abandonado é retomável (não fica preso em 409)', async () => {
    // Se o processo morreu entre reservar e concluir, a chave ficava presa em
    // EM_CURSO para sempre e o cliente nunca mais conseguia registar-se com ela.
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fp,
      estado: 'EM_CURSO',
      respostaJson: null,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hora
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    expect(await reservarChave('k1', ENDPOINT, fp)).toEqual({ tipo: 'RETOMAVEL' });
    // Reabertura por UPDATE condicional, com a guarda de tempo no `where`.
    const where = mocks.updateMany.mock.calls[0][0].where;
    expect(where.estado).toBe('EM_CURSO');
    expect(where.updatedAt.lt).toBeInstanceOf(Date);
  });

  it('MAJOR-4: só um de dois pedidos concorrentes reabre a chave abandonada', async () => {
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fp,
      estado: 'EM_CURSO',
      respostaJson: null,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const [a, b] = await Promise.all([
      reservarChave('k1', ENDPOINT, fp),
      reservarChave('k1', ENDPOINT, fp),
    ]);
    expect([a, b].filter((r) => r.tipo === 'RETOMAVEL')).toHaveLength(1);
    expect([a, b].filter((r) => r.tipo === 'EM_CURSO')).toHaveLength(1);
  });

  it('tentativa anterior falhada é retomável (a transacção atómica não deixou resíduo)', async () => {
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fp,
      estado: 'FALHADA',
      respostaJson: null,
      updatedAt: new Date(),
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    expect(await reservarChave('k1', ENDPOINT, fp)).toEqual({ tipo: 'RETOMAVEL' });
  });

  it('propaga erros que não sejam colisão de unicidade', async () => {
    mocks.create.mockRejectedValue(new Error('ligação perdida'));
    await expect(reservarChave('k1', ENDPOINT, 'fp')).rejects.toThrow('ligação perdida');
  });
});

describe('conclusão e falha', () => {
  it('grava a resposta e o tenant no fecho', async () => {
    await concluirChave('k1', { tenantSlug: 'alfa' }, 'tenant-1');
    const args = mocks.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ chave: 'k1' });
    expect(args.data.estado).toBe('CONCLUIDA');
    expect(args.data.tenantId).toBe('tenant-1');
  });

  it('marca FALHADA para permitir nova tentativa', async () => {
    await falharChave('k1');
    expect(mocks.updateMany.mock.calls[0][0].data).toEqual({ estado: 'FALHADA' });
  });
});
