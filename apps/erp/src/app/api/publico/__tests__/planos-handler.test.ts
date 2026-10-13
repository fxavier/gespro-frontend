/**
 * Route Handler `GET /api/publico/planos` — a **fonte única de preços** que o
 * site (spec 18) renderiza; contrato em `docs/handoff/site-provisionamento.md`.
 * (O `verificar-email` foi removido pelo ADR-0013: a verificação de e-mail é
 * do Keycloak.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

/**
 * Desde a issue #524 (ADR-0049) o catálogo vem da tabela `Plano` pelo serviço
 * `plano.service.listarPlanosPublicos()` — aqui dobrado, para o teste não depender da base local.
 * A leitura real (só não arquivados, por `ordem`, valores de origem) está provada em
 * `test/integration/catalogo-bd-planos-524.test.ts` (C4/C5).
 */
const CATALOGO = vi.hoisted(() => [
  {
    id: 'BASICO',
    nome: 'Básico',
    descricao: 'Para empresas em arranque.',
    limites: { utilizadores: 3, armazens: 1, suporte: 'Email (48h)' },
    precoMensal: { valor: 29, moeda: 'USD' },
    precoAnual: { valor: 290, moeda: 'USD' },
    destaque: false,
    funcionalidades: ['Facturação'],
  },
  {
    id: 'PROFISSIONAL',
    nome: 'Profissional',
    descricao: 'Contabilidade completa.',
    limites: { utilizadores: 15, armazens: 5, suporte: 'Email + telefone (24h)' },
    precoMensal: { valor: 79, moeda: 'USD' },
    precoAnual: { valor: 790, moeda: 'USD' },
    destaque: true,
    funcionalidades: ['Contabilidade PGC-NIRF', 'Recursos humanos'],
  },
  {
    id: 'PLANO_SO_NA_BASE',
    nome: 'Só na base',
    descricao: 'Criado pelo administrador de plataforma, sem deploy.',
    limites: { utilizadores: -1, armazens: -1, suporte: 'Dedicado' },
    precoMensal: { valor: 12.5, moeda: 'USD' },
    precoAnual: { valor: 125, moeda: 'USD' },
    destaque: false,
    funcionalidades: [],
  },
]);

vi.mock('@/server/services/plataforma/plano.service', () => {
  const listarPlanosPublicos = vi.fn(async () => CATALOGO);
  const obterPlano = vi.fn(async () => null);
  return { listarPlanosPublicos, obterPlano, planoService: { listarPlanosPublicos, obterPlano } };
});

import { NextRequest } from 'next/server';
import { GET as GET_PLANOS, OPTIONS } from '../planos/route';

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
    // O que o serviço devolve, pela ordem do serviço — incluindo um plano que não é de origem.
    expect(data.planos.map((p: { id: string }) => p.id)).toEqual(CATALOGO.map((p) => p.id));
    expect(data.planos).toEqual(CATALOGO);

    for (const plano of data.planos) {
      expect(plano).toMatchObject({
        id: expect.any(String),
        nome: expect.any(String),
        descricao: expect.any(String),
        precoMensal: { valor: expect.any(Number), moeda: 'USD' },
        precoAnual: { valor: expect.any(Number), moeda: 'USD' },
        destaque: expect.any(Boolean),
        funcionalidades: expect.any(Array),
      });
      expect(plano.limites.utilizadores).toBeDefined();
      expect(plano.limites.armazens).toBeDefined();

      // Só é Limite do plano o que o produto verifica (ADR-0027 §2, issue #32).
      // Publicar um número que ninguém aplica não é um limite, é uma promessa.
      expect(plano.limites).not.toHaveProperty('documentosMes');
      expect(plano.limites).not.toHaveProperty('produtos');
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

/**
 * Issue #197 — o preflight tem de anunciar exactamente o que o GET aplica.
 * O GET é público e sem credenciais (`GET, OPTIONS`, sem Allow-Credentials);
 * um OPTIONS que anuncie `POST` e `Allow-Credentials: true` promete ao browser
 * um contrato que o endpoint não cumpre.
 */
describe('OPTIONS /api/publico/planos — preflight coerente com o GET (#197)', () => {
  const CORS = [
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'access-control-max-age',
    'vary',
  ] as const;

  function cabecalhosCors(res: Response) {
    return Object.fromEntries(CORS.map((h) => [h, res.headers.get(h)]));
  }

  function metodos(res: Response) {
    return (res.headers.get('access-control-allow-methods') ?? '')
      .split(',')
      .map((m) => m.trim().toUpperCase())
      .filter(Boolean)
      .sort();
  }

  function pedidos(origem: string) {
    const url = 'http://localhost:3000/api/publico/planos';
    return {
      get: new NextRequest(url, { headers: { origin: origem } }),
      options: new NextRequest(url, {
        method: 'OPTIONS',
        headers: {
          origin: origem,
          'access-control-request-method': 'GET',
        },
      }),
    };
  }

  it('origem permitida: anuncia só GET e OPTIONS (nunca POST)', async () => {
    const { options } = pedidos('https://www.gespro.mz');
    const res = await (OPTIONS as (r: NextRequest) => Response | Promise<Response>)(options);
    expect(res.status).toBe(204);
    expect(metodos(res)).toEqual(['GET', 'OPTIONS']);
    expect(metodos(res)).not.toContain('POST');
  });

  it('origem permitida: não anuncia credenciais (o GET é sem credenciais)', async () => {
    const { get, options } = pedidos('https://www.gespro.mz');
    const resGet = await GET_PLANOS(get);
    const res = await (OPTIONS as (r: NextRequest) => Response | Promise<Response>)(options);
    expect(resGet.headers.get('access-control-allow-credentials')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.gespro.mz');
  });

  it.each(['https://www.gespro.mz', 'https://atacante.example', ''])(
    'cabeçalhos CORS do OPTIONS iguais aos do GET (origem %j)',
    async (origem) => {
      const { get, options } = pedidos(origem);
      const resGet = await GET_PLANOS(get);
      const res = await (OPTIONS as (r: NextRequest) => Response | Promise<Response>)(options);
      expect(cabecalhosCors(res)).toEqual(cabecalhosCors(resGet));
    },
  );

  it('origem fora da allowlist: preflight sem Allow-Origin e nunca wildcard', async () => {
    const { options } = pedidos('https://atacante.example');
    const res = await (OPTIONS as (r: NextRequest) => Response | Promise<Response>)(options);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('nunca emite Access-Control-Allow-Origin: * no preflight', async () => {
    for (const origem of ['https://www.gespro.mz', 'https://atacante.example', '']) {
      const { options } = pedidos(origem);
      const res = await (OPTIONS as (r: NextRequest) => Response | Promise<Response>)(options);
      expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
    }
  });
});
