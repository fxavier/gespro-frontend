/**
 * Oráculo estático — issue #104: os KPIs dos dashboards vêm de `count` no serviço, não do
 * comprimento de uma página cortada (`take: 1`/`take: 100`).
 *
 * Varre o CÓDIGO das seis páginas com KPIs sobre listas cortadas (lidas em `2990eb8`):
 *
 *   inventario/page.tsx            Total de Ativos, Em Uso, Em Manutenção        (take: 1, «25+»)
 *   inventario/contagens/page.tsx  Em Contagem, Reconciliadas, Concluídas        (take: 1, «1+»)
 *   stock/dashboard/page.tsx       Produtos no Catálogo, Movimentações           (take: 1, «25+»)
 *   rh/colaboradores/page.tsx      Activos, Inactivos, Período Experimental, total (take: 1)
 *   core-tenancy/page.tsx          Utilizadores                                   (take: 1)
 *   contabilidade/page.tsx         Lançamentos Pendentes/Efectuados, Contas no Plano (take: 100)
 *
 * Contrato:
 *   1. Nenhuma destas páginas pede uma página de 1 ou de 100 registos (`take: 1`/`take: 100`).
 *   2. Nenhuma mostra «25+» nem «1+», nem calcula um KPI com `.items.length`/`.items.filter`.
 *   3. Cada uma chama o `contar*` do serviço fixado em `test/integration/kpis-count-104.test.ts`
 *      (onde os números se provam contra Postgres real).
 *
 * ESTADO ESPERADO antes da implementação: RED nos três grupos, nas seis páginas.
 *
 * Escrito pelo verificador do nó A:kpis-count-104; um agente de implementação que o altere é
 * BLOCKER.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const DASH = path.resolve(__dirname, '..'); // apps/erp/src/app/(dashboard)

const PAGINAS: Array<{ ficheiro: string; contadores: string[] }> = [
  { ficheiro: 'inventario/page.tsx', contadores: ['ativosService.contarAtivos('] },
  { ficheiro: 'inventario/contagens/page.tsx', contadores: ['contagemStockService.contar('] },
  {
    ficheiro: 'stock/dashboard/page.tsx',
    contadores: ['catalogoProdutoService.contarProdutos(', 'stockService.contarMovimentos('],
  },
  { ficheiro: 'rh/colaboradores/page.tsx', contadores: ['ColaboradorService.contar('] },
  { ficheiro: 'core-tenancy/page.tsx', contadores: ['userAdminService.contarUtilizadores('] },
  {
    ficheiro: 'contabilidade/page.tsx',
    contadores: ['contabilidadeService.contarLancamentos(', 'contabilidadeService.contarContas('],
  },
];

/** Código sem comentários — um comentário a citar o defeito antigo não conta como uso. */
function codigo(ficheiro: string): string {
  const src = fs.readFileSync(path.join(DASH, ficheiro), 'utf8');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('KPIs por count (#104) — oráculo estático', () => {
  for (const { ficheiro, contadores } of PAGINAS) {
    describe(ficheiro, () => {
      it('não pede páginas de 1 ou de 100 registos', () => {
        const achados = codigo(ficheiro).match(/\btake:\s*(1|100)\b/g) ?? [];
        expect(achados, `${ficheiro} ainda conta sobre uma página cortada`).toEqual([]);
      });

      it('não mostra «25+»/«1+» nem calcula KPIs com items.length/items.filter', () => {
        const src = codigo(ficheiro);
        expect(src.match(/['"`](25|1)\+['"`]/g) ?? [], `${ficheiro}: valor «N+»`).toEqual([]);
        expect(src.match(/\.items\.(length|filter)\b/g) ?? [], `${ficheiro}: KPI tirado da página`).toEqual([]);
      });

      it(`usa ${contadores.join(' e ')}`, () => {
        const src = codigo(ficheiro);
        for (const c of contadores) {
          expect(src.includes(c), `${ficheiro} não chama ${c}…)`).toBe(true);
        }
      });
    });
  }
});
