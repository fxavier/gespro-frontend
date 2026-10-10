/**
 * ORÁCULO — issue #193: o download de documentos exigia a permissão de ESCRITA do recurso
 * (`PERMISSAO_ESCRITA_POR_RECURSO`), pelo que quem só consulta o recurso não descarregava.
 *
 * Contrato (decisão do orquestrador; escrito pelo verificador ANTES da implementação):
 *   - `GET /api/documentos/[id]/download` exige a permissão de LEITURA do recurso do documento:
 *       fornecedor  → fornecedores:ver
 *       ativo       → ativos:read
 *       viatura     → transporte:viatura:listar
 *       motorista   → transporte:motorista:listar
 *       colaborador → rh:colaboradores:read
 *     (as mesmas que as Server Actions de consulta de cada recurso declaram).
 *   - A escrita SOZINHA não basta (decisão conservadora: recusar > abrir): sem a leitura → 403.
 *     O invariante do RBAC (`src/lib/__tests__/rbac-documentos-download-193.test.ts`) garante
 *     que nenhum papel de sistema tem a escrita sem a leitura.
 *   - A leitura de OUTRO recurso não serve → 403.
 *   - O upload (presign + PUT local, #194) continua a exigir a ESCRITA: a leitura não sobe ficheiros.
 *   - Posse de tenant inalterada (cross-tenant → 404), coberta por `download-handler.test.ts`.
 *
 * Prisma dobrado (molde: `download-handler.test.ts`); storage local real.
 * NUNCA `vitest -u`; um agente de implementação que altere este ficheiro é BLOCKER.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
import { POST } from '../presign/route';
import { PUT } from '../local/[...key]/route';
import { SYSTEM_ROLES } from '../../../../../prisma/seed/rbac';

const TENANT = 'tenant-abc';
const CUID = 'ckxyz0000000000000000000';

type Recurso = 'fornecedor' | 'ativo' | 'viatura' | 'motorista' | 'colaborador';

/** recurso → [permissão de leitura (download), permissão de escrita (upload)]. */
const PERMS: Record<Recurso, { leitura: string; escrita: string }> = {
  fornecedor: { leitura: 'fornecedores:ver', escrita: 'fornecedores:editar' },
  ativo: { leitura: 'ativos:read', escrita: 'ativos:write' },
  viatura: { leitura: 'transporte:viatura:listar', escrita: 'transporte:viatura:documentos' },
  motorista: { leitura: 'transporte:motorista:listar', escrita: 'transporte:motorista:documentos' },
  colaborador: { leitura: 'rh:colaboradores:read', escrita: 'rh:colaboradores:update' },
};
const RECURSOS = Object.keys(PERMS) as Recurso[];

const keyDoc = (recurso: Recurso) =>
  `tenant/${TENANT}/${recurso}/${CUID}/00000000-0000-4000-8000-000000000193-doc.pdf`;

/** Coloca o documento `id` na tabela do recurso, tal como cada buscador a lê. */
function colocarDocumento(recurso: Recurso, id: string) {
  const ref = `gestpro-storage:${keyDoc(recurso)}`;
  switch (recurso) {
    case 'fornecedor':
      mocks.fornecedorFindFirst.mockResolvedValue({ id, nome: 'doc.pdf', storageKey: keyDoc(recurso), url: ref });
      break;
    case 'ativo':
      mocks.ativoFindFirst.mockResolvedValue({ id, nome: 'doc.pdf', storageKey: keyDoc(recurso), url: ref });
      break;
    case 'viatura':
      mocks.viaturaFindFirst.mockResolvedValue({ id, numero: 'SEG-1', storageKey: keyDoc(recurso), anexo: ref });
      break;
    case 'motorista':
      mocks.motoristaFindFirst.mockResolvedValue({ id, numero: 'CART-1', storageKey: keyDoc(recurso), anexo: ref });
      break;
    case 'colaborador':
      mocks.colaboradorFindFirst.mockResolvedValue({ id, nome: 'bi.pdf', url: ref });
      break;
  }
}

function pedido(id: string, recurso: Recurso): NextRequest {
  return new NextRequest(`http://localhost:3000/api/documentos/${id}/download?recurso=${recurso}`);
}
const segmento = (id: string) => ({ params: Promise.resolve({ id }) });

function sessao(permissions: string[]) {
  return { user: { id: 'u1', tenantId: TENANT, permissions } };
}

