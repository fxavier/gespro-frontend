import 'server-only';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * Registo Prometheus do GestPro ERP.
 *
 * REGRA DE CARDINALIDADE (ADR-0019 §2):
 *   PERMITIDO como etiqueta: tenant_id (cardinalidade limitada ao número de tenants)
 *   PROIBIDO como etiqueta: user_id, request_id, userId, requestId
 *   → userId e requestId têm alta cardinalidade e vão no log e no trace, NUNCA na métrica.
 *   Violar esta regra faz explodir o custo e degrada o Prometheus.
 *
 * Destino (ADR-0026 §1):
 *   O endpoint /api/metrics expõe as métricas em formato Prometheus text.
 *   O Prometheus do otel-lgtm raspa esse endpoint via scrape job 'gespro-erp'.
 *   As séries ficam com etiqueta job="gespro-erp" (scrape) e service="gespro" (default label).
 *   Mudar de destino de traces/logs é mudar OTEL_EXPORTER_OTLP_ENDPOINT — não código.
 */

export const registry = new Registry();

// Etiqueta de serviço em todas as métricas deste registo
registry.setDefaultLabels({ service: 'gespro' });

// Métricas de processo (CPU, memória, event loop lag, handles abertos)
collectDefaultMetrics({ register: registry });

// ---------------------------------------------------------------------------
// RED — Rate / Errors / Duration (pedidos HTTP)
// ---------------------------------------------------------------------------

/**
 * Total de pedidos HTTP processados.
 * tenant_id: identificador do tenant — etiqueta de cardinalidade controlada.
 * NUNCA adicionar user_id nem request_id aqui.
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total de pedidos HTTP processados pelo ERP',
  labelNames: ['method', 'route', 'status_code', 'tenant_id'] as const,
  registers: [registry],
});

/**
 * Duração dos pedidos HTTP em milissegundos (histograma).
 * Permite calcular p50, p95, p99 por rota e tenant.
 */
export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'Duração dos pedidos HTTP em milissegundos',
  labelNames: ['method', 'route', 'tenant_id'] as const,
  buckets: [10, 50, 100, 200, 500, 800, 1200, 2000, 5000],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Saúde do Keycloak (ADR-0019 §2 · ADR-0010)
// ---------------------------------------------------------------------------

/** 1 se o Keycloak responde ao probe de saúde, 0 se não. */
export const keycloakAvailable = new Gauge({
  name: 'keycloak_available',
  help: '1 se o Keycloak está acessível (probe de 30 em 30 segundos), 0 se não está',
  registers: [registry],
});

/**
 * Latência do probe de saúde do Keycloak em ms.
 * Mede o tempo de resposta do endpoint /health/live do Keycloak.
 * Nota: isto é a latência do probe de saúde, não do endpoint de token.
 * (renomeado de keycloak_token_duration_ms — era nome enganador)
 */
export const keycloakHealthProbeDurationMs = new Histogram({
  name: 'keycloak_health_probe_duration_ms',
  help: 'Latência do probe de saúde do Keycloak em milissegundos (endpoint /health/live)',
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
  registers: [registry],
});

