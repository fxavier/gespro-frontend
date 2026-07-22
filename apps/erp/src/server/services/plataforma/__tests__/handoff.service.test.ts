import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    tokenHandoff: {
      create: mocks.create,
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import { SignJWT } from 'jose';
import {
  consumirToken,
  emitirToken,
  purgarTokensExpirados,
} from '../handoff.service';
import { prismaBase } from '@/server/db/client';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-ok';
const TENANT = 'tenant-abc';
const USER = 'user-abc';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HANDOFF_SIGNING_SECRET = SEGREDO;
  mocks.create.mockResolvedValue({});
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.deleteMany.mockResolvedValue({ count: 0 });
});

async function assinar(claims: Record<string, unknown>, opts?: {
  segredo?: string;
  expSeg?: number;
  iss?: string;
  aud?: string;
}) {
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({ tenantId: claims.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(claims.sub))
    .setJti(String(claims.jti))
    .setIssuer(opts?.iss ?? 'gespro:registo')
    .setAudience(opts?.aud ?? 'gespro:app')
    .setIssuedAt(agora)
    .setExpirationTime(agora + (opts?.expSeg ?? 60))
    .sign(new TextEncoder().encode(opts?.segredo ?? SEGREDO));
}

describe('handoff — emissão', () => {
  it('regista o jti com tenantId explícito e devolve um JWT', async () => {
    const token = await emitirToken({ tenantId: TENANT, userId: USER });

    expect(token.split('.')).toHaveLength(3);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(TENANT);
    expect(data.userId).toBe(USER);
    expect(typeof data.jti).toBe('string');
    // TTL ~60s: a expiração fica no futuro próximo, nunca aberta.
    const delta = data.expiraEm.getTime() - Date.now();
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(61_000);
  });

  it('usa prismaBase (nunca o cliente tenant-scoped)', async () => {
    await emitirToken({ tenantId: TENANT, userId: USER });
    expect(prismaBase.tokenHandoff.create).toHaveBeenCalled();
  });

  it('recusa emitir sem segredo dedicado configurado', async () => {
    process.env.HANDOFF_SIGNING_SECRET = '';
    await expect(emitirToken({ tenantId: TENANT, userId: USER })).rejects.toMatchObject({
      code: 'HANDOFF_NAO_CONFIGURADO',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('recusa um segredo curto de mais para HS256', async () => {
    process.env.HANDOFF_SIGNING_SECRET = 'curto';
    await expect(emitirToken({ tenantId: TENANT, userId: USER })).rejects.toMatchObject({
      code: 'HANDOFF_NAO_CONFIGURADO',
    });
  });
});

describe('handoff — consumo', () => {
  it('aceita um token válido e consome o jti numa única operação condicional', async () => {
    const token = await assinar({ sub: USER, tenantId: TENANT, jti: 'jti-1' });
    const claims = await consumirToken(token);

    expect(claims).toEqual({ userId: USER, tenantId: TENANT, jti: 'jti-1' });
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    const where = mocks.updateMany.mock.calls[0][0].where;
    expect(where.jti).toBe('jti-1');
    expect(where.usedAt).toBeNull();
    expect(where.tenantId).toBe(TENANT);
    expect(where.userId).toBe(USER);
  });

  it('rejeita o token já usado (0 linhas afectadas na segunda tentativa)', async () => {
    const token = await assinar({ sub: USER, tenantId: TENANT, jti: 'jti-2' });

    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await consumirToken(token)).not.toBeNull();

    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await consumirToken(token)).toBeNull();
  });

  it('rejeita token expirado sem sequer tocar na base de dados', async () => {
    const token = await assinar({ sub: USER, tenantId: TENANT, jti: 'jti-3' }, { expSeg: -10 });
    expect(await consumirToken(token)).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('rejeita token assinado com outro segredo (ex.: AUTH_SECRET)', async () => {
    const token = await assinar(
      { sub: USER, tenantId: TENANT, jti: 'jti-4' },
      { segredo: 'outro-segredo-completamente-diferente-1234' },
    );
    expect(await consumirToken(token)).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('rejeita token de outro emissor/audiência', async () => {
    const outroIss = await assinar({ sub: USER, tenantId: TENANT, jti: 'j5' }, { iss: 'outro' });
    const outraAud = await assinar({ sub: USER, tenantId: TENANT, jti: 'j6' }, { aud: 'outro' });
    expect(await consumirToken(outroIss)).toBeNull();
    expect(await consumirToken(outraAud)).toBeNull();
  });

  it('rejeita lixo que não é sequer um JWT', async () => {
    expect(await consumirToken('nao-e-um-jwt')).toBeNull();
    expect(await consumirToken('')).toBeNull();
  });

  it('rejeita token sem tenantId nos claims', async () => {
    const agora = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER)
      .setJti('jti-7')
      .setIssuer('gespro:registo')
      .setAudience('gespro:app')
      .setIssuedAt(agora)
      .setExpirationTime(agora + 60)
      .sign(new TextEncoder().encode(SEGREDO));

    expect(await consumirToken(token)).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('corrida: só um dos consumos concorrentes ganha', async () => {
    const token = await assinar({ sub: USER, tenantId: TENANT, jti: 'jti-corrida' });
    // A base de dados serializa o UPDATE: um afecta 1 linha, o outro 0.
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const [a, b] = await Promise.all([consumirToken(token), consumirToken(token)]);
    const vencedores = [a, b].filter((r) => r !== null);
    expect(vencedores).toHaveLength(1);
  });
});

describe('handoff — purga', () => {
  it('apaga apenas tokens já expirados', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 3 });
    const limite = new Date('2026-01-01T00:00:00Z');
    expect(await purgarTokensExpirados(limite)).toBe(3);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { expiraEm: { lt: limite } } });
  });
});
