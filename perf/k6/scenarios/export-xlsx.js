/**
 * Cenário 6 — Exportação XLSX (ADR-0018 §3: «50 000 linhas»).
 *
 * ACHADO IMPORTANTE (documentado no handoff): a superfície de exportação
 * actual está limitada a LIMITE_LINHAS = 5 000
 * (src/server/services/plataforma/export.service.ts) e o registry só tem três
 * módulos (clientes, producao-ordens, cliente-historico). O cenário de
 * «50 000 linhas» do ADR é IMPOSSÍVEL contra o código actual — medimos o
 * tecto real (5 000 linhas via cliente-historico) e entregamos o achado ao
 * orquestrador. O seed dá ao cliente-alvo 6 000 transacções para garantir que
 * o tecto é atingido.
 *
 * SLO provisório: leitura pesada p95 < 3 000 ms (memória e tempo de pedido).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, carregarManifesto, opcoesCarga } from '../lib/util.js';
import { garantirSessao } from '../lib/session.js';

const { tenant } = carregarManifesto(
  open(__ENV.SEED_MANIFEST || '../../.generated/seed-manifest.json'),
);

export const options = Object.assign(opcoesCarga({ vus: Number(__ENV.VUS || 5) }), {
  thresholds: {
    'http_req_duration{operation:export_xlsx}': ['p(95)<3000'],
    'http_req_failed{operation:export_xlsx}': ['rate<0.001'],
  },
});

export default function () {
  const sessao = garantirSessao(tenant);

  // Tecto actual da exportação: 5 000 linhas de histórico de um cliente.
  const r1 = http.get(
    `${BASE_URL}/api/export/cliente-historico?formato=xlsx&clienteId=${tenant.clienteExportId}`,
    { headers: sessao, tags: { operation: 'export_xlsx' } },
  );
  check(r1, {
    'export 200': (r) => r.status === 200,
    'é xlsx': (r) => String(r.headers['Content-Type'] || '').indexOf('spreadsheet') !== -1,
  });

  // Exportação da carteira de clientes (2 000 linhas).
  const r2 = http.get(`${BASE_URL}/api/export/clientes?formato=xlsx`, {
    headers: sessao,
    tags: { operation: 'export_xlsx' },
  });
  check(r2, { 'export clientes 200': (r) => r.status === 200 });

  sleep(1);
}