/** Falhas de autenticação registadas no Keycloak. */
export const keycloakFailuresTotal = new Counter({
  name: 'keycloak_failures_total',
  help: 'Total de falhas reportadas pelo Keycloak (erros de token, realm indisponível, etc.)',
  labelNames: ['reason'] as const,
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Saúde do Valkey (ADR-0019 §2 · ADR-0014)
// Prefixo valkey_ — não redis_ (tecnologia decidida no ADR-0014)
// ---------------------------------------------------------------------------

/** 1 se o Valkey responde ao PING, 0 se não. */
export const valkeyAvailable = new Gauge({
  name: 'valkey_available',
  help: '1 se o Valkey está acessível (probe PING de 30 em 30 segundos), 0 se não está',
  registers: [registry],
});

/** Latência das operações Valkey em ms. */
export const valkeyOperationDurationMs = new Histogram({
  name: 'valkey_operation_duration_ms',
  help: 'Latência de operações Valkey em milissegundos',
  labelNames: ['operation'] as const,
  buckets: [1, 2, 5, 10, 20, 50, 100, 500],
  registers: [registry],
});

/**
 * Número de vezes que o limitador de tráfego falhou aberto (fail-open).
 * Quando o Valkey não está disponível, o limitador permite o tráfego em vez
 * de bloquear tudo — é o comportamento seguro, mas deve ser monitorado.
 */
export const valkeyCircuitBreakerOpenTotal = new Counter({
  name: 'valkey_circuit_breaker_open_total',
  help: 'Número de vezes que o limitador de tráfego entrou em modo fail-open (Valkey indisponível)',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Sinais de negócio (ADR-0019 §2)
// tenant_id obrigatório — é o que permite responder «só para este tenant?»
// ---------------------------------------------------------------------------

/** Total de vendas confirmadas por tenant. */
export const negocioVendasTotal = new Counter({
  name: 'negocio_vendas_total',
  help: 'Total de vendas processadas por tenant',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

/** Total de facturas emitidas por tenant. */
export const negocioFaturasEmitidasTotal = new Counter({
  name: 'negocio_faturas_emitidas_total',
  help: 'Total de facturas emitidas por tenant',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

/** Total de webhooks Stripe que falharam o processamento. */
export const negocioStripeWebhookFalhasTotal = new Counter({
  name: 'negocio_stripe_webhook_falhas_total',
  help: 'Total de webhooks Stripe que falharam o processamento',
  labelNames: ['event_type', 'tenant_id'] as const,
  registers: [registry],
});

/**
 * Gauge que sinaliza tarefas agendadas em falta.
 * 1 = a tarefa não correu na janela esperada; 0 = ok.
 * Definir a zero quando a tarefa corre com sucesso.
 */
export const negocioTarefasAgendadasEmFalta = new Gauge({
  name: 'negocio_tarefas_agendadas_em_falta',
  help: '1 se a tarefa agendada não correu na janela esperada, 0 se correu',
  labelNames: ['tarefa', 'tenant_id'] as const,
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Função de registo HTTP (chamada por withApi e createSafeAction)
// ---------------------------------------------------------------------------

export interface HttpRequestMetricOpts {
  method: string;
  /** Rota normalizada, ex.: /api/faturacao/[id] — sem valores concretos de params */
  route: string;
  statusCode: number;
  durationMs: number;
  /** tenantId do pedido; string vazia para endpoints públicos sem tenant */
  tenantId?: string;
}

/**
 * Regista um pedido HTTP concluído no registo Prometheus.
 * Chamado pelo envelope withApi.
 * NOTA: createSafeAction NÃO chama recordHttpRequest — integração futura (dívida fase 2/3).
 *
 * NÃO aceita userId nem requestId — vão no log e no trace.
 */
export function recordHttpRequest(opts: HttpRequestMetricOpts): void {
  const tenantId = opts.tenantId ?? '';
  httpRequestsTotal.inc({
    method: opts.method,
    route: opts.route,
    status_code: String(opts.statusCode),
    tenant_id: tenantId,
  });
  httpRequestDurationMs.observe(
    { method: opts.method, route: opts.route, tenant_id: tenantId },
    opts.durationMs,
  );
}

// ---------------------------------------------------------------------------
// Auto-arranque das sondas (fallback para quando instrumentation.ts não é
// compilado pelo Turbopack para .next/server/instrumentation.js)
//
// Porquê aqui e não apenas em instrumentation.ts?
// O Turbopack (Next.js 16) não compila instrumentation.ts para
// .next/server/instrumentation.js na build standalone — a função register()
// nunca é chamada. Como prom-registry.ts É compilado (está em todos os chunks
// de Route Handlers que usam recordHttpRequest), esta é a localização mais
// fiável para garantir que as sondas arrancam.
//
// Dependência circular intencional e segura:
//   probes.ts → importa gauges de prom-registry.ts
//   prom-registry.ts → importa startProbes de probes.ts (aqui, em baixo)
// O import() dinâmico garante que todos os exports de prom-registry.ts estão
// definidos ANTES de probes.ts tentar aceder a eles (ESM live bindings).
//
// O _resetProbesState() em probes.ts permite reiniciar nas suites de testes.
// ---------------------------------------------------------------------------
if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
  void import('./probes').then(({ startProbes }) => startProbes()).catch(() => {
    // Sondas não críticas — falha silenciosa para não bloquear métricas RED
  });
}
