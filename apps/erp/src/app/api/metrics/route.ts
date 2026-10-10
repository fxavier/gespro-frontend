/**
 * GET /api/metrics — Métricas em formato Prometheus text (prom-client).
 *
 * Protegido por `Authorization: Bearer <METRICS_SECRET>`. Sem METRICS_SECRET
 * (ausente ou vazio) o endpoint RECUSA em qualquer ambiente — fail-closed
 * (issue #191); o docker-compose define um valor de dev. Em produção o acesso
 * deve, além disso, ser restrito por rede. Uma falha a gerar as métricas cai
 * no envelope do withApi: o cliente recebe um 500 genérico e o detalhe vai
 * para o logger com o `requestId` (issue #190).
 *
 * O Prometheus do otel-lgtm raspa este endpoint (configuração em
 * infra/local/observabilidade/prometheus.yaml, job 'gespro-erp').
 *
 * Métricas expostas (definidas em prom-registry.ts):
 *   http_requests_total{method, route, status_code, tenant_id}
 *   http_request_duration_ms{method, route, tenant_id}          — histograma
 *   keycloak_available                                            — gauge 0/1
 *   keycloak_health_probe_duration_ms                            — histograma
 *   keycloak_failures_total{reason}
 *   valkey_available                                              — gauge 0/1
 *   valkey_operation_duration_ms{operation}                      — histograma
 *   valkey_circuit_breaker_open_total
 *   negocio_vendas_total{tenant_id}
 *   negocio_faturas_emitidas_total{tenant_id}
 *   negocio_stripe_webhook_falhas_total{event_type, tenant_id}
 *   negocio_tarefas_agendadas_em_falta{tarefa, tenant_id}       — gauge 0/1
 *   + métricas de processo (CPU, memória, event loop)
 *
 * Cardinalidade: tenant_id é a única etiqueta de alta cardinalidade.
 * userId e requestId NUNCA aparecem aqui — estão nos logs e nos traces.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { registry } from '@/server/observability/prom-registry';
import { timingSafeEqual, createHash } from 'node:crypto';

export const GET = withApi(
  async (req: NextRequest) => {
    // Bearer token obrigatório (fail-closed, #191).
    // Comparação timing-safe para evitar timing oracle attacks (NIT fix).
    const secret = process.env.METRICS_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: { code: 'METRICAS_DESACTIVADAS', message: 'Métricas desactivadas' } },
        { status: 503 },
      );
    }

    const auth = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${secret}`;

    // timingSafeEqual exige buffers do mesmo tamanho — usa hash para normalizar
    const authHash = createHash('sha256').update(auth).digest();
    const expectedHash = createHash('sha256').update(expected).digest();

    if (!timingSafeEqual(authHash, expectedHash)) {
      return NextResponse.json(
        { error: { code: 'NAO_AUTENTICADO', message: 'Não autenticado' } },
        { status: 401 },
      );
    }

    const metricsText = await registry.metrics();
    return new Response(metricsText, {
      status: 200,
      headers: {
        'Content-Type': registry.contentType,
        'Cache-Control': 'no-store',
      },
    });
  },
  { public: true },
);
