/**
 * Utilitários partilhados dos cenários k6 (ADR-0018).
 *
 * IDs determinísticos: espelham prisma/seed/volume/id.ts — 'c' + 24 hex do
 * md5 da chave natural — para que os cenários calculem FKs sem consultar a BD.
 */
import crypto from 'k6/crypto';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function cuidLike(key) {
  return 'c' + crypto.md5(key, 'hex').slice(0, 24);
}

export function chave(slug, entidade, n) {
  return `perf:${slug}:${entidade}:${n}`;
}

/** Carrega o manifesto escrito pelo `pnpm db:seed:volume`. */
export function carregarManifesto(raw) {
  const m = JSON.parse(raw);
  const idx = Number(__ENV.TENANT_INDEX || 1);
  const tenant = m.tenantsSeed.find((t) => t.indice === idx);
  if (!tenant) {
    throw new Error(`Tenant índice ${idx} não existe no manifesto (tens ${m.tenantsSeed.length})`);
  }
  return { manifesto: m, tenant };
}

/**
 * Perfis de carga (PROFILE=smoke|baseline|ci).
 * smoke — valida o cenário; baseline — campanha local (ADR-0018 §4);
 * ci — detector de regressões grosseiras (ADR-0018 §6): 10 VUs, 2 min.
 */
export function opcoesCarga(overrides) {
  const perfil = __ENV.PROFILE || 'smoke';
  const base = {
    smoke: { vus: 1, iterations: 3 },
    baseline: { vus: Number(__ENV.VUS || 15), duration: __ENV.DURATION || '120s' },
    ci: { vus: 10, duration: '120s' },
  }[perfil];
  if (!base) throw new Error(`PROFILE desconhecido: ${perfil}`);
  // Os overrides do cenário (VUs próprios, iterações contadas…) só se aplicam
  // na campanha de baseline; smoke e ci têm formas fixas e comparáveis.
  return perfil === 'baseline' ? Object.assign({}, base, overrides || {}) : base;
}
