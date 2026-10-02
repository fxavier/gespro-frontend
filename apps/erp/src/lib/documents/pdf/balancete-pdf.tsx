/**
 * Balancete de verificação em PDF, A4 horizontal (S6, issue #286; ADR-0040).
 *
 * RUNTIME NODE APENAS (motor do ADR-0005). Compõe sobre `base.tsx` com as fontes-padrão
 * (Helvetica/Helvetica-Bold), sem `Font.register` — como a DFC, para o texto continuar
 * verificável (`pdf-texto.ts`).
 *
 * O documento REFLECTE o balancete que a página mostra (as mesmas linhas, já
 * filtradas, e os totais do balancete completo); não recalcula nada além do
 * transporte entre páginas, que vem de `paginarBalancete`.
 *
 * A paginação é explícita — uma `<Page>` por página de `paginarBalancete` — para que
 * o «Transporte»/«A transportar» de cada página corresponda às linhas que ela tem.
 * Cada página leva o cabeçalho completo e o rodapé «Página x de N».
 */
import 'server-only';
import React from 'react';
import { View, Text, renderToBuffer } from '@react-pdf/renderer';
import type { Prisma } from '@prisma/client';
import type { TipoBalancete } from '@/lib/balancete-params';
import { paginarBalancete, somarLinhasQueContam, zeros } from '@/lib/documents/balancete-paginas';
import { formatNumero } from '@/lib/format-currency';
import { formatarDataHora } from '@/lib/format-date';
import type { LinhaHierarquica, TotaisBV } from '@/server/services/financas/balancete-verificacao';
import { Document, PaginaDocumento, estilos } from './base';
import { PDF_THEME } from './theme';

export interface DadosBalancetePdf {
  entidade: { nome: string; nuit: string };
  /** Código do exercício. */
  exercicio: string;
  periodoInicial: number;
  periodoFinal: number;
  incluir13: boolean;
  tipo: TipoBalancete;
  /** `descreverFiltros(p)`; '' ⇒ sem linha «Filtros». */
  filtros: string;
  /**
   * Há filtros que tiram linhas (classe, ci/cf, excluir, comSaldo, q): a última página
   * mostra «Total das linhas mostradas» e os totais passam a «Totais do balancete (sem filtros)».
   */
  filtrosTiramLinhas: boolean;
  /** As linhas mostradas (hierarquizadas e filtradas). */
  linhas: LinhaHierarquica[];
  /** Totais do balancete completo. */
  totais: TotaisBV;
  equilibrio: { movimento: boolean; acumulado: boolean; saldo: boolean };
}

export interface EmissaoBalancetePdf {
  em: Date;
  por: string;
}

/**
 * Linhas da tabela por página. A4 horizontal a 7 pt deixa ~495 pt úteis: o cabeçalho,
 * a linha de títulos, o transporte e, na última, as duas linhas de totais e as
 * igualdades cabem com folga. Código e descrição nunca partem linha (reticências), por
 * isso cada linha tem altura fixa e as páginas físicas são sempre as de «Página x de N».
 */
const LINHAS_POR_PAGINA = 24;

const SEM_VALOR = '—';

/** Como no ecrã: «—» para zero, senão `formatNumero`. */
function valor(d: Prisma.Decimal): string {
  return d.isZero() ? SEM_VALOR : formatNumero(d.toString());
}

type Chave = 'movD' | 'movC' | 'acumD' | 'acumC' | 'saldoDevedor' | 'saldoCredor';

function colunasValor(tipo: TipoBalancete): { chave: Chave; grupo: string; titulo: string }[] {
  return [
    ...(tipo !== 'ACUMULADO'
      ? [
          { chave: 'movD' as const, grupo: 'Movimento', titulo: 'Débito' },
          { chave: 'movC' as const, grupo: 'Movimento', titulo: 'Crédito' },
        ]
      : []),
    ...(tipo !== 'PERIODO'
      ? [
          { chave: 'acumD' as const, grupo: 'Acumulado', titulo: 'Débito' },
          { chave: 'acumC' as const, grupo: 'Acumulado', titulo: 'Crédito' },
        ]
      : []),
    { chave: 'saldoDevedor', grupo: 'Saldo', titulo: 'Devedor' },
    { chave: 'saldoCredor', grupo: 'Saldo', titulo: 'Credor' },
  ];
}

