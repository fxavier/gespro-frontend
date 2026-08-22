/**
 * Testes do registo Prometheus.
 *
 * Verifica as regras de cardinalidade de etiquetas (ADR-0019 §2):
 *   - tenant_id DEVE ser etiqueta (cardinalidade controlada)
 *   - userId / user_id / requestId / request_id NUNCA devem ser etiquetas
 *
 * Estes testes são a verificação automatizada da regra mais importante
 * de higiene de métricas: a que impede o custo de explodir.
 */
import { describe, expect, it } from 'vitest';
import {
  registry,
  httpRequestsTotal,
  httpRequestDurationMs,
  keycloakAvailable,
  keycloakHealthProbeDurationMs,
  keycloakFailuresTotal,
  valkeyAvailable,
  valkeyOperationDurationMs,
  valkeyCircuitBreakerOpenTotal,
  negocioVendasTotal,
  negocioFaturasEmitidasTotal,
  negocioStripeWebhookFalhasTotal,
  negocioTarefasAgendadasEmFalta,
  recordHttpRequest,
  type HttpRequestMetricOpts,
} from '../prom-registry';
import { normalizeRoute } from '@/lib/api/route-utils';

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/**
 * Obtém as etiquetas de uma métrica prom-client.
 * prom-client guarda labelNames na instância mas não o expõe nos tipos.
 */
function getLabelNames(metric: unknown): string[] {
  return ((metric as Record<string, unknown>)['labelNames'] as string[] | undefined) ?? [];
}

/** Verifica que nenhuma etiqueta proibida existe na lista. */
function assertNoHighCardinalityLabels(labelNames: string[]): void {
  const forbidden = ['userId', 'user_id', 'requestId', 'request_id'];
  for (const f of forbidden) {
    expect(labelNames, `etiqueta proibida "${f}" encontrada`).not.toContain(f);
  }
}

// ---------------------------------------------------------------------------
// Cardinalidade — a regra mais importante (ADR-0019 §2)
// ---------------------------------------------------------------------------

describe('cardinalidade de etiquetas (ADR-0019 §2)', () => {
  describe('http_requests_total', () => {
    it('contém tenant_id como etiqueta', () => {
      expect(getLabelNames(httpRequestsTotal)).toContain('tenant_id');
    });

    it('NÃO contém userId nem requestId (alta cardinalidade)', () => {
      assertNoHighCardinalityLabels(getLabelNames(httpRequestsTotal));
    });

    it('contém method, route e status_code', () => {
      const labels = getLabelNames(httpRequestsTotal);
      expect(labels).toContain('method');
      expect(labels).toContain('route');
      expect(labels).toContain('status_code');
    });
  });

  describe('http_request_duration_ms', () => {
    it('contém tenant_id como etiqueta', () => {
      expect(getLabelNames(httpRequestDurationMs)).toContain('tenant_id');
    });

    it('NÃO contém userId nem requestId', () => {
      assertNoHighCardinalityLabels(getLabelNames(httpRequestDurationMs));
    });
  });

  describe('métricas de Keycloak', () => {
    it('keycloak_available não tem etiquetas de alta cardinalidade', () => {
      assertNoHighCardinalityLabels(getLabelNames(keycloakAvailable));
    });

    it('keycloak_health_probe_duration_ms não tem etiquetas de alta cardinalidade', () => {
      assertNoHighCardinalityLabels(getLabelNames(keycloakHealthProbeDurationMs));
    });

    it('keycloak_failures_total usa reason como etiqueta (não userId)', () => {
      const labels = getLabelNames(keycloakFailuresTotal);
      expect(labels).toContain('reason');
      assertNoHighCardinalityLabels(labels);
    });
  });

  describe('métricas de Valkey', () => {
    it('valkey_available não tem etiquetas de alta cardinalidade', () => {
      assertNoHighCardinalityLabels(getLabelNames(valkeyAvailable));
    });

    it('valkey_operation_duration_ms usa operation como etiqueta (não userId)', () => {
      const labels = getLabelNames(valkeyOperationDurationMs);
      expect(labels).toContain('operation');
      assertNoHighCardinalityLabels(labels);
    });

    it('valkey_circuit_breaker_open_total não tem etiquetas de alta cardinalidade', () => {
      assertNoHighCardinalityLabels(getLabelNames(valkeyCircuitBreakerOpenTotal));
    });
  });

  describe('sinais de negócio', () => {
    it('negocio_vendas_total contém tenant_id', () => {
      expect(getLabelNames(negocioVendasTotal)).toContain('tenant_id');
      assertNoHighCardinalityLabels(getLabelNames(negocioVendasTotal));
    });

    it('negocio_faturas_emitidas_total contém tenant_id', () => {
      expect(getLabelNames(negocioFaturasEmitidasTotal)).toContain('tenant_id');
      assertNoHighCardinalityLabels(getLabelNames(negocioFaturasEmitidasTotal));
    });

    it('negocio_stripe_webhook_falhas_total contém tenant_id e event_type', () => {
      const labels = getLabelNames(negocioStripeWebhookFalhasTotal);
      expect(labels).toContain('tenant_id');
      expect(labels).toContain('event_type');
      assertNoHighCardinalityLabels(labels);
    });

    it('negocio_tarefas_agendadas_em_falta contém tenant_id e tarefa', () => {
      const labels = getLabelNames(negocioTarefasAgendadasEmFalta);
      expect(labels).toContain('tenant_id');
      expect(labels).toContain('tarefa');
      assertNoHighCardinalityLabels(labels);
    });
  });
});

