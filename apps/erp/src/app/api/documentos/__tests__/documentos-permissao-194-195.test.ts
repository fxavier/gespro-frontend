/**
 * ORÁCULO (lacunas, issues #194 e #195, ADR-0017 §1) — escrita local de documentos e presign.
 *
 * Contrato (decidido pelo orquestrador):
 *   #194 — `PUT /api/documentos/local/{key}` exige a MESMA permissão de recurso que o presign e o
 *          download (`PERMISSAO_ESCRITA_POR_RECURSO`, lida do segmento `{recurso}` da key
 *          `tenant/{tenantId}/{recurso}/{recursoId}/…`) e que a key pertença ao tenant da sessão.
 *          Sem a permissão → 403, nada gravado. Key de outro tenant → 404, nada gravado. Recurso
 *          desconhecido ou só-servidor (`encerramento`, que o presign também recusa) → recusado,
 *          nada gravado.
 *   #195 — o presign valida `recursoId` com `idEntidade()` (cuid OU uuid), não `.cuid()`; o PUT
 *          local impõe `MAX_DOCUMENTO_BYTES` tanto pelo `Content-Length` (recusa ANTES de ler o
 *          corpo) como pelo corpo efectivamente recebido (um `Content-Length` mentiroso não passa).
 *          A condição `content-length-range` da política S3 POST só se aplica onde essa política
 *          existir — hoje não existe, e este oráculo não a exige.
 *
 * Escrito pelo autor do oráculo antes da implementação. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

import { NextRequest } from 'next/server';
import { PUT } from '../local/[...key]/route';
import { POST } from '../presign/route';
import { MAX_DOCUMENTO_BYTES } from '@/lib/storage/documento-config';

const TENANT = 'tenant-abc';
const CUID = 'ckxyz0000000000000000000';
const UUID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

let dirTmp: string;

beforeAll(async () => {
  dirTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gespro-docs-194-195-'));
  process.env.STORAGE_LOCAL_DIR = dirTmp;
});

afterAll(async () => {
  await fs.rm(dirTmp, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = dirTmp;
});

function sessao(permissions: string[]) {
  return { user: { id: 'u1', tenantId: TENANT, permissions } };
}

let seq = 0;
/** Key nova por teste (nunca colide com a de outro teste no mesmo directório). */
function keyDe(recurso: string, tenant = TENANT, recursoId = CUID): string {
  seq += 1;
  return `tenant/${tenant}/${recurso}/${recursoId}/00000000-0000-4000-8000-${String(seq).padStart(12, '0')}-doc.pdf`;
}

function pedidoPut(
  key: string,
  corpo: BodyInit,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/documentos/local/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf', ...headers },
    body: corpo,
    // necessário para corpos em stream no undici
    duplex: 'half',
  } as ConstructorParameters<typeof NextRequest>[1]);
}

const segmento = (key: string) => ({ params: Promise.resolve({ key: key.split('/') }) });

async function existe(key: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirTmp, key));
    return true;
  } catch {
    return false;
  }
}

const PDF = new TextEncoder().encode('%PDF-1.7 contrato');

// ---------------------------------------------------------------------------
// #194 — permissão do recurso no PUT local
// ---------------------------------------------------------------------------

