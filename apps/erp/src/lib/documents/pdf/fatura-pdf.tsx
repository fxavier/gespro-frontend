/**
 * Documento fiscal Factura (MZ) em PDF — composição sobre o layout base.
 * RUNTIME NODE APENAS. Consome `DocumentoFiscalModel` (valores REFLECTIDOS,
 * nunca recalculados). Reutilizado por recibo/nota/proforma (mesma estrutura).
 */
import 'server-only';
import React from 'react';
import { View, Text, renderToBuffer } from '@react-pdf/renderer';
import type { DocumentoFiscalModel } from '../fatura-model';
import {
  Document,
  PaginaDocumento,
  CabecalhoDocumento,
  estilos,
} from './base';

const COL = {
  descricao: { flex: 3 },
  qtd: { flex: 1 },
  preco: { flex: 1.2 },
  desc: { flex: 1 },
  taxa: { flex: 0.9 },
  incidencia: { flex: 1.2 },
  iva: { flex: 1.2 },
  total: { flex: 1.3 },
} as const;

function TabelaLinhas({ model }: { model: DocumentoFiscalModel }) {
  return (
    <View>
      <View style={estilos.tabelaCabecalho}>
        <Text style={[estilos.celulaCabecalho, COL.descricao]}>Descrição</Text>
        <Text style={[estilos.celulaCabecalho, COL.qtd, estilos.num]}>Qtd.</Text>
        <Text style={[estilos.celulaCabecalho, COL.preco, estilos.num]}>Preço</Text>
        <Text style={[estilos.celulaCabecalho, COL.desc, estilos.num]}>Desc.</Text>
        <Text style={[estilos.celulaCabecalho, COL.taxa, estilos.num]}>IVA</Text>
        <Text style={[estilos.celulaCabecalho, COL.incidencia, estilos.num]}>Incid.</Text>
        <Text style={[estilos.celulaCabecalho, COL.iva, estilos.num]}>Valor IVA</Text>
        <Text style={[estilos.celulaCabecalho, COL.total, estilos.num]}>Total</Text>
      </View>
      {model.linhas.map((l, i) => (
        <View style={estilos.tabelaLinha} key={i} wrap={false}>
          <Text style={[estilos.celula, COL.descricao]}>{l.descricao}</Text>
          <Text style={[estilos.celula, COL.qtd, estilos.num]}>{l.quantidade}</Text>
          <Text style={[estilos.celula, COL.preco, estilos.num]}>{l.precoUnitario}</Text>
          <Text style={[estilos.celula, COL.desc, estilos.num]}>{l.desconto}</Text>
          <Text style={[estilos.celula, COL.taxa, estilos.num]}>{l.taxaIvaPercent}</Text>
          <Text style={[estilos.celula, COL.incidencia, estilos.num]}>{l.incidencia}</Text>
          <Text style={[estilos.celula, COL.iva, estilos.num]}>{l.iva}</Text>
          <Text style={[estilos.celula, COL.total, estilos.num]}>{l.total}</Text>
        </View>
      ))}
    </View>
  );
}

export function FaturaDocument({ model }: { model: DocumentoFiscalModel }) {
  return (
    <Document
      title={`${model.designacao} ${model.numero}`}
      author={model.emitente.nome}
      creator="GestPro"
      producer="GestPro"
    >
      <PaginaDocumento rodape={model.mencoesLegais}>
        <CabecalhoDocumento
          emitente={model.emitente}
          designacao={model.designacao}
          numero={model.numero}
        />

        <View style={estilos.caixasTopo}>
          <View style={estilos.caixa}>
            <Text style={estilos.caixaTitulo}>Adquirente</Text>
            <Text>{model.adquirente.nome}</Text>
            <Text style={estilos.pequena}>NUIT: {model.adquirente.nuit}</Text>
            {model.adquirente.morada ? (
              <Text style={[estilos.pequena, estilos.suave]}>{model.adquirente.morada}</Text>
            ) : null}
          </View>
          <View style={estilos.caixa}>
            <Text style={estilos.caixaTitulo}>Documento</Text>
            <Text style={estilos.pequena}>Data de emissão: {model.dataEmissao}</Text>
            {model.dataVencimento ? (
              <Text style={estilos.pequena}>Vencimento: {model.dataVencimento}</Text>
            ) : null}
            <Text style={estilos.pequena}>Moeda: {model.moeda}</Text>
            <Text style={estilos.pequena}>Regime IVA: {model.emitente.regimeIva}</Text>
          </View>
        </View>

        <Text style={estilos.seccao}>Linhas</Text>
        <TabelaLinhas model={model} />

        {/* Resumo de IVA por taxa */}
        <Text style={estilos.seccao}>Resumo de IVA</Text>
        <View style={estilos.tabelaCabecalho}>
          <Text style={[estilos.celulaCabecalho, { flex: 1 }]}>Taxa</Text>
          <Text style={[estilos.celulaCabecalho, { flex: 2 }, estilos.num]}>Incidência</Text>
          <Text style={[estilos.celulaCabecalho, { flex: 2 }, estilos.num]}>Valor IVA</Text>
        </View>
        {model.resumoIva.map((r, i) => (
          <View style={estilos.tabelaLinha} key={i}>
            <Text style={[estilos.celula, { flex: 1 }]}>{r.taxaPercent}</Text>
            <Text style={[estilos.celula, { flex: 2 }, estilos.num]}>{r.incidencia}</Text>
            <Text style={[estilos.celula, { flex: 2 }, estilos.num]}>{r.iva}</Text>
          </View>
        ))}

        {/* Totais (reflectidos) */}
        <View style={estilos.totaisBloco}>
          <View style={estilos.totaisLinha}>
            <Text>Subtotal (incidência)</Text>
            <Text>{`${model.moeda} ${model.totais.subtotal}`}</Text>
          </View>
          <View style={estilos.totaisLinha}>
            <Text>IVA</Text>
            <Text>{`${model.moeda} ${model.totais.ivaTotal}`}</Text>
          </View>
          <View style={estilos.totaisGrande}>
            <Text style={estilos.totaisGrandeTxt}>Total</Text>
            <Text style={estilos.totaisGrandeTxt}>{`${model.moeda} ${model.totais.total}`}</Text>
          </View>
          {model.totais.totalPago != null ? (
            <View style={estilos.totaisLinha}>
              <Text style={estilos.suave}>Pago</Text>
              <Text style={estilos.suave}>{`${model.moeda} ${model.totais.totalPago}`}</Text>
            </View>
          ) : null}
        </View>

        {model.observacoes ? (
          <View style={{ marginTop: 12 }}>
            <Text style={estilos.caixaTitulo}>Observações</Text>
            <Text style={estilos.pequena}>{model.observacoes}</Text>
          </View>
        ) : null}
      </PaginaDocumento>
    </Document>
  );
}

/** Renderiza a factura para bytes PDF (Node). */
export async function renderFaturaPdf(model: DocumentoFiscalModel): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<FaturaDocument model={model} />);
  return new Uint8Array(buffer);
}
