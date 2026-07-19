/**
 * Motor de cálculo de folha salarial — Moçambique (Spec 06).
 *
 * FUNÇÕES PURAS, SEM I/O: recebem snapshots (colaborador, variáveis do mês e
 * tabelas paramétricas vigentes) e devolvem o resultado. Todo o dinheiro é
 * `Prisma.Decimal` (nunca `number` em aritmética monetária).
 *
 * Arredondamento (único e documentado): cada componente monetário final é
 * arredondado a 2 casas decimais com ROUND_HALF_UP (`arredondar2`). O líquido
 * é calculado a partir dos componentes JÁ arredondados, garantindo a
 * identidade exacta: liquido = bruto − inssTrabalhador − irps − outrosDescontos.
 *
 * Regras estatutárias (table-driven — ver skill fiscalidade-mz):
 *  - INSS: trabalhador 3% / entidade 4% (Lei 4/2007; Decreto 51/2017) — taxas
 *    vêm SEMPRE da TabelaINSS vigente, nunca hardcoded aqui.
 *  - IRPS: progressivo por escalões: imposto = base × taxa − parcelaAbater,
 *    no escalão da base tributável (base = bruto − INSS trabalhador).
 *
 * NOTA: este módulo NÃO importa 'server-only' de propósito — é puro e é
 * importado pelo seed (`prisma/seed/payroll.ts`) fora do contexto react-server.
 * Imports relativos (sem alias '@/') pelo mesmo motivo.
 */
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '../../../lib/errors';

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value): Decimal => new Prisma.Decimal(v);
const ZERO = new Prisma.Decimal(0);

