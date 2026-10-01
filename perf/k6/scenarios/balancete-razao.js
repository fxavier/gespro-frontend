/**
 * Cenário 3 — Balancete e razão de conta (ADR-0018 §3).
 *
 * Agregação sobre 250 000 partidas — a consulta mais pesada do sistema.
 * Balancete de um exercício completo + razão de uma conta com intervalo.
 *
 * SLO provisório: balancete p95 < 3 000 ms; razão tratada como leitura pesada
 * (mesmo limiar — a confirmar na revisão dos SLOs).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, carregarManifesto, opcoesCarga, rendeuDados } from '../lib/util.js';
import { garantirSessao, iniciarSessao } from '../lib/session.js';

const { tenant } = carregarManifesto(
  open(__ENV.SEED_MANIFEST || '../../.generated/seed-manifest.json'),
);

export const options = Object.assign(opcoesCarga(), {
  thresholds: {
    'http_req_duration{operation:balancete}': ['p(95)<3000'],
    'http_req_duration{operation:razao}': ['p(95)<3000'],
    'http_req_failed{operation:balancete}': ['rate<0.001'],
    // Sem isto as verificações de conteúdo abaixo seriam decorativas: uma
    // verificação falhada não faz falhar a execução por omissão.
    checks: ['rate>0.99'],
  },
});

export function setup() {
  return iniciarSessao(tenant);
}

export default function (data) {
  const sessao = garantirSessao(data);

  // Balancete PHC de um exercício — URL nova (ADR-0040, S1).
  const ano = new Date().getFullYear() - 1;
  const rb = http.get(
    `${BASE_URL}/contabilidade/balancete?exercicio=${ano}&de=1&ate=12`,
    { headers: sessao, tags: { operation: 'balancete' } },
  );
  // «Balancete equilibrado» só existe após o cálculo; n4 — mais específico que «Totais».
  check(rb, { 'balancete rendeu totais': (r) => rendeuDados(r, 'Balancete equilibrado') });

  // Razão de uma conta-folha aleatória no mesmo intervalo.
  const conta = tenant.contaIds[(__VU + __ITER) % tenant.contaIds.length];
  const rr = http.get(
    `${BASE_URL}/contabilidade/razao-geral?contaId=${conta}&dataInicio=${ano}-01-01&dataFim=${ano}-12-31`,
    { headers: sessao, tags: { operation: 'razao' } },
  );
  // `Saldo Acum.` é cabeçalho da tabela de movimentos — ausente na página de
  // erro e no estado vazio. É a verificação que teria apanhado o D2.
  check(rr, { 'razão rendeu movimentos': (r) => rendeuDados(r, 'Saldo Acum.') });

  sleep(0.5);
}
