/**
 * GET /api/export/[modulo]?formato=csv|xlsx[&...filtros] — exportação genérica.
 *
 * Route Handler via `withApi` — NUNCA Server Action. Resolve o dataset pelo
 * registry (`export.service`), que lê APENAS por serviços de domínio dentro de
 * `runWithTenantContext`. Cada `[modulo]` tem a sua permissão (verificada aqui,
 * pois é dinâmica). Content-type e Content-Disposition correctos por formato.
 */
import type { NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { resolverExport } from '@/server/services/plataforma/export.service';
import { exportResponse, isFormatoExport } from '@/lib/reporting';

export const runtime = 'nodejs';

export const GET = withApi(async (req: NextRequest, ctx) => {
  const modulo = String(ctx.params.modulo ?? '');
  const entry = resolverExport(modulo);
  if (!entry) throw new NotFoundError(`Módulo de exportação "${modulo}" não encontrado`);

  // Permissão dinâmica por módulo (withApi só suporta permissão estática).
  if (!ctx.permissions.has(entry.permission)) throw new ForbiddenError();

  const url = new URL(req.url);
  const formato = url.searchParams.get('formato') ?? 'csv';
  if (!isFormatoExport(formato)) {
    throw new ValidationError('Formato inválido — use csv ou xlsx');
  }

  const dataset = await entry.build(url.searchParams, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  });
  return exportResponse(dataset, formato);
});