const COL = {
  conta: { width: 52 },
  descricao: { flex: 1 },
  valor: { width: 78 },
} as const;

const local = {
  cabecalho: {
    marginBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: PDF_THEME.cor.marca,
      paddingBottom: 6,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    /** Blocos do cabeçalho: o da esquerda ocupa o que sobra; o da direita tem largura fixa. */
    cabecalhoEsquerda: { flexGrow: 1, flexShrink: 1, flexBasis: 0, marginRight: 16 },
    cabecalhoDireita: { width: 300, flexShrink: 0 },
    entidade: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PDF_THEME.cor.marca },
  titulo: { fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  meta: { fontSize: PDF_THEME.fonte.pequena, color: PDF_THEME.cor.suave },
  metaDireita: { fontSize: PDF_THEME.fonte.pequena, color: PDF_THEME.cor.suave, textAlign: 'right' },
  celula: { fontSize: 7 },
  umaLinha: { maxLines: 1, textOverflow: 'ellipsis' },
  forte: { fontFamily: 'Helvetica-Bold' },
  suave: { color: PDF_THEME.cor.suave },
  destaque: { backgroundColor: PDF_THEME.cor.fundoCabecalhoTabela },
  linha: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: PDF_THEME.cor.linha,
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  igualdades: { flexDirection: 'row', gap: 16, marginTop: 8, fontSize: PDF_THEME.fonte.pequena },
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

function Cabecalho({ dados, emissao }: { dados: DadosBalancetePdf; emissao: EmissaoBalancetePdf }) {
  const periodos = `Exercício ${dados.exercicio} — períodos ${dados.periodoInicial}..${dados.periodoFinal}`;
  return (
    <View style={local.cabecalho}>
      <View style={local.cabecalhoEsquerda}>
        <Text style={[local.entidade, local.umaLinha]}>{dados.entidade.nome}</Text>
        <Text style={local.meta}>{`NUIT: ${dados.entidade.nuit}`}</Text>
        {dados.filtros ? <Text style={[local.meta, local.umaLinha]}>{`Filtros: ${dados.filtros}`}</Text> : null}
      </View>
      <View style={local.cabecalhoDireita}>
        <Text style={local.titulo}>Balancete de verificação</Text>
        <Text style={local.metaDireita}>
          {dados.incluir13 ? `${periodos} — com período 13` : periodos}
        </Text>
        <Text style={local.metaDireita}>{`Emitido em ${formatarDataHora(emissao.em)} (Maputo)`}</Text>
        <Text style={[local.metaDireita, local.umaLinha]}>{`por ${emissao.por}`}</Text>
      </View>
    </View>
  );
}

function TitulosTabela({ tipo }: { tipo: TipoBalancete }) {
  return (
    <View style={estilos.tabelaCabecalho} wrap={false}>
      <Text style={[estilos.celulaCabecalho, COL.conta]}>Conta</Text>
      <Text style={[estilos.celulaCabecalho, COL.descricao]}>Descrição</Text>
      {colunasValor(tipo).map((c) => (
        <Text key={c.chave} style={[estilos.celulaCabecalho, COL.valor, estilos.num]}>
          {`${c.grupo} ${c.titulo}`}
        </Text>
      ))}
    </View>
  );
}

/** Uma linha da tabela: código, descrição (indentada) e os valores visíveis. */
function Linha({
  conta,
  descricao,
  valores,
  tipo,
  profundidade = 0,
  forte = false,
  suave = false,
  destaque = false,
}: {
  conta: string;
  descricao: string;
  valores: Pick<TotaisBV, Chave>;
  tipo: TipoBalancete;
  profundidade?: number;
  forte?: boolean;
  suave?: boolean;
  destaque?: boolean;
}) {
  const texto = [local.celula, ...(forte ? [local.forte] : []), ...(suave ? [local.suave] : [])];
  return (
    <View style={[local.linha, ...(destaque ? [local.destaque] : [])]} wrap={false}>
      <Text style={[...texto, COL.conta, local.umaLinha]}>{conta}</Text>
      <Text style={[...texto, COL.descricao, local.umaLinha, { paddingLeft: profundidade * 8 }]}>{descricao}</Text>
      {colunasValor(tipo).map((c) => (
        <Text key={c.chave} style={[...texto, COL.valor, estilos.num]}>
          {valor(valores[c.chave])}
        </Text>
      ))}
    </View>
  );
}

function LinhaBalancete({ l, tipo }: { l: LinhaHierarquica; tipo: TipoBalancete }) {
  if (l.tipo === 'SUBTOTAL_CLASSE') {
    return <Linha conta="" descricao={`Total da classe ${l.classe.slice(-1)}`} valores={l} tipo={tipo} forte destaque />;
  }
  if (l.tipo === 'SINTETICA') {
    return (
      <Linha
        conta=""
        descricao="Resultados de exercícios anteriores por encerrar (implícita)"
        valores={l}
        tipo={tipo}
        profundidade={l.profundidade}
      />
    );
  }
  return (
    <Linha
      conta={l.conta!.codigo}
      descricao={l.conta!.nome}
      valores={l}
      tipo={tipo}
      profundidade={l.profundidade}
      forte={l.agregadora}
      suave={l.contexto === true}
    />
  );
}

const igualdade = (rotulo: string, ok: boolean) => `${rotulo}: ${ok ? 'equilibrado' : 'desequilibrado'}`;

export function BalanceteDocument({ dados, emissao }: { dados: DadosBalancetePdf; emissao: EmissaoBalancetePdf }) {
  const paginas = paginarBalancete(dados.linhas, LINHAS_POR_PAGINA);
  // Um balancete sem linhas (filtros que escondem tudo) ainda tem uma página: cabeçalho e Totais.
  const folhas = paginas.length > 0 ? paginas : [{ linhas: [], transporte: null, aTransportar: null }];
  const total = folhas.length;
  const { tipo } = dados;

  return (
    <Document
      title={`Balancete de verificação ${dados.exercicio} ${dados.periodoInicial}..${dados.periodoFinal}`}
      creator="GestPro"
      producer="GestPro"
    >
      {folhas.map((pg, i) => (
        <PaginaDocumento key={i} orientation="landscape">
          <Cabecalho dados={dados} emissao={emissao} />
          <TitulosTabela tipo={tipo} />
          {pg.transporte ? <Linha conta="" descricao="Transporte" valores={pg.transporte} tipo={tipo} forte /> : null}
          {pg.linhas.map((l, j) => (
            <LinhaBalancete key={j} l={l} tipo={tipo} />
          ))}
          {pg.aTransportar ? (
            <Linha conta="" descricao="A transportar" valores={pg.aTransportar} tipo={tipo} forte />
          ) : null}
          {i === total - 1 ? (
            <View>
              {dados.filtrosTiramLinhas ? (
                <Linha
                  conta=""
                  descricao="Total das linhas mostradas"
                  valores={somarLinhasQueContam(pg.transporte ?? zeros(), pg.linhas)}
                  tipo={tipo}
                  forte
                />
              ) : null}
              <Linha
                conta=""
                descricao={dados.filtrosTiramLinhas ? 'Totais do balancete (sem filtros)' : 'Totais'}
                valores={dados.totais}
                tipo={tipo}
                forte
                destaque
              />
              <View style={local.igualdades}>
                <Text>{igualdade('Movimento', dados.equilibrio.movimento)}</Text>
                <Text>{igualdade('Acumulado', dados.equilibrio.acumulado)}</Text>
                <Text>{igualdade('Saldos', dados.equilibrio.saldo)}</Text>
              </View>
            </View>
          ) : null}
          <View style={local.rodape} fixed>
            <Text>Balancete de verificação · valores em MZN</Text>
            <Text>{`Página ${i + 1} de ${total}`}</Text>
          </View>
        </PaginaDocumento>
      ))}
    </Document>
  );
}

/** Renderiza o balancete para bytes PDF (Node). A emissão é parâmetro: o documento não lê o relógio. */
export async function renderBalancetePdf(dados: DadosBalancetePdf, emissao: EmissaoBalancetePdf): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<BalanceteDocument dados={dados} emissao={emissao} />);
  return new Uint8Array(buffer);
}
