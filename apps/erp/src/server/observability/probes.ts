import 'server-only';
import {
  keycloakAvailable,
  keycloakHealthProbeDurationMs,
  valkeyAvailable,
  valkeyOperationDurationMs,
} from './prom-registry';

/**
 * Sondas de saúde para serviços externos (Keycloak e Valkey).
 *
 * Cada sonda corre em background a cada PROBE_INTERVAL_MS e actualiza
 * os gauges/histogramas correspondentes no registo Prometheus.
 *
 * Regra de cardinalidade: as sondas NÃO produzem etiquetas de alta
 * cardinalidade (sem userId, sem requestId). As métricas são de
 * disponibilidade global dos serviços, não por utilizador.
 *
 * /api/ready NÃO depende destas sondas — as sondas são best-effort
 * e não bloqueiam instâncias saudáveis do ERP.
 */

const PROBE_INTERVAL_MS = 30_000; // 30 segundos

// ---------------------------------------------------------------------------
// Probe do Keycloak
// ---------------------------------------------------------------------------

/**
 * Verifica a disponibilidade do Keycloak via o endpoint de health.
 *
 * URL de saúde (M2 fix — ADR-0019 §2):
 *   KEYCLOAK_HEALTH_URL (variável dedicada, preferida) — ex.: http://keycloak:9000/health/live
 *   Fallback: deriva de KEYCLOAK_URL substituindo a porta por 9000
 *             ex.: http://keycloak:8080 → http://keycloak:9000/health/live
 *
 * NOTA IMPORTANTE:
 *   - KEYCLOAK_ISSUER (ex.: http://localhost:8081/realms/gespro) aponta para o browser,
 *     não para o contentor — NÃO usar para derivar o URL de health dentro do compose.
 *   - O Keycloak 26 serve /health na porta de gestão 9000 (interna à rede Docker),
 *     nunca na porta 8080 (HTTP) nem na 8443 (HTTPS).
 *   - A porta 9000 não é publicada no compose — só acessível dentro da rede Docker.
 */
async function probeKeycloak(): Promise<void> {
  // 1. URL dedicado (preferido) — ex.: http://keycloak:9000/health/live
  let healthUrl = process.env.KEYCLOAK_HEALTH_URL;

  if (!healthUrl) {
    // 2. Fallback: deriva de KEYCLOAK_URL (URL interno do contentor Keycloak)
    //    ex.: http://keycloak:8080 → http://keycloak:9000/health/live
    const keycloakUrl = process.env.KEYCLOAK_URL;
    if (!keycloakUrl) return; // Keycloak não configurado — probe silenciosa

    try {
      const parsed = new URL(keycloakUrl);
      // Porta de gestão do Keycloak 26: sempre 9000
      parsed.port = '9000';
      parsed.pathname = '/health/live';
      healthUrl = parsed.toString();
    } catch {
      return; // URL inválido — probe silenciosa
    }
  }

  const start = Date.now();
  try {
    const resp = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    const duration = Date.now() - start;
    keycloakHealthProbeDurationMs.observe(duration);
    keycloakAvailable.set(resp.ok ? 1 : 0);
  } catch {
    // Timeout, conexão recusada ou erro de rede
    keycloakAvailable.set(0);
  }
}

// ---------------------------------------------------------------------------
// Probe do Valkey (Redis-compatible)
// ---------------------------------------------------------------------------

/**
 * Verifica a disponibilidade do Valkey via o comando PING sobre TCP directo.
 * Não depende de cliente Redis — usa `node:net` para enviar o comando RESP.
 *
 * Nota: o w8-cache (fase 2) introduzirá o cliente Valkey partilhado.
 * Quando isso acontecer, esta sonda pode ser actualizada para usar o cliente
 * em vez de TCP directo, garantindo que é o mesmo caminho de ligação.
 */
async function probeValkey(): Promise<void> {
  const url = process.env.VALKEY_URL ?? process.env.REDIS_URL;
  if (!url) return; // Valkey não configurado — probe silenciosa

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return; // URL inválido — não tenta
  }

  const host = parsed.hostname;
  const port = parseInt(parsed.port || '6379', 10);
  const start = Date.now();

  try {
    await new Promise<void>((resolve, reject) => {
      // Importação dinâmica para evitar resolução em edge runtime
      import('node:net').then(({ createConnection }) => {
        const socket = createConnection(port, host);
        socket.setTimeout(3_000);

        socket.once('connect', () => {
          // Protocolo RESP: *1\r\n$4\r\nPING\r\n
          socket.write('*1\r\n$4\r\nPING\r\n');
        });

        socket.once('data', (data: Buffer) => {
          const response = data.toString();
          const ok = response.includes('+PONG') || response.includes('PONG');
          const duration = Date.now() - start;
          valkeyAvailable.set(ok ? 1 : 0);
          if (ok) valkeyOperationDurationMs.observe({ operation: 'ping' }, duration);
          socket.destroy();
          if (ok) resolve();
          else reject(new Error('Resposta inesperada do Valkey'));
        });

        socket.once('error', (err: Error) => {
          socket.destroy();
          reject(err);
        });

        socket.once('timeout', () => {
          socket.destroy();
          reject(new Error('Timeout na sonda do Valkey'));
        });
      }).catch(reject);
    });
  } catch {
    valkeyAvailable.set(0);
  }
}

// ---------------------------------------------------------------------------
// Arranque das sondas
// ---------------------------------------------------------------------------

let _probesStarted = false;

/**
 * Arranca as sondas de saúde em background.
 * Chamado uma vez em instrumentation.ts (register()).
 * Seguro chamar múltiplas vezes — só arranca uma vez.
 */
export function startProbes(): void {
  if (_probesStarted) return;
  _probesStarted = true;

  // Primeira execução imediata
  void probeKeycloak();
  void probeValkey();

  // Execuções periódicas
  const timer = setInterval(() => {
    void probeKeycloak();
    void probeValkey();
  }, PROBE_INTERVAL_MS);

  // unref() para não impedir o processo de terminar normalmente
  if (typeof timer.unref === 'function') timer.unref();
}

/** Exposto para testes: reinicia o estado de arranque das sondas. */
export function _resetProbesState(): void {
  _probesStarted = false;
}
