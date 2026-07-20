/**
 * GET /api/faturacao/[id]/pdf — Factura fiscal (MZ) em PDF.
 *
 * Route Handler via `withApi` (sessão → permissão → contexto de tenant) — NUNCA
 * Server Action. Reflecte o documento EMITIDO (append-only): lê pelos serviços
 * de domínio e renderiza com `@react-pdf/renderer` (runtime Node). Ver
 * skill `fiscalidade-mz` e ADR-0005.
 *
 * `runtime = 'nodejs'` garante que o motor de PDF não corre em Edge.
 */
import { withApi } from '@/lib/api/with-api';
import { NotFoundError } from '@/lib/errors';
import { obterModeloFatura } from '@/server/services/plataforma/documentos.service';
import { renderFaturaPdf } from '@/lib/documents/pdf/fatura-pdf';
import { safeFilename } from '@/lib/reporting';

export const runtime = 'nodejs';

export const GET = withApi(
  async (_req, ctx) => {
    const id = String(ctx.params.id ?? '');
    if (!id) throw new NotFoundError('Factura não encontrada');

    const modelo = await obterModeloFatura(id, ctx);
    const pdf = await renderFaturaPdf(modelo);
    const nome = safeFilename(`${modelo.designacao}-${modelo.numero}`);

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nome}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { permission: 'faturacao:ver' },
);
