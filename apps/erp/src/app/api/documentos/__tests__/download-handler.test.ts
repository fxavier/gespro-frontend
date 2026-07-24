/**
 * GET /api/documentos/[id]/download — verificação de posse + presigned GET.
 * Cobre: cross-tenant → 404 (nunca 403); documento próprio → 302.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  fornecedorFindFirst: vi.fn(),
  ativoFindFirst: vi.fn(),
  viaturaFindFirst: vi.fn(),
  motoristaFindFirst: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/client', () => ({
  prismaBase: {
    documentoFornecedor: { findFirst: mocks.fornecedorFindFirst },
    documentoAtivo: { findFirst: mocks.ativoFindFirst },
    documentoViatura: { findFirst: mocks.viaturaFindFirst },
    documentoMotorista: { findFirst: mocks.motoristaFindFirst },
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../[id]/download/route';

function pedido(id: string, recurso?: string): NextRequest {
  const qs = recurso ? `?recurso=${recurso}` : '';
  return new NextRequest(`http://localhost:3000/api/documentos/${id}/download${qs}`);
}
const segmento = (id: string) => ({ params: Promise.resolve({ id }) });

function sessao() {
  return { user: { id: 'u1', tenantId: 'tenant-abc', permissions: [] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STORAGE_DRIVER = 'local';
  mocks.auth.mockResolvedValue(sessao());
  // Todos os findFirst já filtram por { id, tenantId } → cross-tenant devolve null.
  mocks.fornecedorFindFirst.mockResolvedValue(null);
  mocks.ativoFindFirst.mockResolvedValue(null);
  mocks.viaturaFindFirst.mockResolvedValue(null);
  mocks.motoristaFindFirst.mockResolvedValue(null);
});

describe('download — posse de tenant', () => {
  it('401 sem sessão', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET(pedido('doc1'), segmento('doc1'));
    expect(res.status).toBe(401);
  });

  it('cross-tenant → 404 (nunca 403)', async () => {
    // Nenhum buscador encontra o doc (filtro por tenantId no where).
    const res = await GET(pedido('doc-de-outro-tenant'), segmento('doc-de-outro-tenant'));
    expect(res.status).toBe(404);
  });

  it('documento próprio (storageKey) → 302 para presigned GET', async () => {
    mocks.fornecedorFindFirst.mockResolvedValue({
      id: 'doc1',
      nome: 'contrato.pdf',
      storageKey: 'tenant/tenant-abc/fornecedor/f1/uuid-contrato.pdf',
      url: 'gestpro-storage:tenant/tenant-abc/fornecedor/f1/uuid-contrato.pdf',
    });
    const res = await GET(pedido('doc1', 'fornecedor'), segmento('doc1'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/api/documentos/local/');
    // filtrou por tenant do contexto
    expect(mocks.fornecedorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc1', tenantId: 'tenant-abc' } }),
    );
  });

  it('resolve a key a partir de `url` (gestpro-storage:) quando storageKey é null', async () => {
    mocks.ativoFindFirst.mockResolvedValue({
      id: 'doc2',
      nome: 'foto.png',
      storageKey: null,
      url: 'gestpro-storage:tenant/tenant-abc/ativo/a1/uuid-foto.png',
    });
    const res = await GET(pedido('doc2', 'ativo'), segmento('doc2'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/api/documentos/local/');
  });
});
