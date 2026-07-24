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
import { NotFoundError, ValidationError } from '@/lib/errors';
import { driverAtual, prefixoTenant } from '@/lib/storage/objeto';
import { guardarObjetoLocal, lerObjetoLocal } from '@/lib/storage/objeto/local';
import { MAX_DOCUMENTO_BYTES } from '@/lib/storage/documento-config';

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

export const PUT = withApi(async (req: NextRequest, ctx) => {
  garantirLocal();
  const key = keyDeParams(ctx.params, ctx.tenantId);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_DOCUMENTO_BYTES) {
    throw new ValidationError('Ficheiro excede o tamanho máximo');
  }
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
