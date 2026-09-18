/**
 * Cenário 5 — Processamento salarial de 80 colaboradores (ADR-0018 §3).
 *
 * Cálculo intensivo em `Decimal` com tabelas fiscais versionadas (INSS/IRPS).
 * Cada iteração processa um MÊS ÚNICO (a folha é idempotente por
 * tenant+ano+mês) — os meses começam em 2030 para nunca colidir com os 24
 * meses semeados nem entre execuções... dentro da mesma campanha.
 *
 * É uma operação de lote: o SLO de mutação (p95 < 1 200 ms) NÃO se aplica
 * linha a linha — o limiar aqui é provisório e generoso, a rever com dados.
 */
import { sleep } from 'k6';
import exec from 'k6/execution';
import { carregarManifesto, opcoesCarga } from '../lib/util.js';
import { garantirSessao } from '../lib/session.js';
import { chamarAction } from '../lib/actions.js';

const { tenant } = carregarManifesto(
  open(__ENV.SEED_MANIFEST || '../../.generated/seed-manifest.json'),
);
const acoes = JSON.parse(open(__ENV.ACTIONS_MAP || '../../.generated/actions.json'));

// Lote pesado: poucos VUs, iterações contadas.
export const options = Object.assign(
  opcoesCarga({ vus: 2, iterations: Number(__ENV.ITERATIONS || 10), duration: '10m' }),
  {
    thresholds: {
      'http_req_duration{operation:payroll_processar}': ['p(95)<15000'],
      'http_req_failed{operation:payroll_processar}': ['rate<0.001'],
    },
  },
);

export default function () {
  const sessao = garantirSessao(tenant);

  // Mês único por iteração global; RUN_OFFSET evita colisão entre campanhas
  // na mesma base de dados (ex.: RUN_OFFSET=100 na segunda execução).
  const i = exec.scenario.iterationInTest + Number(__ENV.RUN_OFFSET || 0);
  const input = { mes: 1 + (i % 12), ano: 2030 + Math.floor(i / 12) };

  chamarAction(
    acoes,
    'processarFolhaMesAction',
    '/rh/payroll',
    input,
    { operation: 'payroll_processar' },
    sessao,
  );
  sleep(1);
}
