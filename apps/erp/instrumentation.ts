/**
 * Next.js Instrumentation Hook (Node.js runtime).
 * Regista o OpenTelemetry NodeSDK no arranque do servidor e arranca as sondas.
 *
 * Chamado uma vez por processo pelo Next.js antes de qualquer handler.
 * Apenas corre no runtime Node.js (não no edge runtime).
 *
 * Configuração por variável de ambiente (ADR-0019 §1, ADR-0026 §3):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — endpoint OTLP HTTP (obrigatório para activar)
 *                                    Local: http://otel-lgtm:4318 (dentro do compose)
 *                                    Produção: mudar esta variável, não código
 *   OTEL_SERVICE_NAME             — nome do serviço (omissão: gespro-erp)
 *   OTEL_SAMPLE_RATE              — fracção de traces amostrados (0–1, omissão: 1)
 *
 * Sondas de saúde (Keycloak, Valkey): arrancam quando o runtime é Node.js,
 * independentemente de OTEL_EXPORTER_OTLP_ENDPOINT estar definido ou não.
 * /api/ready NÃO depende das sondas — são best-effort e não bloqueiam.
 *
 * Dependências OTel em package.json (serverExternalPackages em next.config.ts
 * garante que são incluídas no output standalone — B1 fix):
 *   @opentelemetry/sdk-node
 *   @opentelemetry/exporter-trace-otlp-http
 *   @opentelemetry/exporter-logs-otlp-http
 *   @opentelemetry/sdk-logs
 *   @opentelemetry/sdk-trace-base
 *   @opentelemetry/resources
 *   @opentelemetry/semantic-conventions
 *   @prisma/instrumentation
 */
export async function register() {
  // Só activar no runtime Node.js — o edge runtime não suporta o NodeSDK.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Arrancar sondas de saúde independentemente do OTLP estar ou não configurado.
  // Mesmo sem backend de telemetria, as métricas ficam disponíveis em /api/metrics.
  try {
    const { startProbes } = await import('./src/server/observability/probes');
    startProbes();
  } catch (e) {
    // Sondas não críticas — nunca bloqueiam o arranque
    console.error('[instrumentation] sondas de saúde não arrancaram:', (e as Error)?.message ?? e);
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // OTEL não configurado — modo silencioso (não bloqueia o arranque).
    // As métricas continuam disponíveis em /api/metrics via prom-client.
    return;
  }

  try {
    // Imports estáticos-por-string: visíveis ao @vercel/nft e incluídos no standalone.
    // serverExternalPackages em next.config.ts garante que não são bundled — ficam
    // em node_modules e são carregados em runtime pelo Node.js. (B1 fix)
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPLogExporter } = await import('@opentelemetry/exporter-logs-otlp-http');
    // SimpleLogRecordProcessor vive em @opentelemetry/sdk-logs, não em sdk-node (B1c fix)
    const { SimpleLogRecordProcessor } = await import('@opentelemetry/sdk-logs');
    const { Resource } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');
    // TraceIdRatioBasedSampler: sampler correcto para amostragem por ratio (M3 fix)
    const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-base');

    // Carregamento opcional: instrumentação Prisma (só se @prisma/instrumentation instalado)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prismaInstrumentation: any[] = [];
    try {
      const { PrismaInstrumentation } = await import('@prisma/instrumentation');
      prismaInstrumentation = [new PrismaInstrumentation()];
    } catch {
      // @prisma/instrumentation não instalado — continuar sem ela
    }

    const sampleRate = parseFloat(process.env.OTEL_SAMPLE_RATE ?? '1');
    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'gespro-erp';

    // Endpoints OTLP derivados do endpoint base (ADR-0026 §3 — uma variável):
    //   Traces:  <endpoint>/v1/traces
    //   Logs:    <endpoint>/v1/logs
    const traceUrl = `${endpoint}/v1/traces`;
    const logsUrl = `${endpoint}/v1/logs`;

    const sdk = new NodeSDK({
      resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
      traceExporter: new OTLPTraceExporter({ url: traceUrl }),
      // Exportador de logs via OTLP: cada linha de log estruturado vai para Loki via colector.
      // SimpleLogRecordProcessor é adequado para dev; em produção considerar Batch.
      logRecordProcessor: new SimpleLogRecordProcessor(new OTLPLogExporter({ url: logsUrl })),
      ...(prismaInstrumentation.length > 0 && { instrumentations: prismaInstrumentation }),
      // Amostragem configurável por TraceIdRatioBasedSampler (M3 fix:
      // decision:1 = RECORD_ONLY, não exportado; TraceIdRatioBasedSampler usa RECORD_AND_SAMPLED)
      ...(sampleRate < 1 && {
        sampler: new TraceIdRatioBasedSampler(sampleRate),
      }),
    });

    sdk.start();

    // Shutdown gracioso ao terminar o processo
    process.on('SIGTERM', () => {
      sdk.shutdown().catch((e) => console.error('[instrumentation] OTel shutdown error:', e));
    });

    console.log(`[instrumentation] OpenTelemetry activo — endpoint: ${endpoint} · serviço: ${serviceName}`);
  } catch (e) {
    // Pacotes OTel não instalados ou configuração inválida — degradar silenciosamente
    console.error('[instrumentation] OpenTelemetry não disponível:', (e as Error)?.message ?? e);
  }
}