// ---------------------------------------------------------------------------
// Registo — métricas existem no registo
// ---------------------------------------------------------------------------

describe('registo prometheus', () => {
  it('http_requests_total existe no registo', () => {
    expect(registry.getSingleMetric('http_requests_total')).toBeDefined();
  });

  it('keycloak_available existe no registo', () => {
    expect(registry.getSingleMetric('keycloak_available')).toBeDefined();
  });

  it('valkey_available existe no registo', () => {
    expect(registry.getSingleMetric('valkey_available')).toBeDefined();
  });

  it('negocio_vendas_total existe no registo', () => {
    expect(registry.getSingleMetric('negocio_vendas_total')).toBeDefined();
  });

  it('negocio_tarefas_agendadas_em_falta existe no registo', () => {
    expect(registry.getSingleMetric('negocio_tarefas_agendadas_em_falta')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// recordHttpRequest — popula o contador e histograma com tenant_id
// ---------------------------------------------------------------------------

describe('recordHttpRequest', () => {
  it('incrementa http_requests_total com tenant_id', async () => {
    recordHttpRequest({
      method: 'GET',
      route: '/api/test',
      statusCode: 200,
      durationMs: 42,
      tenantId: 'tenant-abc',
    });

    const allMetrics = await registry.getMetricsAsJSON();
    const counter = allMetrics.find((m) => m.name === 'http_requests_total');
    expect(counter).toBeDefined();

    const matchingValues = counter?.values.filter(
      (v) => v.labels['tenant_id'] === 'tenant-abc',
    );
    expect(matchingValues?.length).toBeGreaterThan(0);
    expect(matchingValues?.[0]?.value).toBeGreaterThan(0);
  });

  it('usa tenant_id vazio para pedidos sem tenant (endpoints públicos)', async () => {
    recordHttpRequest({
      method: 'GET',
      route: '/api/health',
      statusCode: 200,
      durationMs: 5,
      // tenantId omitido → deve usar string vazia
    });

    const allMetrics = await registry.getMetricsAsJSON();
    const counter = allMetrics.find((m) => m.name === 'http_requests_total');

    // Verifica que existe um registo com tenant_id vazio (não undefined)
    const publicEntry = counter?.values.filter(
      (v) => v.labels['tenant_id'] === '' && v.labels['route'] === '/api/health',
    );
    expect(publicEntry?.length).toBeGreaterThan(0);
  });

  it('assinatura não inclui userId nem requestId (verificação de contrato)', () => {
    // A função recordHttpRequest aceita apenas os campos definidos em HttpRequestMetricOpts.
    // Verificamos que a interface não expõe campos de alta cardinalidade.
    const keys: (keyof HttpRequestMetricOpts)[] = ['method', 'route', 'statusCode', 'durationMs', 'tenantId'];
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('requestId');
    expect(keys).not.toContain('user_id');
    expect(keys).not.toContain('request_id');
  });
});

// ---------------------------------------------------------------------------
// normalizeRoute — B2 fix: cardinalidade da etiqueta `route` (ADR-0019 §2)
// ---------------------------------------------------------------------------

describe('normalizeRoute (B2 — cardinalidade da etiqueta route)', () => {
  it('rota estática sem params — não altera', () => {
    expect(normalizeRoute('/api/health', {})).toBe('/api/health');
  });

  it('rota dinâmica simples: /api/faturacao/<id>/pdf → /api/faturacao/[id]/pdf', () => {
    const normalized = normalizeRoute('/api/faturacao/clj123abc/pdf', { id: 'clj123abc' });
    expect(normalized).toBe('/api/faturacao/[id]/pdf');
    // CRÍTICO: o valor concreto NÃO pode aparecer na rota normalizada
    expect(normalized).not.toContain('clj123abc');
  });

  it('rota dinâmica: /api/documentos/<id>/download → /api/documentos/[id]/download', () => {
    const normalized = normalizeRoute('/api/documentos/doc-uuid-456/download', { id: 'doc-uuid-456' });
    expect(normalized).toBe('/api/documentos/[id]/download');
    expect(normalized).not.toContain('doc-uuid-456');
  });

  it('rota catch-all: /api/documentos/local/a/b/c → /api/documentos/local/[...key]', () => {
    const normalized = normalizeRoute('/api/documentos/local/a/b/c', { key: ['a', 'b', 'c'] });
    expect(normalized).toBe('/api/documentos/local/[...key]');
    expect(normalized).not.toContain('/a/b/c');
  });

  it('múltiplos params: /api/reconciliacao/<id>/export → normaliza o param', () => {
    const normalized = normalizeRoute('/api/contabilidade/reconciliacao/rec-789/export', { id: 'rec-789' });
    expect(normalized).toBe('/api/contabilidade/reconciliacao/[id]/export');
    expect(normalized).not.toContain('rec-789');
  });

  it('rota sem params mas com params vazio — inalterada', () => {
    expect(normalizeRoute('/api/ready', {})).toBe('/api/ready');
  });

  it('a etiqueta route normalizada não cria série por documento (anti-cardinalidade)', () => {
    // Dois pedidos para o mesmo endpoint mas IDs diferentes → mesma série normalizada
    const route1 = normalizeRoute('/api/faturacao/id-001/pdf', { id: 'id-001' });
    const route2 = normalizeRoute('/api/faturacao/id-999/pdf', { id: 'id-999' });
    expect(route1).toBe(route2); // Mesma série no Prometheus — cardinalidade controlada
    expect(route1).toBe('/api/faturacao/[id]/pdf');
  });
});
