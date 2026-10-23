/**
 * Verificação de arranque do limitador (#552). Corre no
 * `instrumentation-node.ts`; se lançar, o Next guarda a falha e responde 500 a
 * todos os pedidos (`/api/health` incluído) — o processo não termina.
 *
 * Em produção o limitador tem de ser partilhado (Valkey): com o adaptador em
 * memória cada réplica conta sozinha — N réplicas, limite ×N — e o `failClosed`
 * do registo não existe. Só a instância única do perf/smoke o aceita, e por
 * escrito: `RATE_LIMIT_MEMORIA_EM_PRODUCAO=1`.
 *
 * O `next build` corre com NODE_ENV=production e não é arranque: passa.
 */
import { saltosDeConfianca } from './ip-cliente';

type Env = Record<string, string | undefined>;

export function verificarDriverRateLimit(env: Env = process.env): void {
  saltosDeConfianca(env.TRUSTED_PROXY_HOPS);

  if (env.NODE_ENV !== 'production') return;
  if (env.NEXT_PHASE === 'phase-production-build') return;
  if (env.RATE_LIMIT_MEMORIA_EM_PRODUCAO === '1') return;

  const driver = env.RATE_LIMIT_DRIVER?.trim() || '(por definir)';
  if (driver !== 'valkey') {
    throw new Error(
      `[rate-limit] Em produção o limitador tem de ser partilhado: RATE_LIMIT_DRIVER=valkey e VALKEY_URL ` +
        `(está ${driver === '(por definir)' ? 'por definir — a omissão é memory' : `"${driver}"`}). ` +
        `Com memória cada réplica conta sozinha e o limite multiplica-se pelo número de réplicas (#552). ` +
        `Só para uma instância única de perf/smoke: RATE_LIMIT_MEMORIA_EM_PRODUCAO=1.`,
    );
  }
  if (!env.VALKEY_URL?.trim()) {
    throw new Error('[rate-limit] RATE_LIMIT_DRIVER=valkey exige VALKEY_URL (#552).');
  }
}