/** Arredondamento monetário único do motor: 2 casas, ROUND_HALF_UP. */
export function arredondar2(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// Tipos (snapshots das tabelas paramétricas vigentes — sem I/O)
// ---------------------------------------------------------------------------

export interface TabelaINSSVigente {
  /** ex.: 0.03 */
  taxaTrabalhador: Decimal;
  /** ex.: 0.04 */
  taxaEntidade: Decimal;
  /** teto da base de incidência (null = sem teto) */
  tetoIncidencia: Decimal | null;
}

export interface EscalaoIRPSVigente {
  ordem: number;
  limiteInferior: Decimal;
  /** null = último escalão (sem limite superior) */
  limiteSuperior: Decimal | null;
  taxa: Decimal;
  parcelaAbater: Decimal;
}

export interface EntradaCalculoPayroll {
  salarioBase: Decimal;
  subsidios: {
    alimentacao: Decimal;
    transporte: Decimal;
    habitacao: Decimal;
    outros: Decimal;
  };
  variaveis: {
    /** valor monetário já valorizado (ver `valorizarHorasExtras`) */
    horasExtras: Decimal;
    comissoes: Decimal;
    bonus: Decimal;
    outros: Decimal;
  };
  /** faltas, adiantamentos, penhoras, etc. — linhas configuráveis */
  descontosDiversos: {
    natureza: 'FALTA' | 'ADIANTAMENTO' | 'PENHORA' | 'OUTRO';
    descricao: string;
    valor: Decimal;
  }[];
  tabelaInss: TabelaINSSVigente;
  escaloesIrps: EscalaoIRPSVigente[];
}

export interface LinhaCalculoPayroll {
  tipo: 'PROVENTO' | 'DESCONTO';
  natureza:
    | 'BASE'
    | 'SUBSIDIO'
    | 'HORAS_EXTRAS'
    | 'COMISSAO'
    | 'BONUS'
    | 'INSS'
    | 'IRPS'
    | 'FALTA'
    | 'ADIANTAMENTO'
    | 'PENHORA'
    | 'OUTRO';
  descricao: string;
  valor: Decimal;
}

export interface ResultadoCalculoPayroll {
  bruto: Decimal;
  baseInss: Decimal;
  inssTrabalhador: Decimal;
  /** encargo da ENTIDADE — não é desconto do trabalhador */
  inssEntidade: Decimal;
  baseIrps: Decimal;
  irps: Decimal;
  outrosDescontos: Decimal;
  liquido: Decimal;
  custoTotalEntidade: Decimal;
  linhas: LinhaCalculoPayroll[];
}

// ---------------------------------------------------------------------------
// IRPS progressivo (escalão → taxa → parcela a abater)
// ---------------------------------------------------------------------------

/**
 * Calcula o IRPS: encontra o escalão da base tributável e aplica
 * `imposto = base × taxa − parcelaAbater` (nunca negativo), arredondado a 2 casas.
 * Base ≤ 0 → imposto 0. Lança `TABELA_IRPS_EM_FALTA` sem escalões.
 */
export function calcularIRPS(base: Decimal, escaloes: EscalaoIRPSVigente[]): Decimal {
  if (escaloes.length === 0) {
    throw new BusinessRuleError(
      'TABELA_IRPS_EM_FALTA',
      'Não existem escalões IRPS vigentes para o período',
    );
  }
  if (base.lte(ZERO)) return ZERO;

  const ordenados = [...escaloes].sort((a, b) => a.ordem - b.ordem);
  const escalao =
    ordenados.find((e) => e.limiteSuperior === null || base.lte(e.limiteSuperior)) ??
    ordenados[ordenados.length - 1];

  const imposto = base.times(escalao.taxa).minus(escalao.parcelaAbater);
  const arredondado = arredondar2(imposto);
  return arredondado.lt(ZERO) ? ZERO : arredondado;
}

// ---------------------------------------------------------------------------
// Valorização de horas extras
// ---------------------------------------------------------------------------

/**
 * Valoriza horas extras a partir do salário base:
 * valorHora = salarioBase / horasMensais; valor = horas × valorHora × (1 + majoração).
 * Por omissão: 26 dias × 8h = 208 horas mensais e majoração de 50% (0.5),
 * conforme prática da Lei do Trabalho (Lei 23/2007, art. 90) — ambos
 * configuráveis pelo chamador.
 */
export function valorizarHorasExtras(
  salarioBase: Decimal,
  horasExtras: Decimal,
  opts?: { horasMensais?: Decimal; majoracao?: Decimal },
): Decimal {
  if (horasExtras.lte(ZERO) || salarioBase.lte(ZERO)) return ZERO;
  const horasMensais = opts?.horasMensais ?? D(208);
  const majoracao = opts?.majoracao ?? D('0.5');
  const valorHora = salarioBase.div(horasMensais);
  return arredondar2(horasExtras.times(valorHora).times(D(1).plus(majoracao)));
}

/**
 * Desconto por falta não remunerada: dias × (salarioBase / 30).
 * Convenção do mês comercial de 30 dias, documentada e testada.
 */
export function calcularDescontoFalta(salarioBase: Decimal, dias: number): Decimal {
  if (dias <= 0 || salarioBase.lte(ZERO)) return ZERO;
  return arredondar2(salarioBase.div(D(30)).times(D(dias)));
}

// ---------------------------------------------------------------------------
// Cálculo principal
// ---------------------------------------------------------------------------

/**
 * Calcula a folha de um colaborador para um mês.
 *
 * Sequência:
 *  1. bruto = salarioBase + subsídios + variáveis (arredondado a 2 casas);
 *  2. baseInss = min(bruto, tetoIncidencia) — regra de incidência da tabela;
 *  3. inssTrabalhador = baseInss × taxaTrabalhador (desconto);
 *     inssEntidade = baseInss × taxaEntidade (ENCARGO da entidade);
 *  4. baseIrps = bruto − inssTrabalhador; irps pela tabela progressiva;
 *  5. liquido = bruto − inssTrabalhador − irps − outrosDescontos (identidade exacta);
 *  6. custoTotalEntidade = bruto + inssEntidade.
 */
export function calcularPayroll(e: EntradaCalculoPayroll): ResultadoCalculoPayroll {
  const salarioBase = arredondar2(e.salarioBase);
  const subAlimentacao = arredondar2(e.subsidios.alimentacao);
  const subTransporte = arredondar2(e.subsidios.transporte);
  const subHabitacao = arredondar2(e.subsidios.habitacao);
  const subOutros = arredondar2(e.subsidios.outros);
  const horasExtras = arredondar2(e.variaveis.horasExtras);
  const comissoes = arredondar2(e.variaveis.comissoes);
  const bonus = arredondar2(e.variaveis.bonus);
  const provOutros = arredondar2(e.variaveis.outros);

  const bruto = salarioBase
    .plus(subAlimentacao)
    .plus(subTransporte)
    .plus(subHabitacao)
    .plus(subOutros)
    .plus(horasExtras)
    .plus(comissoes)
    .plus(bonus)
    .plus(provOutros);

  // INSS — base = bruto, limitada ao teto de incidência da tabela vigente
  const teto = e.tabelaInss.tetoIncidencia;
  const baseInss = teto !== null && bruto.gt(teto) ? teto : bruto;
  const inssTrabalhador = arredondar2(baseInss.times(e.tabelaInss.taxaTrabalhador));
  const inssEntidade = arredondar2(baseInss.times(e.tabelaInss.taxaEntidade));

  // IRPS — base tributável = bruto − INSS trabalhador
  const baseIrps = bruto.minus(inssTrabalhador);
  const irps = calcularIRPS(baseIrps, e.escaloesIrps);

  // Outros descontos (faltas, adiantamentos, penhoras…)
  const descontos = e.descontosDiversos.map((d) => ({
    ...d,
    valor: arredondar2(d.valor),
  }));
  const outrosDescontos = descontos.reduce((s, d) => s.plus(d.valor), ZERO);

  // Identidade exacta (todos os termos já arredondados a 2 casas)
  const liquido = bruto.minus(inssTrabalhador).minus(irps).minus(outrosDescontos);
  const custoTotalEntidade = bruto.plus(inssEntidade);

  const linhas: LinhaCalculoPayroll[] = [
    { tipo: 'PROVENTO', natureza: 'BASE', descricao: 'Salário base', valor: salarioBase },
  ];
  if (subAlimentacao.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'SUBSIDIO', descricao: 'Subsídio de alimentação', valor: subAlimentacao });
  if (subTransporte.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'SUBSIDIO', descricao: 'Subsídio de transporte', valor: subTransporte });
  if (subHabitacao.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'SUBSIDIO', descricao: 'Subsídio de habitação', valor: subHabitacao });
  if (subOutros.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'SUBSIDIO', descricao: 'Outros subsídios', valor: subOutros });
  if (horasExtras.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'HORAS_EXTRAS', descricao: 'Horas extras', valor: horasExtras });
  if (comissoes.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'COMISSAO', descricao: 'Comissões', valor: comissoes });
  if (bonus.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'BONUS', descricao: 'Bónus', valor: bonus });
  if (provOutros.gt(ZERO))
    linhas.push({ tipo: 'PROVENTO', natureza: 'OUTRO', descricao: 'Outros proventos', valor: provOutros });

  linhas.push({
    tipo: 'DESCONTO',
    natureza: 'INSS',
    descricao: `INSS trabalhador (${e.tabelaInss.taxaTrabalhador.times(100).toString()}%)`,
    valor: inssTrabalhador,
  });
  if (irps.gt(ZERO))
    linhas.push({ tipo: 'DESCONTO', natureza: 'IRPS', descricao: 'IRPS (retenção na fonte)', valor: irps });
  for (const d of descontos) {
    linhas.push({ tipo: 'DESCONTO', natureza: d.natureza, descricao: d.descricao, valor: d.valor });
  }

  return {
    bruto,
    baseInss,
    inssTrabalhador,
    inssEntidade,
    baseIrps,
    irps,
    outrosDescontos,
    liquido,
    custoTotalEntidade,
    linhas,
  };
}
