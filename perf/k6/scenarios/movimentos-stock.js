/**
 * Cenário 2 — Listagem de movimentos de stock com filtros (ADR-0018 §3).
 *
 * A maior tabela do sistema (400 000 linhas/tenant): testa a paginação por
 * cursor sob volume — primeira página (quente) e páginas profundas (cursor
 * aleatório determinístico), com filtro de tipo.
 *
 * SLO provisório: leitura de página p95 < 800 ms.
 *
 * NOTA (achado): a página parseia o filtro `tipo` do URL mas não o passa ao
 * serviço (src/app/(dashboard)/inventario/movimentacoes/page.tsx) — o filtro
 * é inofensivo no servidor. Documentado no handoff; não corrigido aqui.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, carregarManifesto, opcoesCarga, cuidLike, chave, rendeuDados } from '../lib/util.js';
import { garantirSessao } from '../lib/session.js';

const { manifesto, tenant } = carregarManifesto(
  open(__ENV.SEED_MANIFEST || '../../.generated/seed-manifest.json'),
);
const TOTAL_MOVIMENTOS = manifesto.volumesPorTenant.movimentosStock;

export const options = Object.assign(opcoesCarga(), {
  thresholds: {
    'http_req_duration{operation:stock_lista}': ['p(95)<800'],
    'http_req_duration{operation:stock_pagina_funda}': ['p(95)<800'],
    'http_req_failed{operation:stock_lista}': ['rate<0.001'],
    checks: ['rate>0.99'],
  },
});

export default function () {
  const sessao = garantirSessao(tenant);

  // Primeira página (o caso comum).
  const r1 = http.get(`${BASE_URL}/inventario/movimentacoes?take=50`, {
    headers: sessao,
    tags: { operation: 'stock_lista' },
  });
  check(r1, {
    'lista rendeu linhas': (r) =>
      rendeuDados(r, 'Movimentações de Stock', 'Sem movimentações registadas'),
  });

  // Página profunda: cursor determinístico algures na tabela.
  const n = 1 + ((__VU * 7919 + __ITER * 104729) % TOTAL_MOVIMENTOS);
  const cursor = cuidLike(chave(tenant.slug, 'mov', n));
  const r2 = http.get(
    `${BASE_URL}/inventario/movimentacoes?take=50&tipo=SAIDA&cursor=${cursor}`,
    { headers: sessao, tags: { operation: 'stock_pagina_funda' } },
  );
  check(r2, {
    'página funda rendeu linhas': (r) =>
      rendeuDados(r, 'Movimentações de Stock', 'Sem movimentações registadas'),
  });

  sleep(0.3);
}
