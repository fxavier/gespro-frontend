/**
 * Balanço simples por classes em PDF, A4 retrato (ADR-0035 §8, issue #365).
 *
 * RUNTIME NODE APENAS (motor do ADR-0005). O documento REFLECTE o `Balanco` que o serviço
 * devolveu (`gerarBalanco`): as três massas com as linhas por conta de razão e os totais, o
 * resultado do período por apurar e a igualdade Activo = Capital próprio + Passivo. Não
 * recalcula nada. As linhas são de razão (dezenas, não milhares): sem tecto de linhas.
 */
import 'server-only';
import React from 'react';
import { View, Text, renderToBuffer } from '@react-pdf/renderer';
import type { Balanco, MassaBalanco } from '@/server/services/financas/balanco';
import { Document, PaginaDocumento, estilos } from './base';
import { CabecalhoMapa, LinhaMapa, RodapeMapa, type EmissaoMapaPdf, type EntidadeMapaPdf } from './mapa-pdf';

export interface DadosBalancoPdf {
  entidade: EntidadeMapaPdf;
  /** Código do exercício. */
  exercicio: string;
  /** 1..13 — o balanço é o acumulado dos períodos 1..periodoFinal. */
  periodoFinal: number;
  balanco: Balanco;
}

function intervalo(exercicio: string, periodoFinal: number): string {
  if (periodoFinal === 13) return `Exercício ${exercicio} — após o encerramento (período 13)`;
  return `Exercício ${exercicio} — até ao período ${periodoFinal}`;
}

function Massa({ titulo, massa, children }: { titulo: string; massa: MassaBalanco; children?: React.ReactNode }) {
  return (
    <View>
      <Text style={estilos.seccao}>{titulo}</Text>
      {massa.linhas.map((l, i) => (
        <LinhaMapa key={`${l.codigo}-${i}`} codigo={l.codigo} rotulo={l.nome} valor={l.valor} />
      ))}
      {children}
      <LinhaMapa codigo="" rotulo={`Total — ${titulo}`} valor={massa.total} destaque />
    </View>
  );
}

export function BalancoDocument({ dados, emissao }: { dados: DadosBalancoPdf; emissao: EmissaoMapaPdf }) {
  const { balanco } = dados;
  return (
    <Document title={`Balanço ${dados.exercicio} (período ${dados.periodoFinal})`} creator="GestPro" producer="GestPro">
      <PaginaDocumento>
        <CabecalhoMapa
          entidade={dados.entidade}
          titulo="Balanço"
          intervalo={intervalo(dados.exercicio, dados.periodoFinal)}
          emissao={emissao}
        />
        <Massa titulo="Activo" massa={balanco.activo} />
        <Massa titulo="Capital próprio" massa={balanco.capitalProprio}>
          {balanco.resultadoDoPeriodo.isZero() ? null : (
            <LinhaMapa codigo="" rotulo="Resultado do período (por apurar)" valor={balanco.resultadoDoPeriodo} />
          )}
        </Massa>
        <Massa titulo="Passivo" massa={balanco.passivo} />
        <View style={{ marginTop: 8 }}>
          <LinhaMapa
            codigo=""
            rotulo="Capital próprio + Passivo"
            valor={balanco.capitalProprio.total.plus(balanco.passivo.total)}
            forte
          />
          <Text style={[estilos.pequena, { marginTop: 6 }]}>
            {balanco.equilibrado
              ? 'Activo = Capital próprio + Passivo: equilibrado'
              : 'Activo ≠ Capital próprio + Passivo: desequilibrado'}
          </Text>
        </View>
        <RodapeMapa texto="Balanço por classes · valores em MZN" />
      </PaginaDocumento>
    </Document>
  );
}

/** Renderiza o balanço para bytes PDF (Node). A emissão é parâmetro: o documento não lê o relógio. */
export async function renderBalancoPdf(dados: DadosBalancoPdf, emissao: EmissaoMapaPdf): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<BalancoDocument dados={dados} emissao={emissao} />);
  return new Uint8Array(buffer);
}
