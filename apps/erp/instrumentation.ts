/**
 * Next.js Instrumentation Hook (Node.js runtime).
 * Regista o OpenTelemetry NodeSDK no arranque do servidor.
 *
 * Chamado uma vez por processo pelo Next.js antes de qualquer handler.
 * Apenas corre no runtime Node.js (não no edge runtime).
 *
 * Dependências OTel adicionadas ao package.json (orquestrador instala):
 *   @opentelemetry/sdk-node
 *   @opentelemetry/exporter-trace-otlp-http
 *   @opentelemetry/resources
 *   @opentelemetry/semantic-conventions
 *   @prisma/instrumentation
 *
 * Configuração por env:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — endpoint OTLP HTTP (obrigatório para activar)
 *   OTEL_SERVICE_NAME             — nome do serviço (default: gespro)
 *   OTEL_SAMPLE_RATE              — fracção de traces amostrados (0-1, default: 1)
 */
export async function register() {
  // Só activar no runtime Node.js — o edge runtime não suporta o NodeSDK.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    // OTEL não configurado — modo silencioso (não bloqueia o arranque).
    return;
  }

  // Carregamento dinâmico via Function para contornar a resolução de módulos
  // do TypeScript/Bundler quando os pacotes ainda não estão instalados.
  // Em runtime (Node.js puro), o import() nativo funciona sem restrições.
  const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<Record<string, unknown>>;

  try {
    const [sdkMod, exporterMod, resourcesMod, semconvMod] = await Promise.all([
      dynamicImport('@opentelemetry/sdk-node'),
      dynamicImport('@opentelemetry/exporter-trace-otlp-http'),
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
    const OTLPTraceExporter = exporterMod['OTLPTraceExporter'] as new (cfg: Record<string, unknown>) => unknown;
    const Resource = resourcesMod['Resource'] as new (attrs: Record<string, unknown>) => unknown;
    const semconv = semconvMod as Record<string, unknown>;
    // ATTR_SERVICE_NAME (v1.27+) ou fallback para versões anteriores
    const serviceNameAttr = (semconv['ATTR_SERVICE_NAME'] as string | undefined) ?? 'service.name';

    const sampleRate = parseFloat(process.env.OTEL_SAMPLE_RATE ?? '1');

    const sdk = new NodeSDK({
      resource: new Resource({ [serviceNameAttr]: process.env.OTEL_SERVICE_NAME ?? 'gespro' }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
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

    console.log(`[instrumentation] OpenTelemetry activo — exporter: ${endpoint}`);
  } catch (e) {
    // Pacotes OTel não instalados ou configuração inválida — degradar silenciosamente
    console.error('[instrumentation] OpenTelemetry não disponível:', (e as Error)?.message ?? e);
  }
}
