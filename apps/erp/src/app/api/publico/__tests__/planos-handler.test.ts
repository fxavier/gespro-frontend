/**
 * Route Handler `GET /api/publico/planos` — a **fonte única de preços** que o
 * site (spec 18) renderiza; contrato em `docs/handoff/site-provisionamento.md`.
 * (O `verificar-email` foi removido pelo ADR-0013: a verificação de e-mail é
 * do Keycloak.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

import { NextRequest } from 'next/server';
import { GET as GET_PLANOS, OPTIONS } from '../planos/route';
import { PLANO_IDS } from '@/lib/planos';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ALLOWED_ORIGINS = 'https://www.gespro.mz';
  process.env.APP_URL = 'https://app.gespro.mz';
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
