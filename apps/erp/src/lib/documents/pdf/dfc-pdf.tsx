/**
 * Demonstração de Fluxos de Caixa (método indirecto) em PDF — nó `export` do
 * grafo `dfc`, ticket 9.1 (spec 22 · WS-2 · ADR-0037 §7 com a Emenda
 * 2026-09-25, E4: exportação só em PDF).
 *
 * RUNTIME NODE APENAS (motor do ADR-0005). Compõe sobre `base.tsx` e usa as
 * fontes-padrão dele (`Helvetica`/`Helvetica-Bold`): nada de `Font.register`.
 * Uma fonte embebida passaria o texto a ids de glifo — o PDF ficava bonito e
 * impossível de verificar (ver o oráculo da rota, `pdf-texto.ts`).
 *
 * O documento REFLECTE o `DFC` que o serviço devolveu; não recalcula nada. O
 * serviço já garantiu a articulação (I6) — se ela falhasse, este documento
 * nunca era chamado.
 *
 *  - Colunas N (`atual`) e N-1 (`homologo`, E3). Sem exercício anterior, a
 *    coluna N-1 mostra «—» em todas as linhas: nunca um N-1 inventado.
 *  - «Mapeamento por validar» só quando `versao.estado === 'PENDING'`;
 *    «Provisório» só quando `provisorio`. Em mais nenhum sítio do documento
 *    aparecem estas palavras — a sua ausência também é informação.
 *  - O número da versão do mapeamento vai sempre (E1).
 *  - Dinheiro: `Decimal.toFixed(2)` → `formatMZN`; duas casas sempre.
 *  - Datas: `format-date.ts` (fuso fixo Africa/Maputo).
 */
import 'server-only';
import React from 'react';
import { View, Text, renderToBuffer } from '@react-pdf/renderer';
import { Prisma } from '@prisma/client';
import type { ColunaDFC, DFC, LinhaRubricaDFC, RubricaResumo, SeccaoDFC } from '@/server/services/financas/dfc.interface';
import { formatMZN } from '@/lib/format-currency';
import { formatarData, formatarDataHora } from '@/lib/format-date';
import { Document, PaginaDocumento, estilos } from './base';
import { PDF_THEME } from './theme';

const SEM_VALOR = '—';
const ZERO = new Prisma.Decimal(0);

type AtividadeSeccao = SeccaoDFC['atividade'];

const TITULO_SECCAO: Record<AtividadeSeccao, { titulo: string; total: string }> = {
  OPERACIONAL: {
    titulo: 'Actividades operacionais',
    total: 'Fluxo de caixa das actividades operacionais',
  },
  INVESTIMENTO: {
    titulo: 'Actividades de investimento',
    total: 'Fluxo de caixa das actividades de investimento',
  },
  FINANCIAMENTO: {
    titulo: 'Actividades de financiamento',
    total: 'Fluxo de caixa das actividades de financiamento',
  },
};

const CHAVE_SECCAO = {
  OPERACIONAL: 'operacional',
  INVESTIMENTO: 'investimento',
  FINANCIAMENTO: 'financiamento',
} as const satisfies Record<AtividadeSeccao, 'operacional' | 'investimento' | 'financiamento'>;

const ORDEM_SECCOES: AtividadeSeccao[] = ['OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO'];

/** Dinheiro para o documento: `Decimal` → 2 casas → `formatMZN`. Nunca `Decimal.toString()` (perde o zero final). */
function mzn(v: Prisma.Decimal): string {
  return formatMZN(v.toFixed(2));
}

const COL = {
  rotulo: { flex: 3.2 },
  valor: { flex: 1.3 },
} as const;

const local = {
  titulo: { fontSize: PDF_THEME.fonte.titulo, fontFamily: 'Helvetica-Bold', color: PDF_THEME.cor.marca },
  subtitulo: { fontSize: PDF_THEME.fonte.base, color: PDF_THEME.cor.suave, marginTop: 2 },
  cabecalho: {
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: PDF_THEME.cor.marca,
    paddingBottom: 8,
  },
  meta: { fontSize: PDF_THEME.fonte.pequena, marginTop: 2 },
  faixa: {
    borderWidth: 1,
    borderColor: PDF_THEME.cor.tinta,
    borderRadius: 3,
    padding: 6,
    marginBottom: 6,
  },
  faixaTitulo: { fontFamily: 'Helvetica-Bold', fontSize: PDF_THEME.fonte.base },
  tituloSeccao: {
    fontFamily: 'Helvetica-Bold',
    fontSize: PDF_THEME.fonte.pequena,
    color: PDF_THEME.cor.suave,
    paddingTop: 8,
    paddingBottom: 2,
    paddingHorizontal: 3,
  },
  recuo: { paddingLeft: 12 },
  forte: { fontFamily: 'Helvetica-Bold' },
  destaque: { backgroundColor: PDF_THEME.cor.fundoCabecalhoTabela },
} as const;

