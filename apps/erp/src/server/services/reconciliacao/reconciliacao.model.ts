import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';
import {
  TRANSICOES_MOVIMENTO_RECONCILIACAO,
  TRANSICOES_PERIODO_RECONCILIACAO,
} from '@/lib/state-machines';

// ---------------------------------------------------------------------------
// Núcleo de domínio da reconciliação bancária (ADR-0038) — lógica PURA, sem DB.
// Tudo o que decide semântica de estado, chave de procura, idempotência e
// aritmética de saldo vive aqui e é testado por property tests.
// ---------------------------------------------------------------------------

export type EstadoMovimento =
  | 'PENDENTE'
  | 'RECONCILIADO'
  | 'EM_TRANSITO'
  | 'BANCO_SEM_CONTABILIZACAO'
  | 'CONTABILIDADE_SEM_BANCO'
  | 'DIFERENCA_VALOR'
  | 'DIVERGENCIA'
  | 'RECONCILIADO_MANUALMENTE'
  | 'IGNORADO';

export type EstadoPeriodo = 'ABERTO' | 'EM_RECONCILIACAO' | 'RECONCILIADO' | 'CANCELADO';

export type Natureza = 'DEBITO' | 'CREDITO';

/** Lado de origem de um movimento. */
export type LadoMovimento = 'BANCO' | 'CONTABILIDADE';

/**
 * Sinal de um movimento na perspectiva da EMPRESA: DEBITO é entrada de dinheiro
 * na conta bancária, CREDITO é saída. É a mesma convenção do módulo antigo.
 */
export function sinal(natureza: Natureza): 1 | -1 {
  return natureza === 'DEBITO' ? 1 : -1;
}

// ---------------------------------------------------------------------------
// Máquinas de estado
// ---------------------------------------------------------------------------

export function transitarMovimento(atual: EstadoMovimento, alvo: EstadoMovimento): void {
  const permitidas = TRANSICOES_MOVIMENTO_RECONCILIACAO[atual] ?? [];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de movimento: ${atual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
  }
}

export function transitarPeriodoReconciliacao(atual: EstadoPeriodo, alvo: EstadoPeriodo): void {
  const permitidas = TRANSICOES_PERIODO_RECONCILIACAO[atual] ?? [];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de período: ${atual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
  }
}

/** Estados que contam como correspondidos — um movimento assim tem correspondência activa. */
export const ESTADOS_CORRESPONDIDOS: ReadonlySet<EstadoMovimento> = new Set([
  'RECONCILIADO',
  'RECONCILIADO_MANUALMENTE',
]);

/** Estados que o utilizador tem de resolver à mão (a «lista de excepções» da RF §23). */
export const ESTADOS_EXCEPCAO: ReadonlySet<EstadoMovimento> = new Set([
  'BANCO_SEM_CONTABILIZACAO',
  'CONTABILIDADE_SEM_BANCO',
  'DIFERENCA_VALOR',
  'DIVERGENCIA',
]);

// ---------------------------------------------------------------------------
// Normalização de referência — chave de procura do motor (RF §6, prioridades 1–2)
// ---------------------------------------------------------------------------

/**
 * Reduz uma referência bancária à sua forma comparável: sem acentos, sem
 * separadores, em maiúsculas. `TRF-458/2026` e `trf 458 2026` colapsam na mesma
 * chave. Devolve `null` quando nada de útil sobra — um `null` NUNCA casa com
 * outro `null`, e é o chamador que tem de o garantir.
 */
export function normalizarReferencia(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpo = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return limpo.length > 0 ? limpo : null;
}

/**
 * Número do documento dentro de uma referência — o sufixo numérico do ÚLTIMO
 * grupo separado: `FAC/2026/000458` → `000458`, `TRF 000458` → `000458`.
 * Usado pela passagem REFERENCIA_NORMALIZADA para casar quando os prefixos dos
 * dois lados diferem.
 *
 * Opera sobre a referência CRUA, não sobre a normalizada: normalizar apaga os
 * separadores e `FAC/2026/000458` colapsaria em `FAC2026000458`, onde `2026` e
 * `000458` deixam de ser distinguíveis. Numa referência sem separadores é isso
 * mesmo que acontece e devolve-se a corrida inteira — é o melhor que há, e a
 * passagem seguinte do motor apanha o caso.
 *
 * Exige 4+ dígitos: abaixo disso o falso positivo é mais provável que o acerto.
 */
export function nucleoNumerico(referencia: string | null | undefined): string | null {
  if (!referencia) return null;
  const grupos = referencia
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((g) => g.length > 0);
  if (grupos.length === 0) return null;
  const ultimo = grupos[grupos.length - 1];
  const sufixo = /(\d+)$/.exec(ultimo);
  if (!sufixo) return null;
  return sufixo[1].length >= 4 ? sufixo[1] : null;
}

// ---------------------------------------------------------------------------
// Idempotência da importação (RF §19)
// ---------------------------------------------------------------------------

export interface ChaveIdempotenciaInput {
  /** Identificador do banco, quando o extracto o traz. É o melhor discriminante. */
  referenciaBanco?: string | null;
  dataMovimento: Date;
  valor: Prisma.Decimal;
  natureza: Natureza;
  descricao: string;
  /**
   * Ordinal da linha DENTRO do mesmo tuplo (data, valor, natureza, descrição) no
   * mesmo ficheiro. Sem isto, duas comissões iguais no mesmo dia colapsariam numa
   * só e a importação perderia dinheiro em silêncio.
   */
  ordinal: number;
}

