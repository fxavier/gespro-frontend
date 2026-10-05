/**
 * Peças comuns aos mapas contabilísticos em PDF de uma página lógica (balanço, DRE —
 * ADR-0035 §8, issue #365): cabeçalho com a entidade, o NUIT, o título, o intervalo e a
 * emissão («emitido em … por …»), linhas rótulo/valor e rodapé «Página x de N».
 *
 * RUNTIME NODE APENAS (motor do ADR-0005), fontes-padrão (Helvetica), sem `Font.register` —
 * o texto continua verificável pelo `pdf-texto.ts`. Rótulos de uma linha (`maxLines: 1`):
 * cada linha tem altura fixa, como no balancete.
 */
import 'server-only';
import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import type { Prisma } from '@prisma/client';
import { formatNumero } from '@/lib/format-currency';
import { formatarDataHora } from '@/lib/format-date';
import { estilos } from './base';
import { PDF_THEME } from './theme';

export interface EntidadeMapaPdf {
  nome: string;
  nuit: string;
}

export interface EmissaoMapaPdf {
  em: Date;
  por: string;
}

const SEM_VALOR = '—';

/** «—» para zero; senão duas casas por `formatNumero` (como o balancete). */
export function valorMapa(d: Prisma.Decimal): string {
  return d.isZero() ? SEM_VALOR : formatNumero(d.toFixed(2));
}

const local = {
  cabecalho: {
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: PDF_THEME.cor.marca,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  esquerda: { flexGrow: 1, flexShrink: 1, flexBasis: 0, marginRight: 16 },
  direita: { width: 240, flexShrink: 0 },
  entidade: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PDF_THEME.cor.marca },
  titulo: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  meta: { fontSize: PDF_THEME.fonte.pequena, color: PDF_THEME.cor.suave },
  metaDireita: { fontSize: PDF_THEME.fonte.pequena, color: PDF_THEME.cor.suave, textAlign: 'right' },
  umaLinha: { maxLines: 1, textOverflow: 'ellipsis' },
  rotulo: { flex: 1 },
  codigo: { width: 36 },
  valor: { width: 110 },
  forte: { fontFamily: 'Helvetica-Bold' },
  destaque: { backgroundColor: PDF_THEME.cor.fundoCabecalhoTabela },
  rodape: {
    position: 'absolute',
    bottom: 20,
    left: PDF_THEME.espaco.pagina,
    right: PDF_THEME.espaco.pagina,
    borderTopWidth: 1,
    borderTopColor: PDF_THEME.cor.linha,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: PDF_THEME.cor.suave,
  },
} as const;

export function CabecalhoMapa({
  entidade,
  titulo,
  intervalo,
  emissao,
}: {
  entidade: EntidadeMapaPdf;
  titulo: string;
  intervalo: string;
  emissao: EmissaoMapaPdf;
}) {
  return (
    <View style={local.cabecalho} fixed>
      <View style={local.esquerda}>
        <Text style={[local.entidade, local.umaLinha]}>{entidade.nome}</Text>
        <Text style={local.meta}>{`NUIT: ${entidade.nuit}`}</Text>
      </View>
      <View style={local.direita}>
        <Text style={local.titulo}>{titulo}</Text>
        <Text style={local.metaDireita}>{intervalo}</Text>
        <Text style={local.metaDireita}>{`Emitido em ${formatarDataHora(emissao.em)} (Maputo)`}</Text>
        <Text style={[local.metaDireita, local.umaLinha]}>{`por ${emissao.por}`}</Text>
      </View>
    </View>
  );
}

/** Linha rótulo/valor; `codigo` opcional (balanço). */
export function LinhaMapa({
  rotulo,
  valor,
  codigo,
  recuo = 0,
  forte = false,
  destaque = false,
}: {
  rotulo: string;
  valor: Prisma.Decimal | null;
  codigo?: string;
  recuo?: number;
  forte?: boolean;
  destaque?: boolean;
}) {
  const texto = [estilos.celula, ...(forte || destaque ? [local.forte] : [])];
  return (
    <View style={[estilos.tabelaLinha, ...(destaque ? [local.destaque] : [])]} wrap={false}>
      {codigo !== undefined ? <Text style={[...texto, local.codigo, local.umaLinha]}>{codigo}</Text> : null}
      <Text style={[...texto, local.rotulo, local.umaLinha, { paddingLeft: recuo * 12 }]}>{rotulo}</Text>
      <Text style={[...texto, local.valor, estilos.num]}>{valor ? valorMapa(valor) : ''}</Text>
    </View>
  );
}

export function RodapeMapa({ texto }: { texto: string }) {
  return (
    <View style={local.rodape} fixed>
      <Text>{texto}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}
