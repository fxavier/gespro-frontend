/**
 * Layout base reutilizável para documentos PDF (`@react-pdf/renderer`).
 *
 * RUNTIME NODE APENAS — nunca importar no cliente (CLAUDE.md §RSC + risco de
 * bundle do design.md). Usado por facturas, recibos, notas e relatórios.
 *
 * Fornece: folha de estilos partilhada, cabeçalho (emitente/NUIT), rodapé
 * paginado, e primitivos de tabela com `tabular-nums` (alinhamento numérico).
 */
import 'server-only';
import React from 'react';
import { Page, View, Text, StyleSheet, Document } from '@react-pdf/renderer';
import { PDF_THEME } from './theme';

export const estilos = StyleSheet.create({
  pagina: {
    paddingTop: PDF_THEME.espaco.pagina,
    paddingBottom: PDF_THEME.espaco.pagina + 20,
    paddingHorizontal: PDF_THEME.espaco.pagina,
    fontSize: PDF_THEME.fonte.base,
    color: PDF_THEME.cor.tinta,
    fontFamily: 'Helvetica',
  },
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: PDF_THEME.cor.marca,
    paddingBottom: 8,
  },
  emitenteNome: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PDF_THEME.cor.marca },
  suave: { color: PDF_THEME.cor.suave },
  pequena: { fontSize: PDF_THEME.fonte.pequena },
  tituloDoc: { fontSize: PDF_THEME.fonte.titulo, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  seccao: {
    fontSize: PDF_THEME.fonte.seccao,
    fontFamily: 'Helvetica-Bold',
    marginTop: 12,
    marginBottom: 6,
  },
  caixasTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  caixa: {
    flex: 1,
    borderWidth: 1,
    borderColor: PDF_THEME.cor.linha,
    borderRadius: 4,
    padding: 8,
  },
  caixaTitulo: {
    fontSize: PDF_THEME.fonte.pequena,
    fontFamily: 'Helvetica-Bold',
    color: PDF_THEME.cor.suave,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  // Tabela
  tabelaCabecalho: {
    flexDirection: 'row',
    backgroundColor: PDF_THEME.cor.fundoCabecalhoTabela,
    borderBottomWidth: 1,
    borderBottomColor: PDF_THEME.cor.linha,
    paddingVertical: 4,
    paddingHorizontal: 3,
  },
  tabelaLinha: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PDF_THEME.cor.linha,
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  celulaCabecalho: { fontFamily: 'Helvetica-Bold', fontSize: PDF_THEME.fonte.pequena },
  celula: { fontSize: PDF_THEME.fonte.pequena },
  num: { textAlign: 'right' },
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
  totaisBloco: { marginTop: 10, alignSelf: 'flex-end', width: 220 },
  totaisLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totaisGrande: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: PDF_THEME.cor.tinta,
    marginTop: 2,
  },
  totaisGrandeTxt: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
});

export interface EmitentePdf {
  nome: string;
  nuit: string;
  morada: string | null;
  contacto: string | null;
}

export function CabecalhoDocumento({
  emitente,
  designacao,
  numero,
}: {
  emitente: EmitentePdf;
  designacao: string;
  numero: string;
}) {
  return (
    <View style={estilos.cabecalho}>
      <View>
        <Text style={estilos.emitenteNome}>{emitente.nome}</Text>
        <Text style={[estilos.pequena, estilos.suave]}>NUIT: {emitente.nuit}</Text>
        {emitente.morada ? <Text style={[estilos.pequena, estilos.suave]}>{emitente.morada}</Text> : null}
        {emitente.contacto ? <Text style={[estilos.pequena, estilos.suave]}>{emitente.contacto}</Text> : null}
      </View>
      <View>
        <Text style={estilos.tituloDoc}>{designacao}</Text>
        <Text style={[estilos.pequena, estilos.suave, { textAlign: 'right' }]}>Nº {numero}</Text>
      </View>
    </View>
  );
}

export function RodapeDocumento({ mencoes }: { mencoes: string[] }) {
  return (
    <View style={estilos.rodape} fixed>
      <Text>{mencoes.join('  ·  ')}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

export function PaginaDocumento({
  children,
  rodape,
}: {
  children: React.ReactNode;
  rodape?: string[];
}) {
  return (
    <Page size="A4" style={estilos.pagina}>
      {children}
      {rodape && rodape.length > 0 ? <RodapeDocumento mencoes={rodape} /> : null}
    </Page>
  );
}

export { Document };