/**
 * Chave determinística de um movimento bancário. Quando o banco fornece uma
 * referência, ela domina; caso contrário, o tuplo natural + ordinal.
 * Reimportar um extracto sobreposto tem de produzir exactamente as mesmas chaves.
 */
export function chaveIdempotenciaBanco(input: ChaveIdempotenciaInput): string {
  const ref = normalizarReferencia(input.referenciaBanco);
  const dia = input.dataMovimento.toISOString().slice(0, 10);
  const material = ref
    ? `REF:${ref}`
    : [
        'NAT',
        dia,
        input.valor.toFixed(2),
        input.natureza,
        normalizarReferencia(input.descricao) ?? '',
        String(input.ordinal),
      ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// Classificação de um movimento sem correspondência (RF §8, §9, §22)
// ---------------------------------------------------------------------------

export interface ClassificacaoInput {
  lado: LadoMovimento;
  /** Data contabilística (lado CONTABILIDADE) ou data do extracto (lado BANCO). */
  dataMovimento: Date;
  /** Fim do horizonte observado — tipicamente a data do extracto mais recente. */
  dataReferencia: Date;
  toleranciaDias: number;
}

const MS_POR_DIA = 86_400_000;

/** Distância em dias inteiros entre duas datas (sempre não-negativa). */
export function distanciaDias(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / MS_POR_DIA);
}

/**
 * Regra de negócio principal da RF (§22): uma diferença de datas NÃO é, por si
 * só, uma divergência.
 *
 * - Movimento contabilístico ainda dentro da tolerância → EM_TRANSITO (continua
 *   a ser procurado em extractos futuros).
 * - Passada a tolerância → CONTABILIDADE_SEM_BANCO (passa a ser excepção).
 * - Movimento bancário sem contrapartida → BANCO_SEM_CONTABILIZACAO desde o
 *   primeiro momento: o banco é a fonte da verdade, se lá está, aconteceu.
 */
export function classificarSemCorrespondencia(input: ClassificacaoInput): EstadoMovimento {
  if (input.lado === 'BANCO') return 'BANCO_SEM_CONTABILIZACAO';
  const idade = distanciaDias(input.dataReferencia, input.dataMovimento);
  return idade <= input.toleranciaDias ? 'EM_TRANSITO' : 'CONTABILIDADE_SEM_BANCO';
}

// ---------------------------------------------------------------------------
// Saldo reconciliado (RF §16)
// ---------------------------------------------------------------------------

export interface MovimentoParaSaldo {
  valor: Prisma.Decimal;
  natureza: Natureza;
}

export interface SaldoReconciliadoInput {
  saldoFinalBanco: Prisma.Decimal;
  /** Bancários sem contrapartida contabilística (BANCO_SEM_CONTABILIZACAO). */
  bancoNaoContabilizados: MovimentoParaSaldo[];
  /** Contabilísticos ainda não reflectidos no banco (EM_TRANSITO ∪ CONTABILIDADE_SEM_BANCO). */
  contabilisticosNaoRefletidos: MovimentoParaSaldo[];
}

export interface SaldoReconciliado {
  saldoReconciliado: Prisma.Decimal;
  valorEmTransito: Prisma.Decimal;
  valorBancoSemContabilizacao: Prisma.Decimal;
}

function somaComSinal(movimentos: MovimentoParaSaldo[]): Prisma.Decimal {
  return movimentos.reduce(
    (acc, m) => (sinal(m.natureza) === 1 ? acc.plus(m.valor) : acc.minus(m.valor)),
    new Prisma.Decimal(0),
  );
}

/**
 * Parte-se do saldo do banco e caminha-se até ao saldo contabilístico:
 *
 *   saldoReconciliado = saldoFinalBanco
 *                     − Σ sinal·valor (bancários não contabilizados)
 *                     + Σ sinal·valor (contabilísticos não reflectidos)
 *
 * Os movimentos correspondidos não entram: contribuem igualmente para os dois
 * saldos e cancelam-se. Daí a propriedade que o property test fixa —
 * `saldoReconciliado == saldoFinalContabil` sempre que tudo estiver explicado.
 *
 * Nota (ADR-0038 §Riscos): o exemplo numérico da RF §16 soma os recebimentos
 * bancários não contabilizados. Isso duplicaria um valor que já está dentro do
 * saldo do banco; a direcção correcta é subtrair. Ver ADR.
 */
export function calcularSaldoReconciliado(input: SaldoReconciliadoInput): SaldoReconciliado {
  const ajusteBanco = somaComSinal(input.bancoNaoContabilizados);
  const ajusteContabilistico = somaComSinal(input.contabilisticosNaoRefletidos);
  return {
    saldoReconciliado: input.saldoFinalBanco.minus(ajusteBanco).plus(ajusteContabilistico),
    valorEmTransito: ajusteContabilistico,
    valorBancoSemContabilizacao: ajusteBanco,
  };
}

/** Diferença que sobra depois de todos os ajustes; zero fecha sem justificação. */
export function calcularDiferencaResidual(
  saldoReconciliado: Prisma.Decimal,
  saldoFinalContabil: Prisma.Decimal,
): Prisma.Decimal {
  return saldoReconciliado.minus(saldoFinalContabil);
}
