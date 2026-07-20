import 'server-only';

/**
 * Contadores RED em memória (Rate, Errors, Duration).
 *
 * Reset ao reiniciar o processo — adequado para diagnóstico em dev e
 * para alimentar dashboards de curto prazo em prod. Para métricas
 * persistentes instalar `prom-client` (já em package.json) e substituir
 * este módulo por um registo Prometheus.
 *
 * Chamado pelos envelopes `withApi` e `createSafeAction` ao terminar
 * cada pedido/action — os valores são sempre actuais.
 */
export interface RedMetrics {
  requestsTotal: number;
  errorsTotal: number;
  durationSumMs: number;
  startedAt: number;
}

const state: RedMetrics = {
  requestsTotal: 0,
  errorsTotal: 0,
  durationSumMs: 0,
  startedAt: Date.now(),
};

/** Regista um pedido concluído. Chamado pelos envelopes imediatamente após o handler. */
export function recordRequest(durationMs: number, isError: boolean): void {
  state.requestsTotal += 1;
  state.durationSumMs += durationMs;
  if (isError) state.errorsTotal += 1;
}

/** Snapshot imutável dos contadores actuais. */
export function getMetrics(): Readonly<RedMetrics> {
  return { ...state };
}
