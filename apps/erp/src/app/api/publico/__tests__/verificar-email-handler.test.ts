/**
 * Testes do Route Handler `GET /api/publico/verificar-email` (ADR-0031 §5).
 *
 * O que se prova aqui é o contrato observável: 303 sempre, destino conforme a
 * sessão, idempotência da segunda visita e a recusa por prazo a encaminhar
 * para o reenvio em vez de um beco sem saída.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  consumir: vi.fn(),
  marcarEmailVerificado: vi.fn(),
}));

// `withApi` importa `@/lib/auth`; o handler também o usa para escolher o
// destino. Um só duplo serve os dois.
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/security/rate-limiter', () => ({
  verificacaoEmailLimiter: { consume: mocks.consumir },
}));
vi.mock('@/server/auth/keycloak', () => ({
  marcarEmailVerificado: mocks.marcarEmailVerificado,
}));

import { NextRequest } from 'next/server';
import { GET } from '../verificar-email/route';
import { assinarTokenVerificacao } from '@/server/auth/ligacao-verificacao';

const SUB = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'ana@padaria.mz';

function pedido(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/publico/verificar-email${query}`);
}

function agora(): number {
  return Math.floor(Date.now() / 1000);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMAIL_VERIFY_SECRET = 'segredo-de-teste-distinto-do-auth';
  mocks.auth.mockResolvedValue(null);
  mocks.consumir.mockResolvedValue({ limited: false, remaining: 19, retryAfterSec: 0 });
  mocks.marcarEmailVerificado.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.EMAIL_VERIFY_SECRET;
});

describe('sucesso', () => {
  it('303 para /auth/login?verificacao=ok e marca no Keycloak', async () => {
    const t = assinarTokenVerificacao(SUB, EMAIL);
    const res = await GET(pedido(`?t=${encodeURIComponent(t)}`));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/auth/login?verificacao=ok');
    expect(mocks.marcarEmailVerificado).toHaveBeenCalledWith(SUB);
  });

  it('com sessão vai para /dashboard — não se pede outra vez o que já está feito', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'u1', tenantId: 't1', permissions: [] } });
    const t = assinarTokenVerificacao(SUB, EMAIL);
    const res = await GET(pedido(`?t=${encodeURIComponent(t)}`));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard?verificacao=ok');
  });

  it('a segunda visita responde igual à primeira (idempotente, sem consumo)', async () => {
    const t = assinarTokenVerificacao(SUB, EMAIL);
    const primeira = await GET(pedido(`?t=${encodeURIComponent(t)}`));
    const segunda = await GET(pedido(`?t=${encodeURIComponent(t)}`));

    expect(segunda.status).toBe(primeira.status);
    expect(segunda.headers.get('location')).toBe(primeira.headers.get('location'));
    expect(mocks.marcarEmailVerificado).toHaveBeenCalledTimes(2);
  });
});

describe('recusas — nunca um beco sem saída', () => {
  it('prazo expirado encaminha para o reenvio e não toca no Keycloak', async () => {
    const t = assinarTokenVerificacao(SUB, EMAIL, agora() - 25 * 60 * 60);
    const res = await GET(pedido(`?t=${encodeURIComponent(t)}`));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('verificacao=expirada');
    expect(mocks.marcarEmailVerificado).not.toHaveBeenCalled();
  });

  it('sem token: 303 com verificacao=invalida', async () => {
    const res = await GET(pedido(''));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('verificacao=invalida');
    expect(mocks.marcarEmailVerificado).not.toHaveBeenCalled();
  });

  it('assinatura adulterada não distingue de inválida e não escreve nada', async () => {
    const t = assinarTokenVerificacao(SUB, EMAIL);
    const res = await GET(pedido(`?t=${encodeURIComponent(t)}x`));
    expect(res.headers.get('location')).toContain('verificacao=invalida');
    expect(mocks.marcarEmailVerificado).not.toHaveBeenCalled();
  });

  it('limite por IP responde 303 sem sequer ler o token', async () => {
    mocks.consumir.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 120 });
    const t = assinarTokenVerificacao(SUB, EMAIL);
    const res = await GET(pedido(`?t=${encodeURIComponent(t)}`));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('verificacao=limitada');
    expect(mocks.marcarEmailVerificado).not.toHaveBeenCalled();
  });

  it('falha do Keycloak devolve 303 com verificacao=erro, nunca 500 ao browser', async () => {
    mocks.marcarEmailVerificado.mockRejectedValue(new Error('HTTP 503'));
    const t = assinarTokenVerificacao(SUB, EMAIL);
    const res = await GET(pedido(`?t=${encodeURIComponent(t)}`));

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('verificacao=erro');
  });
});
