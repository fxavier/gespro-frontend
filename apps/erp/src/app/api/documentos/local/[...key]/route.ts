/**
 * PUT/GET /api/documentos/local/{key} — backend do adaptador `local`.
 *
 * Faz o papel do S3 em dev/CI (sem rede): recebe o PUT do upload direto e
 * serve o GET do download. ATIVO APENAS com `STORAGE_DRIVER=local`; em `s3`
 * responde 404 (o tráfego vai direto ao bucket). Requer sessão (via `withApi`)
 * — em produção o equivalente é a presigned URL do S3.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { driverAtual, prefixoTenant, recursoDaKey } from '@/lib/storage/objeto';
import { guardarObjetoLocal, lerObjetoLocal } from '@/lib/storage/objeto/local';
import { MAX_DOCUMENTO_BYTES, permissaoUploadDirecto } from '@/lib/storage/documento-config';

export const runtime = 'nodejs';

/**
 * Extrai a key e — âmbito DEV-ONLY, mas defensivo — garante que pertence ao
 * prefixo do tenant do contexto (sem isto, qualquer autenticado poderia
 * PUT/GET a key de outro tenant enquanto `STORAGE_DRIVER=local`).
 */
function keyDeParams(params: Record<string, string | string[]>, tenantId: string): string {
  const raw = params.key;
  const key = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
  if (!key || key.includes('..')) throw new NotFoundError();
  if (!key.startsWith(prefixoTenant(tenantId))) throw new NotFoundError();
  return key;
}

function garantirLocal() {
  if (driverAtual() !== 'local') throw new NotFoundError();
}

const EXCEDE_TAMANHO = 'Ficheiro excede o tamanho máximo';

/**
 * Lê o corpo com tecto de `MAX_DOCUMENTO_BYTES` (#195): recusa pelo `Content-Length` antes de
 * ler, e conta os bytes efectivamente recebidos (um `Content-Length` mentiroso ou ausente não
 * passa) — nunca acumula mais do que o máximo em memória.
 */
async function lerCorpoLimitado(req: NextRequest): Promise<Uint8Array> {
  const declarado = Number(req.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > MAX_DOCUMENTO_BYTES) {
    throw new ValidationError(EXCEDE_TAMANHO);
  }
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOCUMENTO_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ValidationError(EXCEDE_TAMANHO);
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  return bytes;
}

export const PUT = withApi(async (req: NextRequest, ctx) => {
  garantirLocal();
  const key = keyDeParams(ctx.params, ctx.tenantId);
  // #194: a mesma permissão de recurso que o presign exige — o recurso vem da própria key.
  // Recurso desconhecido, só-servidor ou key sem recurso → o cliente nunca escreve aqui.
  const recurso = recursoDaKey(key, ctx.tenantId);
  const permissao = recurso ? permissaoUploadDirecto(recurso) : null;
  if (!permissao) throw new NotFoundError();
  if (!ctx.permissions.has(permissao)) throw new ForbiddenError();
  const bytes = await lerCorpoLimitado(req);
  const contentType = req.headers.get('content-type') ?? 'application/octet-stream';
  await guardarObjetoLocal(key, bytes, contentType);
  return new NextResponse(null, { status: 200 });
});

export const GET = withApi(async (_req: NextRequest, ctx) => {
  garantirLocal();
  const key = keyDeParams(ctx.params, ctx.tenantId);
  const objeto = await lerObjetoLocal(key);
  if (!objeto) throw new NotFoundError('Objeto não encontrado');
  return new NextResponse(objeto.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': objeto.contentType,
      'Cache-Control': 'no-store',
    },
  });
});
