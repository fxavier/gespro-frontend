/**
 * ORÁCULO — issue #189 (nó A:withapi-traceid-zod-envelope-187-189).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador): as rotas fora do envelope alinham ao do
 * `withApi` — sucesso JSON em `{ data }`, erro em `{ error: { code, message } }` —
 * sem partir os clientes (os chamadores do front são actualizados).
 *
 *  - `POST /api/documentos/presign`: o sucesso passa a `{ data: { uploadUrl, key,
 *    requiredHeaders, urlRef } }`; o `upload-documento.tsx` lê de `data`.
 *  - `GET /api/metrics`: o 200 continua a ser texto Prometheus (o raspador não lê
 *    JSON — não se embrulha). As recusas 401 (bearer errado) e 503 (sem segredo)
 *    deixam de ser `{ error: 'texto' }` e passam a `{ error: { code, message } }`,
 *    mantendo o estado HTTP.
 *  - `POST /api/publico/registo`: coberto em `publico/__tests__/registo-handler.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

beforeEach(() => {
  vi.resetModules();
  mocks.auth.mockReset();
  process.env.STORAGE_DRIVER = 'local';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// presign
// ---------------------------------------------------------------------------

describe('#189 — presign responde no envelope { data }', () => {
  it('200 → { data: { uploadUrl, key, requiredHeaders, urlRef } }', async () => {
    mocks.auth.mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant-abc', permissions: ['fornecedores:editar'] },
    });
    const { POST } = await import('@/app/api/documentos/presign/route');
    const res = await POST(
      new NextRequest('http://localhost:3000/api/documentos/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recurso: 'fornecedor',
          recursoId: 'ckxyz0000000000000000000',
          nome: 'contrato.pdf',
          contentType: 'application/pdf',
          tamanho: 2048,
        }),
      }),
    );

    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.data, 'o presign não responde em { data }').toBeDefined();
    expect(corpo.data.uploadUrl).toBeTypeOf('string');
    expect(corpo.data.key.startsWith('tenant/tenant-abc/fornecedor/')).toBe(true);
    expect(corpo.data.requiredHeaders['Content-Type']).toBe('application/pdf');
    expect(corpo.data.urlRef).toBe(`gestpro-storage:${corpo.data.key}`);
  });

  it('o cliente (upload-documento.tsx) lê a resposta do presign a partir de `data`', () => {
    const fonte = readFileSync(
      resolve(__dirname, '../../../components/patterns/upload-documento.tsx'),
      'utf-8',
    );
    // Destruturar os campos directamente do `resp.json()` é ler o envelope antigo.
    expect(fonte).not.toMatch(/\{\s*uploadUrl\s*,[^}]*\}\s*=\s*\(?\s*await\s+resp\.json\(\)/);
    expect(fonte, 'o cliente do presign não lê `data`').toMatch(/\bdata\b/);
  });
});

// ---------------------------------------------------------------------------
// metrics
// ---------------------------------------------------------------------------

async function metrics(headers: Record<string, string> = {}): Promise<Response> {
  const { GET } = await import('@/app/api/metrics/route');
  return GET(new NextRequest(new URL('/api/metrics', 'http://localhost:3000'), { headers }));
}

describe('#189 — /api/metrics recusa no envelope { error: { code, message } }', () => {
  it('bearer errado → 401 com error.code e error.message', async () => {
    vi.stubEnv('METRICS_SECRET', 'segredo-de-teste-189');
    const res = await metrics({ authorization: 'Bearer errado' });

    expect(res.status).toBe(401);
    const corpo = await res.json();
    expect(typeof corpo.error, 'erro em string solta, fora do envelope').toBe('object');
    expect(corpo.error.code).toBeTypeOf('string');
    expect(corpo.error.code.length).toBeGreaterThan(0);
    expect(corpo.error.message).toBeTypeOf('string');
  });

  it('sem METRICS_SECRET → 503 com error.code e error.message', async () => {
    vi.stubEnv('METRICS_SECRET', '');
    const res = await metrics({ authorization: 'Bearer qualquer' });

    expect(res.status).toBe(503);
    const corpo = await res.json();
    expect(typeof corpo.error, 'erro em string solta, fora do envelope').toBe('object');
    expect(corpo.error.code).toBeTypeOf('string');
    expect(corpo.error.code.length).toBeGreaterThan(0);
    expect(corpo.error.message).toBeTypeOf('string');
  });

  it('regressão: bearer certo → 200 em texto Prometheus, sem envelope JSON', async () => {
    vi.stubEnv('METRICS_SECRET', 'segredo-de-teste-189');
    const res = await metrics({ authorization: 'Bearer segredo-de-teste-189' });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/plain');
  });
});
