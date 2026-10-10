/**
 * Oráculo — issue #163: download dos documentos do colaborador.
 *
 * `GET /api/documentos/[id]/download` não tem buscador para `colaborador` («ainda não tem tabela de
 * documentos»), mas a tabela `DocumentoColaborador` existe. Contrato:
 *   - `?recurso=colaborador` procura em `documentoColaborador` filtrando por `{ id, tenantId }` do
 *     contexto; documento próprio → 302 para o presigned GET (key derivada da `url`
 *     `gestpro-storage:`; o modelo não tem `storageKey`).
 *   - Sem `?recurso`, a procura nas tabelas conhecidas também encontra o documento do colaborador.
 *   - Exige `rh:colaboradores:update` (`PERMISSAO_ESCRITA_POR_RECURSO.colaborador`, a mesma do
 *     presign) → sem ela, 403.
 *   - Cross-tenant → 404 (nunca 403); key fora do prefixo do tenant → 404.
 *
 * Prisma dobrado (molde: `download-handler.test.ts`); storage local real.
 * Escrito pelo verificador do nó B:rh-documentos-upload-163; um agente de implementação que o
 * altere é BLOCKER.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  fornecedorFindFirst: vi.fn(),
  ativoFindFirst: vi.fn(),
  viaturaFindFirst: vi.fn(),
  motoristaFindFirst: vi.fn(),
  colaboradorFindFirst: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/client', () => ({
  prismaBase: {
    documentoFornecedor: { findFirst: mocks.fornecedorFindFirst },
    documentoAtivo: { findFirst: mocks.ativoFindFirst },
    documentoViatura: { findFirst: mocks.viaturaFindFirst },
    documentoMotorista: { findFirst: mocks.motoristaFindFirst },
    documentoColaborador: { findFirst: mocks.colaboradorFindFirst },
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../[id]/download/route';

const TENANT = 'tenant-abc';
const KEY = `tenant/${TENANT}/colaborador/ckcolab000000000000000000/00000000-0000-4000-8000-000000000001-bi.pdf`;

function pedido(id: string, recurso?: string): NextRequest {
  const qs = recurso ? `?recurso=${recurso}` : '';
  return new NextRequest(`http://localhost:3000/api/documentos/${id}/download${qs}`);
}
const segmento = (id: string) => ({ params: Promise.resolve({ id }) });

function sessao(permissions: string[]) {
  return { user: { id: 'u1', tenantId: TENANT, permissions } };
}

/** Linha de `DocumentoColaborador` tal como a base a tem (sem `storageKey`). */
function linha(id: string, url: string) {
  return {
    id,
    tenantId: TENANT,
    colaboradorId: 'ckcolab000000000000000000',
    tipo: 'BI_FRENTE',
    nome: 'bi.pdf',
    url,
    tamanho: 1234,
    dataUpload: new Date('2026-10-01T10:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STORAGE_DRIVER = 'local';
  mocks.auth.mockResolvedValue(sessao(['rh:colaboradores:update']));
  mocks.fornecedorFindFirst.mockResolvedValue(null);
  mocks.ativoFindFirst.mockResolvedValue(null);
  mocks.viaturaFindFirst.mockResolvedValue(null);
  mocks.motoristaFindFirst.mockResolvedValue(null);
  mocks.colaboradorFindFirst.mockResolvedValue(null);
});

describe('download — documento do colaborador (#163)', () => {
  it('?recurso=colaborador → 302 para o presigned GET, filtrado pelo tenant do contexto', async () => {
    mocks.colaboradorFindFirst.mockResolvedValue(linha('docc1', `gestpro-storage:${KEY}`));
    const res = await GET(pedido('docc1', 'colaborador'), segmento('docc1'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/api/documentos/local/');
    expect(mocks.colaboradorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'docc1', tenantId: TENANT }) }),
    );
  });

  it('sem ?recurso, a procura nas tabelas conhecidas encontra o documento do colaborador', async () => {
    mocks.colaboradorFindFirst.mockResolvedValue(linha('docc2', `gestpro-storage:${KEY}`));
    const res = await GET(pedido('docc2'), segmento('docc2'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/api/documentos/local/');
  });

  it('403 sem rh:colaboradores:update (mesmo com o documento no tenant)', async () => {
    mocks.auth.mockResolvedValue(sessao(['rh:colaboradores:read', 'fornecedores:editar']));
    mocks.colaboradorFindFirst.mockResolvedValue(linha('docc3', `gestpro-storage:${KEY}`));
    const res = await GET(pedido('docc3', 'colaborador'), segmento('docc3'));
    expect(res.status).toBe(403);
  });

  it('cross-tenant → 404 (nunca 403)', async () => {
    // findFirst filtra por { id, tenantId } → o doc de outro tenant não aparece.
    const res = await GET(pedido('docc-outro', 'colaborador'), segmento('docc-outro'));
    expect(res.status).toBe(404);
    expect(mocks.colaboradorFindFirst).toHaveBeenCalled();
  });

  it('url a apontar para a key de outro tenant → 404', async () => {
    mocks.colaboradorFindFirst.mockResolvedValue(
      linha('docc4', 'gestpro-storage:tenant/outro-tenant/colaborador/x/00000000-0000-4000-8000-000000000009-x.pdf'),
    );
    const res = await GET(pedido('docc4', 'colaborador'), segmento('docc4'));
    expect(res.status).toBe(404);
  });
});
