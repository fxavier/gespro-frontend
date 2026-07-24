/**
 * GET /api/documentos/[id]/download[?recurso=...] — redireciona para um
 * presigned GET de curta duração (300s) do objeto associado ao metadado.
 *
 * Segurança (spec 01 §RF4, §RNF2):
 *   - Verifica que o metadado (por `id`) pertence ao `tenantId` do contexto.
 *     Cross-tenant → `NotFoundError` (404, NUNCA 403).
 *   - A URL assinada expira em 300s; o objeto nunca é servido publicamente.
 *   - Log de auditoria do acesso.
 *
 * `recurso` (opcional) seleciona a tabela de metadados; se ausente, procura
 * nas tabelas conhecidas (ids cuid são globalmente únicos na prática).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { prismaBase } from '@/server/db/client';
import { getObjectStorage, urlRefParaKey } from '@/lib/storage/objeto';

export const runtime = 'nodejs';

interface DocMeta {
  id: string;
  nome: string;
  storageKey: string | null;
  url: string;
}

type Buscador = (id: string, tenantId: string) => Promise<DocMeta | null>;

const BUSCADORES: Record<string, Buscador> = {
  fornecedor: async (id, tenantId) => {
    const d = await prismaBase.documentoFornecedor.findFirst({
      where: { id, tenantId },
      select: { id: true, nome: true, storageKey: true, url: true },
    });
    return d ?? null;
  },
  ativo: async (id, tenantId) => {
    const d = await prismaBase.documentoAtivo.findFirst({
      where: { id, tenantId },
      select: { id: true, nome: true, storageKey: true, url: true },
    });
    return d ?? null;
  },
  viatura: async (id, tenantId) => {
    const d = await prismaBase.documentoViatura.findFirst({
      where: { id, tenantId },
      select: { id: true, numero: true, storageKey: true, anexo: true },
    });
    return d ? { id: d.id, nome: d.numero, storageKey: d.storageKey, url: d.anexo ?? '' } : null;
  },
  motorista: async (id, tenantId) => {
    const d = await prismaBase.documentoMotorista.findFirst({
      where: { id, tenantId },
      select: { id: true, numero: true, storageKey: true, anexo: true },
    });
    return d ? { id: d.id, nome: d.numero, storageKey: d.storageKey, url: d.anexo ?? '' } : null;
  },
};

async function encontrar(id: string, recurso: string | null, tenantId: string): Promise<DocMeta | null> {
  if (recurso && BUSCADORES[recurso]) return BUSCADORES[recurso](id, tenantId);
  for (const buscar of Object.values(BUSCADORES)) {
    const doc = await buscar(id, tenantId);
    if (doc) return doc;
  }
  return null;
}

export const GET = withApi(async (req: NextRequest, ctx) => {
  const id = String(ctx.params.id ?? '');
  if (!id) throw new NotFoundError('Documento não encontrado');

  const recurso = new URL(req.url).searchParams.get('recurso');
  const doc = await encontrar(id, recurso, ctx.tenantId);
  if (!doc) throw new NotFoundError('Documento não encontrado');

  const log = logger.child({ tenantId: ctx.tenantId, userId: ctx.userId });

  // Resolve a key: storageKey (novo) tem precedência; senão parse do `url`.
  const key = doc.storageKey || (doc.url ? urlRefParaKey(doc.url) : null);
  if (!key) {
    // Sem key derivável: só redireciona se for uma URL http externa/legada.
    if (/^https?:\/\//i.test(doc.url)) {
      log.info({ documentoId: id }, 'download de documento (url legada)');
      return NextResponse.redirect(doc.url, 302);
    }
    throw new NotFoundError('Documento sem ficheiro associado');
  }

  const signedUrl = await getObjectStorage().presignGet(key, 300);
  // s3 devolve URL absoluta; o driver local devolve um caminho relativo que
  // resolvemos contra a origem do pedido (redirect exige URL absoluta).
  const destino = /^https?:\/\//i.test(signedUrl)
    ? signedUrl
    : new URL(signedUrl, req.nextUrl.origin).toString();
  log.info({ documentoId: id }, 'download de documento (presigned)');

  return NextResponse.redirect(destino, 302);
});
