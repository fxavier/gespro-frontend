/**
 * Next.js Instrumentation Hook (Node.js runtime).
 * Regista o OpenTelemetry NodeSDK no arranque do servidor e arranca as sondas.
 *
 * Chamado uma vez por processo pelo Next.js antes de qualquer handler.
 * Apenas corre no runtime Node.js (não no edge runtime).
 *
 * Configuração por variável de ambiente (ADR-0019 §1, ADR-0026 §3):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — endpoint OTLP HTTP (obrigatório para activar)
 *                                    Local: http://localhost:4318
 *                                    Produção: mudar esta variável, não código
 *   OTEL_SERVICE_NAME             — nome do serviço (omissão: gespro)
 *   OTEL_SAMPLE_RATE              — fracção de traces amostrados (0–1, omissão: 1)
 *
 * Sondas de saúde (Keycloak, Valkey): arrancam quando o runtime é Node.js,
 * independentemente de OTEL_EXPORTER_OTLP_ENDPOINT estar definido ou não.
 * /api/ready NÃO depende das sondas — são best-effort e não bloqueiam.
 *
 * Dependências OTel em package.json:
 *   @opentelemetry/sdk-node
 *   @opentelemetry/exporter-trace-otlp-http
 *   @opentelemetry/exporter-logs-otlp-http
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

  // Carregamento dinâmico via Function para contornar a resolução de módulos
  // do TypeScript/Bundler quando os pacotes ainda não estão instalados.
  const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<Record<string, unknown>>;

  try {
    const [sdkMod, traceExporterMod, logsExporterMod, resourcesMod, semconvMod] = await Promise.all([
      dynamicImport('@opentelemetry/sdk-node'),
      dynamicImport('@opentelemetry/exporter-trace-otlp-http'),
      dynamicImport('@opentelemetry/exporter-logs-otlp-http'),
      dynamicImport('@opentelemetry/resources'),
      dynamicImport('@opentelemetry/semantic-conventions'),
    ]);

    // Carregamento opcional: instrumentação Prisma (só se @prisma/instrumentation instalado)
    let prismaInstrumentation: unknown[] = [];
    try {
      const prismaInstMod = await dynamicImport('@prisma/instrumentation');
      const PrismaInstrumentation = prismaInstMod['PrismaInstrumentation'] as new () => unknown;
      prismaInstrumentation = [new PrismaInstrumentation()];
    } catch {
      // @prisma/instrumentation não instalado — continuar sem ela
    }

    const NodeSDK = sdkMod['NodeSDK'] as new (cfg: Record<string, unknown>) => { start(): void; shutdown(): Promise<void> };
    const OTLPTraceExporter = traceExporterMod['OTLPTraceExporter'] as new (cfg: Record<string, unknown>) => unknown;
    const OTLPLogExporter = logsExporterMod['OTLPLogExporter'] as new (cfg: Record<string, unknown>) => unknown;
    const Resource = resourcesMod['Resource'] as new (attrs: Record<string, unknown>) => unknown;
    const semconv = semconvMod as Record<string, unknown>;
    // ATTR_SERVICE_NAME (v1.27+) ou fallback para versões anteriores
    const serviceNameAttr = (semconv['ATTR_SERVICE_NAME'] as string | undefined) ?? 'service.name';

    const sampleRate = parseFloat(process.env.OTEL_SAMPLE_RATE ?? '1');
    const serviceName = process.env.OTEL_SERVICE_NAME ?? 'gespro';

    // Endpoints OTLP derivados do endpoint base (ADR-0026 §3 — uma variável):
    //   Traces:  <endpoint>/v1/traces
    //   Logs:    <endpoint>/v1/logs
    const traceUrl = `${endpoint}/v1/traces`;
    const logsUrl = `${endpoint}/v1/logs`;

    const sdk = new NodeSDK({
      resource: new Resource({ [serviceNameAttr]: serviceName }),
      traceExporter: new OTLPTraceExporter({ url: traceUrl }),
      // Exportador de logs: cada linha de log estruturado vai para Loki via colector
      logRecordProcessor: (() => {
        try {
          // SimpleLogRecordProcessor é o mais adequado para ambiente dev
          // Em produção considerar BatchLogRecordProcessor
          const { SimpleLogRecordProcessor } = sdkMod as Record<string, new (exp: unknown) => unknown>;
          if (SimpleLogRecordProcessor) {
            return new SimpleLogRecordProcessor(new OTLPLogExporter({ url: logsUrl }));
          }
        } catch {
          // SDK pode não exportar SimpleLogRecordProcessor — silencioso
        }
        return undefined;
      })(),
      ...(prismaInstrumentation.length > 0 && { instrumentations: prismaInstrumentation }),
      // Amostragem configurável — 1 = 100%, 0.1 = 10%, etc.
      ...(sampleRate < 1 && {
        sampler: { shouldSample: () => ({ decision: Math.random() < sampleRate ? 1 : 0 }) },
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
