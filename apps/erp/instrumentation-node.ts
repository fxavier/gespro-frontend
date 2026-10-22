/**
 * Corpo Node-only do Instrumentation Hook (#533). Separado de
 * `instrumentation.ts` porque o Next analisa esse ficheiro também para o
 * runtime Edge e avisava «A Node.js API is used (process.on …) not supported
 * in the Edge Runtime». Aqui só se chega por `register()` quando
 * `NEXT_RUNTIME === 'nodejs'`. Comportamento e configuração: ver o cabeçalho de
 * `instrumentation.ts`.
 *
 * Os `import('…')` com string literal são deliberados: o @vercel/nft segue-os
 * e inclui os pacotes no output standalone (B1 fix).
 */
export async function registerNode(): Promise<void> {
  // #552: em produção, sem limitador partilhado, o servidor NÃO arranca — fora
  // do try de propósito. Ver src/server/security/arranque-rate-limit.ts.
  const { verificarDriverRateLimit } = await import('./src/server/security/arranque-rate-limit');
  verificarDriverRateLimit();

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
