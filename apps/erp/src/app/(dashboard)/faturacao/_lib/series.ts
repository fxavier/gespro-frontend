import 'server-only';

import * as faturacaoService from '@/server/services/financas/faturacao.service';

/**
 * Séries de documento prontas para uma caixa de selecção.
 *
 * Existe porque três formulários (fatura, proforma, cotação) liam `s.codigo` e
 * `s.nome` — campos que o modelo `SerieDocumento` não tem. O resultado era um
 * «—» solitário em cada lista. A identidade de uma série é `prefixo` + `ano`.
 */
export interface SerieOpcao {
  id: string;
  codigo: string;
  nome: string;
}

type Ctx = { tenantId: string; userId: string };

export async function listarSeriesParaSelecao(
  tipo: string,
  ctx: Ctx,
): Promise<SerieOpcao[]> {
  const series = await faturacaoService.listarSeries(ctx);
  return series
    .filter((s) => s.tipo === tipo && s.ativo)
    .sort((a, b) => b.ano - a.ano)
    .map((s) => ({
      id: s.id,
      codigo: s.prefixo,
      nome: `${s.prefixo}/${s.ano}`,
    }));
}
