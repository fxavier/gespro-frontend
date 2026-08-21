/**
 * Cenário 4 — Emissão de factura com PDF (ADR-0018 §3).
 *
 * Duas medições separadas:
 *   fatura_emitir — Server Action `emitirFatura` (transacção + numeração +
 *                   lançamento contabilístico + auditoria);
 *   fatura_pdf    — GET /api/faturacao/[id]/pdf sobre facturas semeadas
 *                   (geração @react-pdf/renderer em runtime Node).
 *
 * SLO provisório: mutação p95 < 1 200 ms; o PDF é tratado como leitura pesada.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, carregarManifesto, opcoesCarga, cuidLike, chave } from '../lib/util.js';
import { garantirSessao } from '../lib/session.js';
import { chamarAction } from '../lib/actions.js';

const { manifesto, tenant } = carregarManifesto(
  open(__ENV.SEED_MANIFEST || '../../.generated/seed-manifest.json'),
);
const acoes = JSON.parse(open(__ENV.ACTIONS_MAP || '../../.generated/actions.json'));
const TOTAL_FATURAS = manifesto.volumesPorTenant.faturas;

export const options = Object.assign(opcoesCarga({ vus: Number(__ENV.VUS || 10) }), {
  thresholds: {
    'http_req_duration{operation:fatura_emitir}': ['p(95)<1200'],
    'http_req_duration{operation:fatura_pdf}': ['p(95)<3000'],
    'http_req_failed{operation:fatura_emitir}': ['rate<0.001'],
    'http_req_failed{operation:fatura_pdf}': ['rate<0.001'],
  },
});

export default function () {
  const sessao = garantirSessao(tenant);

  const hoje = new Date().toISOString().slice(0, 10);
  const cliente = tenant.clienteIds[(__VU + __ITER) % tenant.clienteIds.length];
  const input = {
    serieDocumentoId: tenant.serieFaturaId,
    clienteId: cliente,
    moeda: 'MZN',
    dataEmissao: hoje,
    dataVencimento: hoje,
    linhas: [
      { descricao: 'Serviço perf 1', quantidade: 1, precoUnitario: 100.0, desconto: 0, taxaIva: 0.16 },
      { descricao: 'Serviço perf 2', quantidade: 2, precoUnitario: 250.0, desconto: 0, taxaIva: 0.16 },
    ],
  };
  chamarAction(acoes, 'emitirFatura', '/faturacao/nova', input, { operation: 'fatura_emitir' }, sessao);

  // PDF de uma factura semeada (reflecte o documento emitido; nunca recalcula).
  const n = 1 + ((__VU * 7919 + __ITER * 104729) % TOTAL_FATURAS);
  const faturaId = cuidLike(chave(tenant.slug, 'fatura', n));
  const rp = http.get(`${BASE_URL}/api/faturacao/${faturaId}/pdf`, {
    headers: sessao,
    tags: { operation: 'fatura_pdf' },
  });
  check(rp, { 'pdf 200': (r) => r.status === 200 });

  sleep(0.5);
}
