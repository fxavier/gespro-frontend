import 'server-only';
import {
  keycloakAvailable,
  keycloakTokenDurationMs,
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
 * URL derivada de KEYCLOAK_ISSUER (ex.: http://keycloak:8080/realms/gespro
 * → http://keycloak:8080/health/live).
 */
async function probeKeycloak(): Promise<void> {
  const issuer = process.env.KEYCLOAK_ISSUER ?? process.env.AUTH_KEYCLOAK_ISSUER;
  if (!issuer) return; // Keycloak não configurado — probe silenciosa

  // Derivar o URL de health a partir do issuer
  // Ex.: http://keycloak:8080/realms/gespro → http://keycloak:8080/health/live
  const baseUrl = issuer.replace(/\/realms\/[^/].*$/, '');
  const healthUrl = `${baseUrl}/health/live`;

  const start = Date.now();
  try {
    const resp = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    const duration = Date.now() - start;
    keycloakTokenDurationMs.observe(duration);
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
