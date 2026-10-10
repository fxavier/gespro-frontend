/**
 * ORÁCULO — issues #187 e #188 (nó A:withapi-traceid-zod-envelope-187-189).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador):
 *  #187 — um erro inesperado no `withApi` devolve 500 com
 *         `{ error: { code: 'ERRO_INTERNO', message, traceId } }`, sem stack nem a
 *         mensagem crua. O `traceId` é o mesmo valor do cabeçalho `x-request-id`
 *         (é o `requestId` que está nos logs).
 *  #188 — o `withApi` aceita schemas Zod opcionais para a query (`query`) e para os
 *         parâmetros de rota (`params`). Falha → 422 `VALIDACAO` com
 *         `details = flatten()` e o handler NÃO corre. Sucesso → o handler recebe os
 *         valores já transformados em `ctx.query` / `ctx.params`. A sessão e a
 *         permissão vêm antes da validação (sem sessão continua a ser 401).
 *
 * Nomes das opções (`query`, `params`) e dos campos do contexto (`ctx.query`,
 * `ctx.params`) fixados por este oráculo. As opções vão como `any` para que o
 * caso falhe pela asserção e não pelo `tsc`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';

const withApiQualquer = withApi as unknown as (h: any, o?: any) => ReturnType<typeof withApi>;

const CUID = 'ckxyz0000000000000000000';
const DETALHE = 'ligacao-perdida-segredo-xyz em /opt/app/node_modules/pg';

function sessao(permissions: string[] = ['modulo:ler']) {
  return { user: { id: 'user-1', tenantId: 'tenant-1', permissions, acesso: 'normal' } };
}

function pedido(path: string, method = 'GET') {
  return new NextRequest(new URL(path, 'http://localhost:3000'), { method });
}

function segmento(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(sessao());
});

// ---------------------------------------------------------------------------
// #187 — traceId no corpo do 500
// ---------------------------------------------------------------------------

describe('#187 — 500 do withApi leva traceId no corpo, sem stack', () => {
  it('rota autenticada: erro inesperado → { error: { code, message, traceId } } = x-request-id', async () => {
    const rota = withApi(async () => {
      throw new Error(DETALHE);
    });
    const res = await rota(pedido('/api/algures'));

    expect(res.status).toBe(500);
    const requestId = res.headers.get('x-request-id');
    expect(requestId).toBeTruthy();

    const texto = await res.text();
    const corpo = JSON.parse(texto);
    expect(corpo.error.code).toBe('ERRO_INTERNO');
    expect(corpo.error.message).toBe('Erro interno');
    expect(corpo.error.traceId, 'o corpo do 500 não traz traceId').toBe(requestId);

    expect(texto).not.toContain('ligacao-perdida-segredo-xyz');
    expect(texto).not.toContain('node_modules');
    expect(texto).not.toMatch(/stack/i);
  });

  it('rota pública: o mesmo envelope com traceId', async () => {
    const rota = withApi(
      async () => {
        throw new TypeError(DETALHE);
      },
      { public: true },
    );
    const res = await rota(pedido('/api/publica'));

    expect(res.status).toBe(500);
    const corpo = await res.json();
    expect(corpo.error.code).toBe('ERRO_INTERNO');
    expect(corpo.error.traceId).toBe(res.headers.get('x-request-id'));
    expect(JSON.stringify(corpo)).not.toContain('ligacao-perdida-segredo-xyz');
  });

  it('cada pedido tem o seu traceId', async () => {
    const rota = withApi(async () => {
      throw new Error('x');
    });
    const a = await (await rota(pedido('/api/a'))).json();
    const b = await (await rota(pedido('/api/a'))).json();
    expect(a.error.traceId).toBeTruthy();
    expect(a.error.traceId).not.toBe(b.error.traceId);
  });

  it('regressão: um AppError continua com o seu código e estado', async () => {
    const rota = withApi(async () => {
      throw new ForbiddenError();
    });
    const res = await rota(pedido('/api/algures'));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('SEM_PERMISSAO');
  });
});

// ---------------------------------------------------------------------------
// #188 — validação Zod da query e dos parâmetros de rota
// ---------------------------------------------------------------------------

describe('#188 — withApi valida a query com Zod', () => {
  const QuerySchema = z.object({
    take: z.coerce.number().int().positive(),
    entity: z.string().optional(),
  });

  it('query inválida → 422 VALIDACAO com flatten() em details, e o handler não corre', async () => {
    const handler = vi.fn(async () => new Response('{}', { status: 200 }));
    const rota = withApiQualquer(handler, { query: QuerySchema });

    const res = await rota(pedido('/api/lista?take=abc'));

    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe('VALIDACAO');
    expect(corpo.error.details?.fieldErrors?.take).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('query válida → o handler recebe ctx.query já transformado', async () => {
    let recebido: unknown;
    const rota = withApiQualquer(
      async (_req: NextRequest, ctx: any) => {
        recebido = ctx.query;
        return new Response('{}', { status: 200 });
      },
      { query: QuerySchema },
    );

    const res = await rota(pedido('/api/lista?take=5&entity=Fatura'));

    expect(res.status).toBe(200);
    expect(recebido).toEqual({ take: 5, entity: 'Fatura' });
  });

  it('sem sessão continua a ser 401, antes da validação', async () => {
    mocks.auth.mockResolvedValue(null);
    const handler = vi.fn(async () => new Response('{}', { status: 200 }));
    const rota = withApiQualquer(handler, { query: QuerySchema });

    const res = await rota(pedido('/api/lista?take=abc'));

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('sem permissão continua a ser 403, antes da validação', async () => {
    const handler = vi.fn(async () => new Response('{}', { status: 200 }));
    const rota = withApiQualquer(handler, { query: QuerySchema, permission: 'outra:perm' });

    const res = await rota(pedido('/api/lista?take=abc'));

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('#188 — withApi valida os parâmetros de rota com Zod', () => {
  const ParamsSchema = z.object({ id: z.string().regex(/^c[a-z0-9]{20,}$/) });

  it('parâmetro inválido → 422 VALIDACAO e o handler não corre', async () => {
    const handler = vi.fn(async () => new Response('{}', { status: 200 }));
    const rota = withApiQualquer(handler, { params: ParamsSchema });

    const res = await rota(pedido('/api/coisa/nao-e-id'), segmento({ id: 'nao-e-id' }));

    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe('VALIDACAO');
    expect(corpo.error.details?.fieldErrors?.id).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('parâmetro válido → ctx.params é o resultado do schema', async () => {
    let recebido: unknown;
    const rota = withApiQualquer(
      async (_req: NextRequest, ctx: any) => {
        recebido = ctx.params;
        return new Response('{}', { status: 200 });
      },
      { params: ParamsSchema },
    );

    const res = await rota(pedido(`/api/coisa/${CUID}`), segmento({ id: CUID }));

    expect(res.status).toBe(200);
    expect(recebido).toEqual({ id: CUID });
  });

  it('sem schema, o comportamento não muda: ctx.params em bruto e a query não é validada', async () => {
    let recebido: unknown;
    const rota = withApi(async (_req, ctx) => {
      recebido = ctx.params;
      return new Response('{}', { status: 200 });
    });

    const res = await rota(pedido('/api/coisa/x?take=abc'), segmento({ id: 'x' }));

    expect(res.status).toBe(200);
    expect(recebido).toEqual({ id: 'x' });
  });
});
