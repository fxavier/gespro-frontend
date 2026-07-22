/**
 * Route Handlers `GET /api/publico/planos` e `GET /api/publico/verificar-email`.
 *
 * O primeiro é a **fonte única de preços** que o site (spec 18) renderiza; o
 * segundo é o que desbloqueia o login. Ambos fazem parte do contrato em
 * `docs/handoff/site-provisionamento.md`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  verificarEmail: vi.fn(),
  consumir: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('@/server/services/plataforma/tenant-provisioning.service', () => ({
  verificarEmail: mocks.verificarEmail,
}));
vi.mock('@/server/security/rate-limiter', () => ({
  verificacaoEmailLimiter: { consume: mocks.consumir },
}));

import { NextRequest } from 'next/server';
import { GET as GET_PLANOS, OPTIONS } from '../planos/route';
import { GET as GET_VERIFICAR } from '../verificar-email/route';
import { PLANO_IDS } from '@/lib/planos';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ALLOWED_ORIGINS = 'https://www.gespro.mz';
  process.env.APP_URL = 'https://app.gespro.mz';
  mocks.consumir.mockResolvedValue({ limited: false, remaining: 19, retryAfterSec: 0 });
});

describe('GET /api/publico/planos', () => {
  function pedido(origem = 'https://www.gespro.mz') {
    return new NextRequest('http://localhost:3000/api/publico/planos', {
      headers: { origin: origem },
    });
  }

  it('serve o catálogo no envelope { data } com os campos do contrato', async () => {
    const res = await GET_PLANOS(pedido());
    expect(res.status).toBe(200);

    const { data } = await res.json();
    expect(data.trialDias).toBe(14);
    expect(data.planos.map((p: { id: string }) => p.id)).toEqual([...PLANO_IDS]);

    for (const plano of data.planos) {
      expect(plano).toMatchObject({
        id: expect.any(String),
        nome: expect.any(String),
        descricao: expect.any(String),
        precoMensal: { valor: expect.any(Number), moeda: 'USD' },
        precoAnual: { valor: expect.any(Number), moeda: 'USD' },
        destaque: expect.any(Boolean),
      });
      expect(plano.limites.utilizadores).toBeDefined();
    }
  });

  it('nunca expõe nomes de env vars nem segredos', async () => {
    const res = await GET_PLANOS(pedido());
    const corpo = JSON.stringify(await res.json());
    expect(corpo).not.toContain('STRIPE_');
    expect(corpo).not.toContain('stripePriceId');
  });

  it('é cacheável (o site consome-o em ISR)', async () => {
    const res = await GET_PLANOS(pedido());
    expect(res.headers.get('cache-control')).toContain('public');
    expect(res.headers.get('cache-control')).toContain('s-maxage=300');
  });

  it('só devolve Allow-Origin para origens na allowlist', async () => {
    const permitida = await GET_PLANOS(pedido());
    expect(permitida.headers.get('access-control-allow-origin')).toBe('https://www.gespro.mz');

    const recusada = await GET_PLANOS(pedido('https://atacante.example'));
    expect(recusada.headers.get('access-control-allow-origin')).toBeNull();
    // Continua a servir o catálogo — é público; só o browser é que bloqueia.
    expect(recusada.status).toBe(200);
  });

  it('responde ao preflight', () => {
    const res = OPTIONS(
      new NextRequest('http://localhost:3000/api/publico/planos', {
        method: 'OPTIONS',
        headers: { origin: 'https://www.gespro.mz' },
      }),
    );
    expect(res.status).toBe(204);
  });
});

describe('GET /api/publico/verificar-email', () => {
  function pedido(token?: string) {
    const url = new URL('http://localhost:3000/api/publico/verificar-email');
    if (token !== undefined) url.searchParams.set('token', token);
    return new NextRequest(url);
  }

  it('redirecciona para o login com verificacao=ok e o tenant', async () => {
    mocks.verificarEmail.mockResolvedValue({
      tenantId: 't1',
      userId: 'u1',
      tenantSlug: 'padaria',
    });
    const res = await GET_VERIFICAR(pedido('a'.repeat(32)));
    expect(res.status).toBe(303);
    const destino = new URL(res.headers.get('location')!);
    expect(destino.pathname).toBe('/auth/login');
    expect(destino.searchParams.get('verificacao')).toBe('ok');
    expect(destino.searchParams.get('tenant')).toBe('padaria');
  });

  it('não distingue token inexistente de já usado — sempre verificacao=invalida', async () => {
    mocks.verificarEmail.mockResolvedValue(null);
    const res = await GET_VERIFICAR(pedido('a'.repeat(32)));
    expect(res.headers.get('location')).toContain('verificacao=invalida');
  });

  it('rejeita token ausente ou curto sem tocar no serviço', async () => {
    expect((await GET_VERIFICAR(pedido())).headers.get('location')).toContain(
      'verificacao=invalida',
    );
    expect((await GET_VERIFICAR(pedido('curto'))).headers.get('location')).toContain(
      'verificacao=invalida',
    );
    expect(mocks.verificarEmail).not.toHaveBeenCalled();
  });

  it('rate-limit devolve verificacao=limite', async () => {
    mocks.consumir.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 60 });
    const res = await GET_VERIFICAR(pedido('a'.repeat(32)));
    expect(res.headers.get('location')).toContain('verificacao=limite');
    expect(mocks.verificarEmail).not.toHaveBeenCalled();
  });

  it('redirecciona para APP_URL, não para o host do pedido', async () => {
    mocks.verificarEmail.mockResolvedValue({ tenantId: 't', userId: 'u', tenantSlug: 's' });
    const res = await GET_VERIFICAR(pedido('a'.repeat(32)));
    expect(res.headers.get('location')).toContain('https://app.gespro.mz');
  });
});
