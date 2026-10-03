/**
 * Balancete de verificação — parâmetros do URL e dataset de exportação.
 *
 * Módulo puro e client-safe (sem `server-only`, sem I/O), partilhado pela página
 * `/contabilidade/balancete` e pela rota `GET /api/contabilidade/balancete/export`:
 * as duas lêem o URL pela MESMA regra, por isso o ficheiro exportado é o
 * balancete que o utilizador está a ver (ADR-0040; S5, issue #285).
 */
import type { ClassePGC } from '@prisma/client';
import { codigoContaPGCValido, FiltroBalanceteVerificacaoSchema } from '@/lib/validations/contabilidade';
import type { Column, Dataset, Row } from '@/lib/reporting';
import type {
  FiltrosBalancete,
  LinhaHierarquica,
  TotaisBV,
} from '@/server/services/financas/balancete-verificacao';

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

export type TipoBalancete = 'PERIODO' | 'ACUMULADO' | 'AMBOS';

export interface ExercicioBalancete {
  id: string;
  codigo: string;
  dataInicio: Date;
  dataFim: Date;
}

export interface ParametrosBalancete<E extends ExercicioBalancete = ExercicioBalancete> {
  exercicio: E;
  /** Código pedido em `?exercicio=` que não existe (a página avisa e mostra o corrente). */
  codigoPedidoNaoEncontrado: string | null;
  /** O que vai ao serviço — períodos já normalizados (p13, tecto 12, inicial ≤ final). */
  filtroServico: { exercicioId: string; periodoInicial: number; periodoFinal: number; incluir13: boolean };
  opcoesHierarquia: { nivelMaximo?: number; apenasRazao?: boolean; incluirSemMovimento?: boolean };
  filtros: FiltrosBalancete;
  tipo: TipoBalancete;
}

type ParametrosEntrada = URLSearchParams | Record<string, string | string[] | undefined>;

