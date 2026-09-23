import 'server-only';
import { Prisma } from '@prisma/client';
import { calcularDiferencaResidual, calcularSaldoReconciliado, sinal, type Natureza } from './reconciliacao.model';

// ---------------------------------------------------------------------------
// Fecho da reconciliação (ADR-0038, nó RECONCILIATION) — lógica PURA.
// Dias civis em Africa/Maputo como inteiros aaaammdd: comparar dias, nunca
// instantes (o servidor corre em UTC; ver CLAUDE.md §Datas).
// ---------------------------------------------------------------------------

export interface MovimentoFecho {
  id: string;
  dia: number;
  valor: Prisma.Decimal;
  natureza: Natureza;
  /** Correspondência ACTIVA (pode ser só uma sugestão). */
  correspondenciaId: string | null;
}

export interface CorrespondenciaFecho {
  id: string;
  confirmada: boolean;
  /** Dia de cada linha, dos dois lados. */
  dias: number[];
  natureza: Natureza;
  valorBanco: Prisma.Decimal;
  valorContabilistico: Prisma.Decimal;
}

export interface MapaFechoInput {
  /** Primeiro dia da primeira reconciliação (não cancelada) da conta. */
  inicioConta: number;
  inicio: number;
  fim: number;
  /** Saldo do extracto no início da primeira reconciliação da conta. */
  saldoInicialBancoAbertura: Prisma.Decimal;
  /** Saldo do razão na véspera desse mesmo dia. */
  saldoContabilAntesAbertura: Prisma.Decimal;
  saldoFinalBanco: Prisma.Decimal;
  saldoFinalContabil: Prisma.Decimal;
  /** Movimentos com dia em [inicioConta, fim]; os de fora são ignorados. */
  bancarios: MovimentoFecho[];
  contabilisticos: MovimentoFecho[];
  correspondencias: CorrespondenciaFecho[];
}

export interface MapaFecho {
  totalMovimentosBanco: number;
  totalMovimentosContabilisticos: number;
  totalReconciliados: number;
  /** Σ sinal·valor dos contabilísticos por explicar (em trânsito ∪ sem banco). */
  valorEmTransito: Prisma.Decimal;
  /** Σ sinal·valor dos bancários por explicar. */
  valorBancoSemContabilizacao: Prisma.Decimal;
  /** Σ sinal·(valorBanco − valorContabilístico) das correspondências aceites com diferença. */
  valorDiferencas: Prisma.Decimal;
  diferencaAbertura: Prisma.Decimal;
  saldoReconciliado: Prisma.Decimal;
  diferencaResidual: Prisma.Decimal;
  /** Ids das correspondências que explicam movimentos neste mapa — o fecho grava-lhes o período. */
  correspondenciasExplicadas: string[];
}

/**
 * Mapa de fecho (RF §16, §17). Parte do saldo do banco e caminha até ao do razão:
 *
 *   saldoReconciliado = saldoFinalBanco
 *                     − Σ bancários por explicar + Σ contabilísticos por explicar
 *                     − Σ diferenças de valor aceites
 *                     − diferença de abertura
 *
 * Uma correspondência só EXPLICA os seus movimentos se estiver confirmada e se
 * TODAS as linhas caírem em [inicioConta, fim]: um par em que o banco só aparece
 * depois do fim é, à data do fim, um movimento em trânsito — não um reconciliado.
 * A diferença de abertura é o que ficou por explicar antes de o sistema começar a
 * reconciliar esta conta; sem ela, o primeiro fecho nunca daria zero.
 */
