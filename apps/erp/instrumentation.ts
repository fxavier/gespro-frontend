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
  // Só activar no runtime Node.js — o edge runtime não suporta o NodeSDK nem
  // `process.on`. O corpo vive em ./instrumentation-node (import dinâmico com
  // string literal, atrás da guarda) para a análise do Edge não o ver (#533).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');
    await registerNode();
  }
}
