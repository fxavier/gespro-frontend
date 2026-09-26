/**
 * Gate de regressão em CI (ADR-0018 §6) — cenário reduzido: 10 VUs, 2 min,
 * contra um subconjunto do volume (VOLUME_PROFILE=ci).
 *
 * Não é uma medição de capacidade; é um detector de regressões grosseiras.
 * Só leituras — não depende de actions.json (os IDs de Server Action mudam
 * por build e a descoberta em CI seria frágil).
 *
 * O veredicto (degradação p95 > 20 % face a perf/baseline.json) é dado por
 * perf/scripts/compare-baseline.mjs sobre o summary exportado — e corre em
 * modo permissivo enquanto baseline.json (fase 2, pós-Keycloak) não existir.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, carregarManifesto, opcoesCarga } from './lib/util.js';
import { garantirSessao } from './lib/session.js';

const { tenant } = carregarManifesto(
  open(__ENV.SEED_MANIFEST || '../.generated/seed-manifest.json'),
);

export const options = Object.assign(opcoesCarga(), {
  thresholds: {
    // Tecto de sanidade absoluto — o gate fino é o compare-baseline.mjs.
    'http_req_failed{operation:ci_read}': ['rate<0.01'],
  },
});

export default function () {
  const sessao = garantirSessao(tenant);
  const tags = { operation: 'ci_read' };
  const ano = new Date().getFullYear() - 1;

  const paginas = [
    `${BASE_URL}/inventario/movimentacoes?take=50`,
    `${BASE_URL}/contabilidade/balancete?dataInicio=${ano}-01-01&dataFim=${ano}-12-31`,
    `${BASE_URL}/contabilidade/razao-geral?contaId=${tenant.contaIds[__ITER % 30]}&dataInicio=${ano}-01-01&dataFim=${ano}-12-31`,
  ];
  const res = http.get(paginas[__ITER % paginas.length], { headers: sessao, tags });
  check(res, { '200': (r) => r.status === 200 });
  sleep(0.2);
}