function intervaloDe(c: ColunaDFC): string {
  const codigos =
    c.periodoInicio.codigo === c.periodoFim.codigo
      ? `Período ${c.periodoInicio.codigo}`
      : `Períodos ${c.periodoInicio.codigo} a ${c.periodoFim.codigo}`;
  return `${codigos} (${formatarData(c.periodoInicio.dataInicio)} a ${formatarData(c.periodoFim.dataFim)})`;
}

/** Uma linha de duas colunas. `n1 === null` ⇒ não há exercício anterior ⇒ «—». */
function Linha({
  rotulo,
  n,
  n1,
  recuo = false,
  forte = false,
  destaque = false,
}: {
  rotulo: string;
  n: Prisma.Decimal | null;
  n1: Prisma.Decimal | null;
  recuo?: boolean;
  forte?: boolean;
  destaque?: boolean;
}) {
  const texto = [estilos.celula, ...(forte || destaque ? [local.forte] : [])];
  return (
    <View style={[estilos.tabelaLinha, ...(destaque ? [local.destaque] : [])]} wrap={false}>
      <Text style={[...texto, COL.rotulo, ...(recuo ? [local.recuo] : [])]}>{rotulo}</Text>
      <Text style={[...texto, COL.valor, estilos.num]}>{n ? mzn(n) : SEM_VALOR}</Text>
      <Text style={[...texto, COL.valor, estilos.num]}>{n1 ? mzn(n1) : SEM_VALOR}</Text>
    </View>
  );
}

/**
 * As rubricas de uma secção nas duas colunas. Uma rubrica só aparece numa
 * coluna quando teve contas com movimento nesse intervalo; na outra coluna
 * vale zero (havendo coluna) — não é «—», que fica reservado à ausência de
 * exercício anterior.
 */
function rubricasDaSeccao(n: SeccaoDFC, n1: SeccaoDFC | null) {
  const porId = new Map<string, { rubrica: RubricaResumo; n?: LinhaRubricaDFC; n1?: LinhaRubricaDFC }>();
  for (const l of n.rubricas) porId.set(l.rubrica.id, { rubrica: l.rubrica, n: l });
  for (const l of n1?.rubricas ?? []) {
    const e = porId.get(l.rubrica.id);
    if (e) e.n1 = l;
    else porId.set(l.rubrica.id, { rubrica: l.rubrica, n1: l });
  }
  return [...porId.values()].sort(
    (a, b) => a.rubrica.ordem - b.rubrica.ordem || a.rubrica.codigo.localeCompare(b.rubrica.codigo),
  );
}

function Seccao({ atividade, dfc }: { atividade: AtividadeSeccao; dfc: DFC }) {
  const t = TITULO_SECCAO[atividade];
  const chave = CHAVE_SECCAO[atividade];
  const n = dfc.atual.seccoes[chave];
  const h = dfc.homologo;
  const n1 = h ? h.seccoes[chave] : null;
  const linhas = rubricasDaSeccao(n, n1);
  const operacional = atividade === 'OPERACIONAL';

  return (
    <View>
      <Text style={local.tituloSeccao}>{t.titulo}</Text>
      {operacional ? (
        <Linha
          rotulo="Resultado líquido do período"
          n={dfc.atual.seccoes.resultadoLiquido}
          n1={h ? h.seccoes.resultadoLiquido : null}
          recuo
        />
      ) : null}
      {linhas.map((l) => (
        <Linha
          key={l.rubrica.id}
          rotulo={`${l.rubrica.codigo} · ${l.rubrica.designacao}`}
          n={l.n?.valor ?? ZERO}
          n1={h ? (l.n1?.valor ?? ZERO) : null}
          recuo
        />
      ))}
      {linhas.length === 0 && !operacional ? (
        <View style={estilos.tabelaLinha}>
          <Text style={[estilos.celula, estilos.suave, local.recuo]}>Sem movimentos nesta actividade.</Text>
        </View>
      ) : null}
      <Linha rotulo={t.total} n={n.total} n1={n1 ? n1.total : null} forte />
    </View>
  );
}

