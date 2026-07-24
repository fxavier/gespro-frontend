/**
 * POST /api/documentos/presign — assina um upload direto cliente→S3.
 *
 * Route Handler via `withApi` (sessão → contexto de tenant). A permissão é
 * DINÂMICA por recurso, por isso é verificada dentro do handler (o `withApi`
 * só suporta permissão estática — mesmo padrão que `/api/export/[modulo]`).
 *
 * Segurança (spec 01 §RNF1, §7.2):
 *   - Allowlist de content-type + limite de tamanho (10 MB) validados AQUI.
 *   - A key é derivada SERVER-SIDE de `tenantId` (do contexto) — NUNCA aceita
 *     key/prefixo do cliente → sem path traversal nem tenant leak.
 *   - Não pertence a PUBLIC_PATHS: exige sessão.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { getObjectStorage, derivarKey, keyParaUrlRef } from '@/lib/storage/objeto';
import {
  CONTENT_TYPES_PERMITIDOS,
  MAX_DOCUMENTO_BYTES,
  RECURSOS_DOCUMENTO,
  PERMISSAO_ESCRITA_POR_RECURSO,
} from '@/lib/storage/documento-config';

export const runtime = 'nodejs';

const PresignSchema = z.object({
  recurso: z.enum(RECURSOS_DOCUMENTO),
  recursoId: z.string().cuid(),
  nome: z.string().min(1).max(200),
  contentType: z.enum(CONTENT_TYPES_PERMITIDOS),
  tamanho: z.number().int().positive().max(MAX_DOCUMENTO_BYTES),
});

export const POST = withApi(async (req: NextRequest, ctx) => {
  const corpo = await req.json().catch(() => null);
  const parsed = PresignSchema.safeParse(corpo);
  if (!parsed.success) {
    throw new ValidationError('Pedido de upload inválido', parsed.error.flatten());
  }
  const { recurso, recursoId, nome, contentType, tamanho } = parsed.data;

  // Permissão dinâmica por recurso.
  const permissao = PERMISSAO_ESCRITA_POR_RECURSO[recurso];
  if (!ctx.permissions.has(permissao)) throw new ForbiddenError();

  // Key derivada server-side a partir do tenant do contexto — nunca do cliente.
  const key = derivarKey({ tenantId: ctx.tenantId, recurso, recursoId, nome });

  const storage = getObjectStorage();
  const { url, headers } = await storage.presignPut(key, {
    contentType,
    maxBytes: MAX_DOCUMENTO_BYTES,
  });

  logger.child({ tenantId: ctx.tenantId, userId: ctx.userId }).info(
    { recurso, recursoId, tamanho, contentType },
    'presign emitido',
  );

  return NextResponse.json({
    uploadUrl: url,
    key,
    requiredHeaders: headers,
    /** Ref a guardar no campo `url` da action de registo (compat). */
    urlRef: keyParaUrlRef(key),
  });
});
