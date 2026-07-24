/**
 * GET /api/documentos/[id]/download[?recurso=...] — redireciona para um
 * presigned GET de curta duração (300s) do objeto associado ao metadado.
 *
 * Segurança (spec 01 §RF4, §RNF2, revisão B1/M1):
 *   - Verifica que o metadado (por `id`) pertence ao `tenantId` do contexto.
 *     Cross-tenant → `NotFoundError` (404, NUNCA 403).
 *   - Exige a MESMA permissão do recurso que o presign exige (M1): um doc é tão
 *     sensível como o recurso que descreve. Sem a permissão → 403.
 *   - Reafirma que a key resolvida está sob o prefixo do tenant ANTES de assinar
 *     (B1): defesa contra `url`/`anexo` (controlados pelo cliente no registo)
 *     apontarem para a key de outro tenant no mesmo bucket. → 404.
 *   - A URL assinada expira em 300s; o objeto nunca é servido publicamente.
 *   - Log de auditoria do acesso.
 *
 * `recurso` (opcional) seleciona a tabela de metadados; se ausente, procura
 * nas tabelas conhecidas (ids cuid são globalmente únicos na prática).
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { prismaBase } from '@/server/db/client';
import { getObjectStorage, urlRefParaKey, prefixoTenant } from '@/lib/storage/objeto';
import {
  PERMISSAO_ESCRITA_POR_RECURSO,
  type RecursoDocumento,
} from '@/lib/storage/documento-config';

export const runtime = 'nodejs';

interface DocMeta {
  id: string;
  nome: string;
  storageKey: string | null;
  url: string;
}

type Buscador = (id: string, tenantId: string) => Promise<DocMeta | null>;

// `colaborador` ainda não tem tabela de documentos → sem buscador (Partial).
const BUSCADORES: Partial<Record<RecursoDocumento, Buscador>> = {
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

interface DocEncontrado {
  doc: DocMeta;
  recurso: RecursoDocumento;
}

async function encontrar(
  id: string,
  recursoPedido: string | null,
  tenantId: string,
): Promise<DocEncontrado | null> {
  if (recursoPedido && recursoPedido in BUSCADORES) {
    const recurso = recursoPedido as RecursoDocumento;
    const doc = await BUSCADORES[recurso]!(id, tenantId);
    return doc ? { doc, recurso } : null;
  }
  for (const [recurso, buscar] of Object.entries(BUSCADORES) as [RecursoDocumento, Buscador][]) {
    const doc = await buscar(id, tenantId);
    if (doc) return { doc, recurso };
  }
  return null;
}

export const GET = withApi(async (req: NextRequest, ctx) => {
  const id = String(ctx.params.id ?? '');
  if (!id) throw new NotFoundError('Documento não encontrado');

  const recursoPedido = new URL(req.url).searchParams.get('recurso');
  const encontrado = await encontrar(id, recursoPedido, ctx.tenantId);
  if (!encontrado) throw new NotFoundError('Documento não encontrado');
  const { doc, recurso } = encontrado;

  // M1: aceder ao ficheiro exige a permissão do recurso (não basta o tenant).
  const permissao = PERMISSAO_ESCRITA_POR_RECURSO[recurso];
  if (!ctx.permissions.has(permissao)) throw new ForbiddenError();

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

  // B1: a key TEM de viver sob o prefixo do tenant do contexto. Bloqueia keys
  // (via url/anexo do registo) a apontar para objetos de outro tenant no bucket.
  if (!key.startsWith(prefixoTenant(ctx.tenantId))) {
    log.warn({ documentoId: id }, 'download bloqueado: key fora do prefixo do tenant');
    throw new NotFoundError('Documento não encontrado');
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