export function DfcDocument({ dfc, geradoEm }: { dfc: DFC; geradoEm: Date }) {
  const { atual, homologo, versao, provisorio, avisos } = dfc;
  const porValidar = versao.estado === 'PENDING';

  return (
    <Document
      title={`Demonstração de Fluxos de Caixa ${atual.periodoInicio.codigo} a ${atual.periodoFim.codigo}`}
      creator="GestPro"
      producer="GestPro"
    >
      <PaginaDocumento
        rodape={[
          `Mapeamento v${versao.numero}`,
          `Gerado em ${formatarDataHora(geradoEm)}`,
          'Método indirecto · valores em MZN',
        ]}
      >
        <View style={local.cabecalho}>
          <Text style={local.titulo}>Demonstração de Fluxos de Caixa</Text>
          <Text style={local.subtitulo}>
            Método indirecto — actividades operacionais, de investimento e de financiamento
          </Text>
          <Text style={local.meta}>{intervaloDe(atual)}</Text>
          <Text style={local.meta}>
            {homologo ? `Comparativo N-1: ${intervaloDe(homologo)}` : 'Comparativo N-1: sem exercício anterior (—)'}
          </Text>
          <Text style={local.meta}>
            {`Versão do mapeamento: ${versao.numero} (${porValidar ? 'por validar' : 'validada'})`}
          </Text>
        </View>

        {provisorio ? (
          <View style={local.faixa}>
            <Text style={local.faixaTitulo}>Provisório</Text>
            <Text style={estilos.pequena}>
              O intervalo inclui períodos contabilísticos abertos: os valores podem ainda mudar.
            </Text>
          </View>
        ) : null}

        {porValidar ? (
          <View style={local.faixa}>
            <Text style={local.faixaTitulo}>{`Mapeamento por validar · versão ${versao.numero}`}</Text>
            <Text style={estilos.pequena}>
              A classificação das contas nas actividades desta demonstração ainda não foi validada por um
              contabilista. Os totais articulam; a atribuição de cada conta a uma actividade pode mudar.
            </Text>
          </View>
        ) : null}

        {avisos.length > 0 ? (
          <View style={{ marginBottom: 6 }}>
            <Text style={estilos.caixaTitulo}>Avisos da configuração de caixa</Text>
            {avisos.map((a) => (
              <Text key={`${a.codigo}-${a.conta.id}`} style={estilos.pequena}>{`• ${a.mensagem}`}</Text>
            ))}
          </View>
        ) : null}

        <View style={estilos.tabelaCabecalho}>
          <Text style={[estilos.celulaCabecalho, COL.rotulo]}>Método indirecto</Text>
          <Text style={[estilos.celulaCabecalho, COL.valor, estilos.num]}>{`N · Exercício ${atual.exercicio.codigo}`}</Text>
          <Text style={[estilos.celulaCabecalho, COL.valor, estilos.num]}>
            {homologo ? `N-1 · Exercício ${homologo.exercicio.codigo}` : 'N-1'}
          </Text>
        </View>

        {ORDEM_SECCOES.map((a) => (
          <Seccao key={a} atividade={a} dfc={dfc} />
        ))}

        <Linha
          rotulo="Variação de caixa e equivalentes (actividades)"
          n={atual.seccoes.somaAtividades}
          n1={homologo ? homologo.seccoes.somaAtividades : null}
          destaque
        />

        <Text style={estilos.seccao}>Articulação</Text>
        <Linha
          rotulo="Caixa e equivalentes no início do período"
          n={atual.caixaInicial}
          n1={homologo ? homologo.caixaInicial : null}
        />
        <Linha
          rotulo="(+) Fluxo das actividades"
          n={atual.seccoes.somaAtividades}
          n1={homologo ? homologo.seccoes.somaAtividades : null}
        />
        <Linha
          rotulo="Caixa e equivalentes no fim do período"
          n={atual.caixaFinal}
          n1={homologo ? homologo.caixaFinal : null}
          forte
        />
      </PaginaDocumento>
    </Document>
  );
}

/** Renderiza a DFC para bytes PDF (Node). `geradoEm` é parâmetro: o documento não lê o relógio. */
export async function renderDfcPdf(dfc: DFC, geradoEm: Date): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<DfcDocument dfc={dfc} geradoEm={geradoEm} />);
  return new Uint8Array(buffer);
}
