/**
 * Demonstração de Resultados em PDF, A4 retrato (ADR-0035 §8, issue #365).
 *
 * RUNTIME NODE APENAS (motor do ADR-0005). REFLECTE o `DRE` de `gerarDRE` — as mesmas
 * rubricas, os mesmos rótulos e a mesma ordem da página `/contabilidade/dre`; não recalcula nada. Gastos e
 * deduções aparecem com sinal negativo, como no ecrã.
 */
import 'server-only';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DRE } from '@/server/services/financas/contabilidade.interface';
import { formatarData } from '@/lib/format-date';
import { Document, PaginaDocumento } from './base';
import { CabecalhoMapa, LinhaMapa, RodapeMapa, type EmissaoMapaPdf, type EntidadeMapaPdf } from './mapa-pdf';

export interface DadosDrePdf {
  entidade: EntidadeMapaPdf;
  dre: DRE;
}

export function DreDocument({ dados, emissao }: { dados: DadosDrePdf; emissao: EmissaoMapaPdf }) {
  const { dre } = dados;
  const intervalo = `${formatarData(dre.dataInicio)} a ${formatarData(dre.dataFim)}`;
  const menos = (d: DRE['deducoes']) => d.negated();
  return (
    <Document title={`Demonstração de Resultados ${intervalo}`} creator="GestPro" producer="GestPro">
      <PaginaDocumento>
        <CabecalhoMapa entidade={dados.entidade} titulo="Demonstração de Resultados" intervalo={intervalo} emissao={emissao} />
        <LinhaMapa rotulo="RECEITA BRUTA" valor={dre.receitaBruta} destaque />
        <LinhaMapa rotulo="(-) Deduções" valor={menos(dre.deducoes)} recuo={1} />
        <LinhaMapa rotulo="RECEITA LÍQUIDA" valor={dre.receitaLiquida} destaque />
        <LinhaMapa rotulo="(-) Custo dos Bens/Serviços Vendidos" valor={menos(dre.custoProdutosVendidos)} recuo={1} />
        <LinhaMapa rotulo="LUCRO BRUTO" valor={dre.lucroBruto} destaque />
        <LinhaMapa rotulo="DESPESAS OPERACIONAIS" valor={menos(dre.totalDespesasOperacionais)} forte />
        <LinhaMapa rotulo="Gastos com o Pessoal" valor={menos(dre.despesasVendas)} recuo={1} />
        <LinhaMapa rotulo="Fornecimentos e Serviços de Terceiros" valor={menos(dre.despesasAdministrativas)} recuo={1} />
        <LinhaMapa rotulo="Outras Despesas Gerais" valor={menos(dre.despesasGerais)} recuo={1} />
        <LinhaMapa rotulo="LUCRO OPERACIONAL" valor={dre.lucroOperacional} destaque />
        <LinhaMapa rotulo="(+) Receitas Financeiras" valor={dre.receitasFinanceiras} recuo={1} />
        <LinhaMapa rotulo="(-) Despesas Financeiras" valor={menos(dre.despesasFinanceiras)} recuo={1} />
        <LinhaMapa rotulo="RESULTADO FINANCEIRO" valor={dre.resultadoFinanceiro} forte />
        <LinhaMapa rotulo="LUCRO ANTES DE IMPOSTOS" valor={dre.lucroAntesImpostos} destaque />
        <LinhaMapa rotulo="(-) Impostos (IRPC)" valor={menos(dre.impostos)} recuo={1} />
        <LinhaMapa rotulo="LUCRO LÍQUIDO" valor={dre.lucroLiquido} destaque />
        <RodapeMapa texto="Demonstração de Resultados · valores em MZN" />
      </PaginaDocumento>
    </Document>
  );
}

/** Renderiza a DRE para bytes PDF (Node). A emissão é parâmetro: o documento não lê o relógio. */
export async function renderDrePdf(dados: DadosDrePdf, emissao: EmissaoMapaPdf): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<DreDocument dados={dados} emissao={emissao} />);
  return new Uint8Array(buffer);
}