describe('#194 — PUT /api/documentos/local exige a permissão do recurso da key', () => {
  it('sessão do tenant SEM a permissão do recurso → 403 e nada é gravado', async () => {
    mocks.auth.mockResolvedValue(sessao([]));
    const key = keyDe('fornecedor');
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect(res.status, 'PUT sem fornecedores:editar').toBe(403);
    expect(await existe(key), 'objecto gravado sem permissão').toBe(false);
  });

  it('permissão de OUTRO recurso não serve (ativos:write numa key de fornecedor) → 403', async () => {
    mocks.auth.mockResolvedValue(sessao(['ativos:write']));
    const key = keyDe('fornecedor');
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect(res.status).toBe(403);
    expect(await existe(key)).toBe(false);
  });

  it.each([
    ['fornecedor', 'fornecedores:editar'],
    ['ativo', 'ativos:write'],
    ['viatura', 'transporte:viatura:documentos'],
    ['motorista', 'transporte:motorista:documentos'],
    ['colaborador', 'rh:colaboradores:update'],
  ])('com a permissão do recurso (%s → %s) → 200 e o objecto fica gravado', async (recurso, perm) => {
    mocks.auth.mockResolvedValue(sessao([perm]));
    const key = keyDe(recurso);
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect(res.status).toBe(200);
    expect(await existe(key)).toBe(true);
  });

  it('key de OUTRO tenant → 404 (nunca 403) mesmo com a permissão, e nada é gravado', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const key = keyDe('fornecedor', 'tenant-outro');
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect(res.status).toBe(404);
    expect(await existe(key)).toBe(false);
  });

  it('recurso desconhecido no segmento da key → recusado (403/404) e nada é gravado', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar', 'ativos:write', 'financas:exportar']));
    const key = keyDe('desconhecido');
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect([403, 404], `status ${res.status}`).toContain(res.status);
    expect(await existe(key)).toBe(false);
  });

  it('key sem segmento de recurso (directamente sob o prefixo do tenant) → recusada e nada é gravado', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    seq += 1;
    const key = `tenant/${TENANT}/solto-${seq}.pdf`;
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect([403, 404], `status ${res.status}`).toContain(res.status);
    expect(await existe(key)).toBe(false);
  });

  it('recurso só-servidor (encerramento) não aceita escrita do cliente, nem com financas:exportar', async () => {
    mocks.auth.mockResolvedValue(sessao(['financas:exportar']));
    const key = keyDe('encerramento');
    const res = await PUT(pedidoPut(key, PDF), segmento(key));
    expect(res.status, `status ${res.status}`).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await existe(key), 'PDF de encerramento escrito pelo cliente').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #195 — tamanho máximo imposto no PUT local
// ---------------------------------------------------------------------------

describe('#195 — PUT local impõe MAX_DOCUMENTO_BYTES', () => {
  it('Content-Length acima do máximo → recusado (413/422) SEM ler o corpo', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const key = keyDe('fornecedor');
    // Corpo que nunca termina: se o handler o ler antes de olhar para o Content-Length,
    // o pedido fica pendurado e o teste estoura o tempo.
    let lido = false;
    const corpoInfinito = new ReadableStream<Uint8Array>({
      pull() {
        lido = true;
        return new Promise(() => {});
      },
    });
    const res = await Promise.race([
      PUT(
        pedidoPut(key, corpoInfinito, { 'content-length': String(MAX_DOCUMENTO_BYTES + 1) }),
        segmento(key),
      ),
      new Promise<'pendurado'>((r) => setTimeout(() => r('pendurado'), 2000)),
    ]);
    expect(res, 'o handler leu o corpo em vez de recusar pelo Content-Length').not.toBe('pendurado');
    const status = (res as Response).status;
    expect([413, 422], `status ${status}`).toContain(status);
    expect(lido && status === 200).toBe(false);
    expect(await existe(key)).toBe(false);
  });

  it('corpo acima do máximo com Content-Length mentiroso (pequeno) → recusado e nada é gravado', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const key = keyDe('fornecedor');
    const grande = new Uint8Array(MAX_DOCUMENTO_BYTES + 1);
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(grande);
        c.close();
      },
    });
    const res = await PUT(pedidoPut(key, corpo, { 'content-length': '100' }), segmento(key));
    expect([413, 422], `status ${res.status}`).toContain(res.status);
    expect(await existe(key)).toBe(false);
  });

  it('corpo acima do máximo sem Content-Length → recusado e nada é gravado', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const key = keyDe('fornecedor');
    const grande = new Uint8Array(MAX_DOCUMENTO_BYTES + 1);
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(grande.subarray(0, MAX_DOCUMENTO_BYTES));
        c.enqueue(grande.subarray(MAX_DOCUMENTO_BYTES));
        c.close();
      },
    });
    const res = await PUT(pedidoPut(key, corpo), segmento(key));
    expect([413, 422], `status ${res.status}`).toContain(res.status);
    expect(await existe(key)).toBe(false);
  });

  it('corpo exactamente no máximo → 200 e gravado com o tamanho certo (fronteira)', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const key = keyDe('fornecedor');
    const res = await PUT(
      pedidoPut(key, new Uint8Array(MAX_DOCUMENTO_BYTES), {
        'content-length': String(MAX_DOCUMENTO_BYTES),
      }),
      segmento(key),
    );
    expect(res.status).toBe(200);
    const st = await fs.stat(path.join(dirTmp, key));
    expect(st.size).toBe(MAX_DOCUMENTO_BYTES);
  });
});

// ---------------------------------------------------------------------------
// #195 — presign aceita ids uuid (idEntidade)
// ---------------------------------------------------------------------------

function pedidoPresign(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/documentos/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('#195 — presign valida recursoId com idEntidade()', () => {
  it('recursoId uuid → 200 e a key fica sob o recurso com esse id', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const res = await POST(
      pedidoPresign({
        recurso: 'fornecedor',
        recursoId: UUID,
        nome: 'contrato.pdf',
        contentType: 'application/pdf',
        tamanho: 2048,
      }),
    );
    expect(res.status, 'presign recusou um id uuid').toBe(200);
    // #189: o sucesso vem no envelope { data } do withApi.
    const { data: body } = await res.json();
    expect(body.key.startsWith(`tenant/${TENANT}/fornecedor/${UUID}/`)).toBe(true);
  });

  it('recursoId cuid continua a passar → 200', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const res = await POST(
      pedidoPresign({
        recurso: 'fornecedor',
        recursoId: CUID,
        nome: 'contrato.pdf',
        contentType: 'application/pdf',
        tamanho: 2048,
      }),
    );
    expect(res.status).toBe(200);
  });

  it.each(['nao-e-id', '../../tenant/outro', '', 'x'.repeat(30)])(
    'recursoId que não é cuid nem uuid (%j) → 422',
    async (recursoId) => {
      mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
      const res = await POST(
        pedidoPresign({
          recurso: 'fornecedor',
          recursoId,
          nome: 'contrato.pdf',
          contentType: 'application/pdf',
          tamanho: 2048,
        }),
      );
      expect(res.status).toBe(422);
    },
  );

  it('a key emitida pelo presign (uuid) é aceite no PUT local com a mesma permissão — ida e volta', async () => {
    mocks.auth.mockResolvedValue(sessao(['ativos:write']));
    const res = await POST(
      pedidoPresign({
        recurso: 'ativo',
        recursoId: UUID,
        nome: 'foto.png',
        contentType: 'image/png',
        tamanho: PDF.byteLength,
      }),
    );
    expect(res.status).toBe(200);
    // #189: o sucesso vem no envelope { data } do withApi.
    const {
      data: { key },
    } = await res.json();
    const put = await PUT(
      pedidoPut(key, PDF, { 'content-type': 'image/png' }),
      segmento(key),
    );
    expect(put.status).toBe(200);
    expect(await existe(key)).toBe(true);
  });
});
