import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { buildCorsHeaders, corsPreflightResponse } from '@/lib/api/cors';
import { catalogoPublico } from '@/lib/planos';

/**
 * GET /api/publico/planos — catálogo de planos (público, sem sessão).
 *
 * FONTE ÚNICA de preços e limites para o site de marketing (spec 18): o site
 * renderiza o que este endpoint devolver e nunca hardcoda valores
 * (`docs/handoff/site-provisionamento.md` §1).
 *
 * Sem dados de tenant, sem PII, sem segredos — só o catálogo estático. Por isso
 * é cacheável na borda; um preço desactualizado durante 5 minutos é aceitável e
 * evita que uma vaga de tráfego do site chegue ao servidor da aplicação.
 */
export const GET = withApi(
  async (req: NextRequest) => {
    const cors = buildCorsHeaders(req, { methods: 'GET, OPTIONS', credentials: false });
    return NextResponse.json(
      { data: catalogoPublico() },
      {
        headers: {
          ...(cors as Record<string, string>),
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  },
  { public: true },
);

export function OPTIONS(req: NextRequest): Response {
  return corsPreflightResponse(req);
}
