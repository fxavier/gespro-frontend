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
    });
    expect(await reservarChave('k1', ENDPOINT, fp)).toEqual({ tipo: 'EM_CURSO' });
  });

  it('tentativa anterior falhada é retomável (a transacção atómica não deixou resíduo)', async () => {
    const fp = fingerprintDe(CORPO);
    mocks.create.mockRejectedValue(p2002());
    mocks.findUnique.mockResolvedValue({
      endpoint: ENDPOINT,
      fingerprint: fp,
      estado: 'FALHADA',
      respostaJson: null,
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