/** Primeiro valor de um parâmetro (o Next entrega `string[]` quando se repete). */
function lerUm(params: ParametrosEntrada, chave: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(chave) ?? undefined;
  const v = params[chave];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Lê os parâmetros do balancete do URL. Valores inválidos são ignorados, nunca
 * dão erro:
 * - exercício: o pedido; senão o que contém «agora»; senão o primeiro da lista;
 * - períodos pelo `FiltroBalanceteVerificacaoSchema` (se falhar, 1..mesAtual sem p13);
 *   depois final ≤ 12 sem p13, e inicial ≤ final;
 * - nivel 1..7; razao/zeradas/comSaldo só com '1'; ci/cf/excluir códigos PGC válidos;
 *   classe 1..8; q aparado e cortado a 100; tipo periodo|acumulado, o resto é ambos.
 */
/**
 * Selecciona o exercício corrente da lista: o pedido pelo código, senão o que
 * contém «agora», senão o primeiro da lista. Pré-condição: exercicios.length > 0.
 */
export function exercicioCorrente<E extends ExercicioBalancete>(
  exercicios: E[],
  codigoPedido?: string | null,
): E {
  const agora = new Date();
  return (
    (codigoPedido ? exercicios.find((e) => e.codigo === codigoPedido) : undefined) ??
    exercicios.find((e) => e.dataInicio <= agora && agora <= e.dataFim) ??
    exercicios[0]!
  );
}

export function lerParametrosBalancete<E extends ExercicioBalancete>(
  params: ParametrosEntrada,
  contexto: { exercicios: E[]; mesAtual: number },
): ParametrosBalancete<E> | { semExercicio: true } {
  const { exercicios, mesAtual } = contexto;
  if (exercicios.length === 0) return { semExercicio: true };
  const p = (chave: string) => lerUm(params, chave);
  const texto = (chave: string) => (p(chave) ?? '').trim();

  // Exercício: pedido → corrente → primeiro.
  const pedido = p('exercicio');
  const codigoPedido = pedido ? pedido : null;
  const exercicio = exercicioCorrente(exercicios, codigoPedido);

  // Períodos.
  const lido = FiltroBalanceteVerificacaoSchema.safeParse({
    exercicioId: exercicio.id,
    periodoInicial: p('de'),
    periodoFinal: p('ate') ?? mesAtual,
    incluir13: p('p13') === '1',
  });
  const bruto = lido.success
    ? lido.data
    : { periodoInicial: 1, periodoFinal: mesAtual, incluir13: false };
  const periodoFinal = bruto.incluir13 ? bruto.periodoFinal : Math.min(bruto.periodoFinal, 12);
  const periodoInicial = Math.min(bruto.periodoInicial, periodoFinal);

  // Hierarquia.
  const nivel = parseInt(p('nivel') ?? '', 10);
  const opcoesHierarquia: ParametrosBalancete['opcoesHierarquia'] = {};
  if (!isNaN(nivel) && nivel >= 1 && nivel <= 7) opcoesHierarquia.nivelMaximo = nivel;
  if (p('razao') === '1') opcoesHierarquia.apenasRazao = true;
  if (p('zeradas') === '1') opcoesHierarquia.incluirSemMovimento = true;

  // Filtros de apresentação.
  const filtros: FiltrosBalancete = {};
  if (codigoContaPGCValido(texto('ci'))) filtros.contaInicial = texto('ci');
  if (codigoContaPGCValido(texto('cf'))) filtros.contaFinal = texto('cf');
  if (/^[1-8]$/.test(texto('classe'))) filtros.classe = `CLASSE_${texto('classe')}` as ClassePGC;
  const excluir = texto('excluir').split(',').map((c) => c.trim()).filter(codigoContaPGCValido);
  if (excluir.length > 0) filtros.excluir = excluir;
  if (p('comSaldo') === '1') filtros.apenasComSaldo = true;
  const q = texto('q').slice(0, 100);
  if (q) filtros.pesquisa = q;

  const tipo = texto('tipo');
  return {
    exercicio,
    codigoPedidoNaoEncontrado: codigoPedido !== null && exercicio.codigo !== codigoPedido ? codigoPedido : null,
    filtroServico: { exercicioId: exercicio.id, periodoInicial, periodoFinal, incluir13: bruto.incluir13 },
    opcoesHierarquia,
    filtros,
    tipo: tipo === 'periodo' ? 'PERIODO' : tipo === 'acumulado' ? 'ACUMULADO' : 'AMBOS',
  };
}

/**
 * Gera o href para a página de Razão Geral no modo por períodos.
 *
 * URL: `/contabilidade/razao-geral?contaId=<id>&exercicio=<código>&de=<n>&ate=<n>`
 * mais `&p13=1` apenas quando `intervalo.incluir13 === true`.
 * Parâmetros numéricos serializam como string sem zeros à esquerda («3», não «03»).
 */
export function hrefRazaoPeriodos(
  contaId: string,
  exercicioCodigo: string,
  intervalo: { periodoInicial: number; periodoFinal: number; incluir13: boolean },
): string {
  const params = new URLSearchParams({
    contaId,
    exercicio: exercicioCodigo,
    de: String(intervalo.periodoInicial),
    ate: String(intervalo.periodoFinal),
  });
  if (intervalo.incluir13) params.set('p13', '1');
  return `/contabilidade/razao-geral?${params.toString()}`;
}

/** Os parâmetros já normalizados, de volta para o URL (ligações de exportação). */
export function queryBalancete(p: ParametrosBalancete): URLSearchParams {
  const q = new URLSearchParams();
  q.set('exercicio', p.exercicio.codigo);
  q.set('de', String(p.filtroServico.periodoInicial));
  q.set('ate', String(p.filtroServico.periodoFinal));
  if (p.filtroServico.incluir13) q.set('p13', '1');
  const { nivelMaximo, apenasRazao, incluirSemMovimento } = p.opcoesHierarquia;
  if (nivelMaximo !== undefined) q.set('nivel', String(nivelMaximo));
  if (apenasRazao) q.set('razao', '1');
  const f = p.filtros;
  if (f.contaInicial) q.set('ci', f.contaInicial);
  if (f.contaFinal) q.set('cf', f.contaFinal);
  if (f.classe) q.set('classe', f.classe.slice(-1));
  if (f.excluir?.length) q.set('excluir', f.excluir.join(','));
  if (incluirSemMovimento) q.set('zeradas', '1');
  if (f.apenasComSaldo) q.set('comSaldo', '1');
  if (f.pesquisa) q.set('q', f.pesquisa);
  if (p.tipo !== 'AMBOS') q.set('tipo', p.tipo.toLowerCase());
  return q;
}

/**
 * Os filtros de apresentação activos, em texto legível («Classe 6; Excluir 121;
 * Pesquisa "caixa"; Por período»), ou '' sem filtros. Vai para o cabeçalho do
 * ficheiro exportado: quem somar as linhas percebe porque não dá os «Totais».
 */
export function descreverFiltros(p: Pick<ParametrosBalancete, 'opcoesHierarquia' | 'filtros' | 'tipo'>): string {
  const { nivelMaximo, apenasRazao, incluirSemMovimento } = p.opcoesHierarquia;
  const { contaInicial, contaFinal, classe, excluir, apenasComSaldo, pesquisa } = p.filtros;
  const partes: string[] = [];
  if (nivelMaximo !== undefined) partes.push(`Grau máximo ${nivelMaximo}`);
  if (apenasRazao) partes.push('Apenas contas de razão');
  if (incluirSemMovimento) partes.push('Inclui contas sem movimento e saldo');
  if (contaInicial && contaFinal) partes.push(`Contas ${contaInicial} a ${contaFinal}`);
  else if (contaInicial) partes.push(`Contas a partir de ${contaInicial}`);
  else if (contaFinal) partes.push(`Contas até ${contaFinal}`);
  if (classe) partes.push(`Classe ${classe.slice(-1)}`);
  if (excluir?.length) partes.push(`Excluir ${excluir.join(', ')}`);
  if (apenasComSaldo) partes.push('Apenas contas com saldo');
  if (pesquisa) partes.push(`Pesquisa "${pesquisa}"`);
  if (p.tipo === 'PERIODO') partes.push('Por período');
  if (p.tipo === 'ACUMULADO') partes.push('Acumulado');
  return partes.join('; ');
}

// ---------------------------------------------------------------------------
// Dataset de exportação (CSV/XLSX)
// ---------------------------------------------------------------------------

const COLUNAS_MOVIMENTO: Column[] = [
  { key: 'movD', header: 'Movimento Débito', type: 'decimal' },
  { key: 'movC', header: 'Movimento Crédito', type: 'decimal' },
];
const COLUNAS_ACUMULADO: Column[] = [
  { key: 'acumD', header: 'Acumulado Débito', type: 'decimal' },
  { key: 'acumC', header: 'Acumulado Crédito', type: 'decimal' },
];
const COLUNAS_SALDO: Column[] = [
  { key: 'saldoDevedor', header: 'Saldo Devedor', type: 'decimal' },
  { key: 'saldoCredor', header: 'Saldo Credor', type: 'decimal' },
];

type ValoresBalancete = Pick<TotaisBV, 'movD' | 'movC' | 'acumD' | 'acumC' | 'saldoDevedor' | 'saldoCredor'>;

const valoresDe = (v: ValoresBalancete): Row => ({
  movD: v.movD,
  movC: v.movC,
  acumD: v.acumD,
  acumC: v.acumC,
  saldoDevedor: v.saldoDevedor,
  saldoCredor: v.saldoCredor,
});

/**
 * O balancete mostrado como `Dataset`: as linhas já hierarquizadas e filtradas
 * (pela ordem da página; contexto incluído como «Conta»), sem as colunas do bloco
 * escondido pelo `tipo`, e no fim a linha «Total» com os totais do balancete
 * COMPLETO. Valores em `Decimal` — o CSV/XLSX escrevem-nos sem perda.
 */
export function datasetBalancete(
  resultado: { totais: TotaisBV; linhas: LinhaHierarquica[] },
  tipo: TipoBalancete,
  cabecalho: {
    exercicio: string;
    periodoInicial: number;
    periodoFinal: number;
    incluir13: boolean;
    /** Filtros activos em texto (`descreverFiltros`); vazio ou ausente = sem linha «Filtros». */
    filtros?: string;
  },
): Dataset {
  const { totais } = resultado;
  const colunas: Column[] = [
    { key: 'conta', header: 'Conta', type: 'text' },
    { key: 'descricao', header: 'Descrição', type: 'text' },
    { key: 'tipo', header: 'Tipo', type: 'text' },
    { key: 'nivel', header: 'Nível', type: 'integer' },
    ...(tipo !== 'ACUMULADO' ? COLUNAS_MOVIMENTO : []),
    ...(tipo !== 'PERIODO' ? COLUNAS_ACUMULADO : []),
    ...COLUNAS_SALDO,
  ];

  const linhas: Row[] = resultado.linhas.map((l) => {
    if (l.tipo === 'SUBTOTAL_CLASSE') {
      return { conta: '', descricao: `Total da classe ${l.classe.slice(-1)}`, tipo: 'Subtotal', nivel: null, ...valoresDe(l) };
    }
    if (l.tipo === 'SINTETICA') {
      return {
        conta: '',
        descricao: 'Resultados de exercícios anteriores por encerrar (implícita)',
        tipo: 'Sintética',
        nivel: l.nivel,
        ...valoresDe(l),
      };
    }
    return { conta: l.conta!.codigo, descricao: l.conta!.nome, tipo: 'Conta', nivel: l.nivel, ...valoresDe(l) };
  });
  linhas.push({ conta: '', descricao: 'Totais', tipo: 'Total', nivel: null, ...valoresDe(totais) });

  const { exercicio, periodoInicial, periodoFinal, incluir13, filtros } = cabecalho;
  const meta: Array<[string, string]> = [
    ['Balancete de verificação', `Exercício ${exercicio}`],
    ['Períodos', `${periodoInicial}..${periodoFinal}${incluir13 ? ' (inclui encerramento)' : ''}`],
  ];
  if (filtros) meta.push(['Filtros', filtros]);
  return {
    nome: `balancete-${exercicio}-${periodoInicial}-${periodoFinal}`,
    colunas,
    linhas,
    meta,
  };
}
