/**
 * GET /api/metrics — Métricas RED (Rate, Errors, Duration).
 *
 * Protegido por `Authorization: Bearer <METRICS_SECRET>` (verificação
 * feita dentro do handler, após o envelope withApi adicionar x-request-id
 * e logging). Público controlado — sem autenticação de sessão (como health/ready).
 *
 * Contadores mantidos em `src/server/observability/metrics.ts` e
 * actualizados pelos envelopes `withApi` e `createSafeAction` a cada pedido.
 *
 * Métricas recolhidas (RED):
 *   requests_total     — total de pedidos processados
 *   errors_total       — total de pedidos com erro (status >= 500 / AppError 5xx)
 *   duration_avg_ms    — latência média em ms
 *   uptime_seconds     — tempo de vida do processo
 *
 * Evolução futura: quando `prom-client` (já em package.json) for instalado,
 * substituir este handler por:
 *   import { register } from 'prom-client';
 *   return new Response(await register.metrics(), {
 *     headers: { 'Content-Type': register.contentType },
 *   });
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { getMetrics } from '@/server/observability/metrics';

export const GET = withApi(
  async (req: NextRequest) => {
    // Protecção adicional por bearer token (configurável por env).
    // Complementa a opção public: true — sem METRICS_SECRET o endpoint
    // fica aberto (adequado em dev; produção deve definir a variável).
    const secret = process.env.METRICS_SECRET;
    if (secret) {
      const auth = req.headers.get('authorization') ?? '';
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const m = getMetrics();
    const uptimeSeconds = Math.floor((Date.now() - m.startedAt) / 1000);
    const avgDurationMs =
      m.requestsTotal > 0 ? Math.round(m.durationSumMs / m.requestsTotal) : 0;

    return NextResponse.json({
      requests_total: m.requestsTotal,
      errors_total: m.errorsTotal,
      duration_avg_ms: avgDurationMs,
      uptime_seconds: uptimeSeconds,
      timestamp: new Date().toISOString(),
    });
  },
  { public: true },
);
