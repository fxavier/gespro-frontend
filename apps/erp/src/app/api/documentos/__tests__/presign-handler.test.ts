/**
 * POST /api/documentos/presign — assinatura de upload.
 * Cobre: allowlist de content-type, limite de tamanho, permissão por recurso,
 * derivação server-side da key e envelope de resposta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

import { NextRequest } from 'next/server';
import { POST } from '../presign/route';

const CT_PDF = 'application/pdf';

function pedido(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/documentos/presign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sessao(permissions: string[]) {
  return { user: { id: 'u1', tenantId: 'tenant-abc', permissions } };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STORAGE_DRIVER = 'local';
});

describe('presign — segurança', () => {
  it('401 sem sessão', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(pedido({}));
    expect(res.status).toBe(401);
  });

  it('403 com sessão mas sem a permissão do recurso', async () => {
    mocks.auth.mockResolvedValue(sessao(['outra:perm']));
    const res = await POST(
      pedido({ recurso: 'fornecedor', recursoId: 'ckxyz0000000000000000000', nome: 'a.pdf', contentType: CT_PDF, tamanho: 100 }),
    );
    expect(res.status).toBe(403);
  });

  it('422 quando o content-type está fora da allowlist', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const res = await POST(
      pedido({
        recurso: 'fornecedor',
        recursoId: 'ckxyz0000000000000000000',
        nome: 'malware.exe',
        contentType: 'application/x-msdownload',
        tamanho: 100,
      }),
    );
    expect(res.status).toBe(422);
  });

  it('422 quando o tamanho excede o máximo (10 MB)', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const res = await POST(
      pedido({
        recurso: 'fornecedor',
        recursoId: 'ckxyz0000000000000000000',
        nome: 'grande.pdf',
        contentType: CT_PDF,
        tamanho: 10 * 1024 * 1024 + 1,
      }),
    );
    expect(res.status).toBe(422);
  });

  it('200 e deriva a key server-side no prefixo do tenant (ignora qualquer key do cliente)', async () => {
    mocks.auth.mockResolvedValue(sessao(['fornecedores:editar']));
    const res = await POST(
      pedido({
        recurso: 'fornecedor',
        recursoId: 'ckxyz0000000000000000000',
        nome: '../../escape.pdf',
        contentType: CT_PDF,
        tamanho: 2048,
        // Tentativa de injectar key — deve ser ignorada.
        key: 'tenant/outro/x',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key.startsWith('tenant/tenant-abc/fornecedor/ckxyz0000000000000000000/')).toBe(true);
    expect(body.key).not.toContain('..');
    expect(body.key).not.toContain('outro');
    expect(body.uploadUrl).toBeTypeOf('string');
    expect(body.requiredHeaders['Content-Type']).toBe(CT_PDF);
    expect(body.urlRef).toBe(`gestpro-storage:${body.key}`);
  });

  it('mapeia ativo → ativos:write', async () => {
    mocks.auth.mockResolvedValue(sessao(['ativos:write']));
    const res = await POST(
      pedido({ recurso: 'ativo', recursoId: 'ckxyz0000000000000000000', nome: 'foto.png', contentType: 'image/png', tamanho: 500 }),
    );
    expect(res.status).toBe(200);
  });
});
