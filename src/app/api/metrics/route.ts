/**
 * GET /api/metrics — Métricas RED (Rate, Errors, Duration).
 *
 * Endpoint protegido por `Authorization: Bearer <METRICS_SECRET>`.
 * Retorna JSON com contadores em memória (reset ao reiniciar o processo).
 *
 * Em produção, substituir por prom-client (pacote adicionado ao package.json)
 * para formato Prometheus scraping compatível:
 *
 *   import { register } from 'prom-client';
 *   return new Response(await register.metrics(), {
 *     headers: { 'Content-Type': register.contentType },
 *   });
 *
 * Métricas recolhidas (RED):
 *   - `requests_total`        — total de pedidos processados (via withApi)
 *   - `errors_total`          — total de pedidos com erro
 *   - `duration_sum_ms`       — soma das durações em ms (para calcular latência média)
 *   - `uptime_seconds`        — tempo de vida do processo
 *
 * Nota: contadores em memória são por processo/instância. Para métricas
 * agregadas em produção usar prom-client com pushgateway ou OTel metrics.
 */
import { NextResponse, type NextRequest } from 'next/server';

/** Contadores RED em memória. Exportado para envelopes actualizarem. */
export const metrics = {
  requestsTotal: 0,
  errorsTotal: 0,
  durationSumMs: 0,
  startedAt: Date.now(),
};

/** Registar um pedido concluído (chamado pelos envelopes withApi/createSafeAction). */
export function recordRequest(durationMs: number, isError: boolean): void {
  metrics.requestsTotal += 1;
  metrics.durationSumMs += durationMs;
  if (isError) metrics.errorsTotal += 1;
}

export async function GET(req: NextRequest): Promise<Response> {
  // Protecção por bearer token (configurável por env)
  const secret = process.env.METRICS_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
  const avgDurationMs =
    metrics.requestsTotal > 0
      ? Math.round(metrics.durationSumMs / metrics.requestsTotal)
      : 0;

  return NextResponse.json({
    requests_total: metrics.requestsTotal,
    errors_total: metrics.errorsTotal,
    duration_avg_ms: avgDurationMs,
    uptime_seconds: uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
}