export function montarMapaFecho(input: MapaFechoInput): MapaFecho {
  const naJanela = (d: number) => d >= input.inicioConta && d <= input.fim;
  const noPeriodo = (d: number) => d >= input.inicio && d <= input.fim;
  const explicadas = new Map(
    input.correspondencias
      .filter((c) => c.confirmada && c.dias.every(naJanela))
      .map((c) => [c.id, c]),
  );
  const explicado = (m: MovimentoFecho) => m.correspondenciaId !== null && explicadas.has(m.correspondenciaId);

  const bancarios = input.bancarios.filter((m) => naJanela(m.dia));
  const contabilisticos = input.contabilisticos.filter((m) => naJanela(m.dia));

  const { saldoReconciliado: antesDeDiferencas, valorEmTransito, valorBancoSemContabilizacao } = calcularSaldoReconciliado({
    saldoFinalBanco: input.saldoFinalBanco,
    bancoNaoContabilizados: bancarios.filter((m) => !explicado(m)),
    contabilisticosNaoRefletidos: contabilisticos.filter((m) => !explicado(m)),
  });

  const valorDiferencas = [...explicadas.values()].reduce(
    (acc, c) => acc.plus(c.valorBanco.minus(c.valorContabilistico).times(sinal(c.natureza))),
    new Prisma.Decimal(0),
  );
  const diferencaAbertura = input.saldoInicialBancoAbertura.minus(input.saldoContabilAntesAbertura);
  const saldoReconciliado = antesDeDiferencas.minus(valorDiferencas).minus(diferencaAbertura);

  return {
    totalMovimentosBanco: bancarios.filter((m) => noPeriodo(m.dia)).length,
    totalMovimentosContabilisticos: contabilisticos.filter((m) => noPeriodo(m.dia)).length,
    totalReconciliados: [...bancarios, ...contabilisticos].filter((m) => noPeriodo(m.dia) && explicado(m)).length,
    valorEmTransito,
    valorBancoSemContabilizacao,
    valorDiferencas,
    diferencaAbertura,
    saldoReconciliado,
    diferencaResidual: calcularDiferencaResidual(saldoReconciliado, input.saldoFinalContabil),
    correspondenciasExplicadas: [...explicadas.keys()],
  };
}

/** Intervalos fechados de dias civis. */
export function periodosSobrepoem(a: { inicio: number; fim: number }, b: { inicio: number; fim: number }): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

// ---------------------------------------------------------------------------
// Sugestão de lançamento (RF §9) — só sugere; criar é acto do utilizador.
// ---------------------------------------------------------------------------

export interface RegraSugestao {
  id: string;
  contaBancariaId: string | null;
  padrao: string;
  natureza: Natureza;
  contaContrapartidaId: string;
  prioridade: number;
}

const simplificar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/** A regra de menor prioridade cuja natureza, conta e alguma palavra do padrão casam. */
export function escolherRegra<R extends RegraSugestao>(
  movimento: { descricao: string; natureza: Natureza; contaBancariaId: string },
  regras: R[],
): R | null {
  const descricao = simplificar(movimento.descricao);
  const candidatas = regras
    .filter((r) => r.natureza === movimento.natureza)
    .filter((r) => r.contaBancariaId === null || r.contaBancariaId === movimento.contaBancariaId)
    .filter((r) => simplificar(r.padrao).split('|').map((p) => p.trim()).some((p) => p.length > 0 && descricao.includes(p)))
    .sort((a, b) => a.prioridade - b.prioridade || (a.id < b.id ? -1 : 1));
  return candidatas[0] ?? null;
}

export interface PartidaSugerida {
  contaId: string;
  tipo: Natureza;
  valor: Prisma.Decimal;
}

/**
 * Partida dobrada que explica o movimento: o lado do banco repete a natureza do
 * movimento (saída do banco = crédito na conta de banco), a contrapartida inverte-a.
 */
export function sugerirPartidas(
  movimento: { valor: Prisma.Decimal; natureza: Natureza },
  contaBancoPgcId: string,
  contaContrapartidaId: string,
): PartidaSugerida[] {
  const oposta: Natureza = movimento.natureza === 'DEBITO' ? 'CREDITO' : 'DEBITO';
  return [
    { contaId: contaBancoPgcId, tipo: movimento.natureza, valor: movimento.valor },
    { contaId: contaContrapartidaId, tipo: oposta, valor: movimento.valor },
  ];
}
