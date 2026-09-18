/**
 * Cenário 1 — Venda no POS ponta-a-ponta (ADR-0018 §3).
 *
 * O fluxo mais crítico: uma transacção que atravessa quatro domínios
 * (venda → stock → caixa → numeração) e, com o ADR-0015, auditoria síncrona.
 * Invoca a Server Action real `criarVenda` (origem POS).
 *
 * SLO provisório: p95 < 1 500 ms (ADR-0018 §4).
 * Requer: perf/.generated/actions.json (discover-actions.mjs) e seed-manifest.
 */
import { sleep } from 'k6';
import { carregarManifesto, opcoesCarga, cuidLike, chave } from '../lib/util.js';
import { garantirSessao } from '../lib/session.js';
import { chamarAction } from '../lib/actions.js';

const { tenant } = carregarManifesto(open(__ENV.SEED_MANIFEST || '../../.generated/seed-manifest.json'));
const acoes = JSON.parse(open(__ENV.ACTIONS_MAP || '../../.generated/actions.json'));

export const options = Object.assign(opcoesCarga({ vus: Number(__ENV.VUS || 10) }), {
  thresholds: {
    'http_req_duration{operation:pos_venda}': ['p(95)<1500'],
    'http_req_failed{operation:pos_venda}': ['rate<0.001'],
  },
});

export default function () {
  const sessao = garantirSessao(tenant);

  // Preços «limpos» — evitam disputas de arredondamento com o serviço;
  // o objectivo é medir a transacção, não a aritmética.
  const p1 = cuidLike(chave(tenant.slug, 'produto', 1 + (__ITER % 40)));
  const p2 = cuidLike(chave(tenant.slug, 'produto', 41 + (__ITER % 9)));
  const input = {
    origem: 'POS',
    vendedorId: tenant.adminUserId,
    sessaoPOSId: tenant.sessaoPOSId,
    sessaoCaixaId: tenant.sessaoCaixaId,
    localizacaoOrigemId: tenant.localizacaoLojaId,
    itens: [
      { produtoId: p1, nomeProduto: 'Produto Perf A', quantidade: 1, precoUnitario: 100.0, desconto: 0, taxaIva: 0.16 },
      { produtoId: p2, nomeProduto: 'Produto Perf B', quantidade: 2, precoUnitario: 250.0, desconto: 0, taxaIva: 0.16 },
    ],
    pagamentos: [{ tipo: 'DINHEIRO', valor: 696.0 }],
  };

  chamarAction(acoes, 'criarVenda', '/pos', input, { operation: 'pos_venda' }, sessao);
  sleep(0.5);
}