let dirTmp: string;
beforeAll(async () => {
  dirTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gespro-docs-193-'));
});
afterAll(async () => {
  await fs.rm(dirTmp, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STORAGE_DRIVER = 'local';
  process.env.STORAGE_LOCAL_DIR = dirTmp;
  mocks.fornecedorFindFirst.mockResolvedValue(null);
  mocks.ativoFindFirst.mockResolvedValue(null);
  mocks.viaturaFindFirst.mockResolvedValue(null);
  mocks.motoristaFindFirst.mockResolvedValue(null);
  mocks.colaboradorFindFirst.mockResolvedValue(null);
});

describe('#193 — download exige a permissão de LEITURA do recurso', () => {
  it.each(RECURSOS)('%s: só com a permissão de leitura → 302 para o presigned GET', async (recurso) => {
    mocks.auth.mockResolvedValue(sessao([PERMS[recurso].leitura]));
    colocarDocumento(recurso, `doc-${recurso}`);
    const res = await GET(pedido(`doc-${recurso}`, recurso), segmento(`doc-${recurso}`));
    expect(res.status, `download de ${recurso} com ${PERMS[recurso].leitura}`).toBe(302);
    expect(res.headers.get('location')).toContain('/api/documentos/local/');
  });

  it.each(RECURSOS)('%s: só com a permissão de escrita (sem a leitura) → 403', async (recurso) => {
    mocks.auth.mockResolvedValue(sessao([PERMS[recurso].escrita]));
    colocarDocumento(recurso, `doc-${recurso}`);
    const res = await GET(pedido(`doc-${recurso}`, recurso), segmento(`doc-${recurso}`));
    expect(res.status, `download de ${recurso} só com ${PERMS[recurso].escrita}`).toBe(403);
  });

  it.each(RECURSOS)('%s: a leitura de TODOS os outros recursos não serve → 403', async (recurso) => {
    const outras = RECURSOS.filter((r) => r !== recurso).map((r) => PERMS[r].leitura);
    mocks.auth.mockResolvedValue(sessao(outras));
    colocarDocumento(recurso, `doc-${recurso}`);
    const res = await GET(pedido(`doc-${recurso}`, recurso), segmento(`doc-${recurso}`));
    expect(res.status).toBe(403);
  });

  it('sem nenhuma permissão → 403 (o documento é do tenant)', async () => {
    mocks.auth.mockResolvedValue(sessao([]));
    colocarDocumento('fornecedor', 'doc-x');
    const res = await GET(pedido('doc-x', 'fornecedor'), segmento('doc-x'));
    expect(res.status).toBe(403);
  });

  it.each(RECURSOS)('%s: o papel de sistema LEITURA descarrega (permissões reais do rbac.ts)', async (recurso) => {
    const leitura = SYSTEM_ROLES.find((r) => r.nome === 'LEITURA');
    expect(leitura, 'papel LEITURA existe').toBeDefined();
    mocks.auth.mockResolvedValue(sessao(leitura!.permissionCodes));
    colocarDocumento(recurso, `doc-${recurso}`);
    const res = await GET(pedido(`doc-${recurso}`, recurso), segmento(`doc-${recurso}`));
    expect(res.status, `LEITURA a descarregar ${recurso}`).toBe(302);
  });
});

describe('#193 — o upload continua a exigir a permissão de ESCRITA', () => {
  function pedidoPresign(recurso: Recurso): NextRequest {
    return new NextRequest('http://localhost:3000/api/documentos/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recurso,
        recursoId: CUID,
        nome: 'doc.pdf',
        contentType: 'application/pdf',
        tamanho: 64,
      }),
    });
  }

  it.each(RECURSOS)('%s: presign só com a leitura → 403', async (recurso) => {
    mocks.auth.mockResolvedValue(sessao([PERMS[recurso].leitura]));
    const res = await POST(pedidoPresign(recurso));
    expect(res.status, `presign de ${recurso} com ${PERMS[recurso].leitura}`).toBe(403);
  });

  it.each(RECURSOS)('%s: presign com a escrita → 200', async (recurso) => {
    mocks.auth.mockResolvedValue(sessao([PERMS[recurso].escrita]));
    const res = await POST(pedidoPresign(recurso));
    expect(res.status).toBe(200);
  });

  it.each(RECURSOS)('%s: PUT local só com a leitura → 403 e nada é gravado', async (recurso) => {
    mocks.auth.mockResolvedValue(sessao([PERMS[recurso].leitura]));
    const key = `tenant/${TENANT}/${recurso}/${CUID}/00000000-0000-4000-8000-000000001930-put.pdf`;
    const req = new NextRequest(`http://localhost:3000/api/documentos/local/${key}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf' },
      body: new TextEncoder().encode('%PDF-1.7 x'),
    });
    const res = await PUT(req, { params: Promise.resolve({ key: key.split('/') }) });
    expect(res.status).toBe(403);
    await expect(fs.access(path.join(dirTmp, key))).rejects.toThrow();
  });
});
