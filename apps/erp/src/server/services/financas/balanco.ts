/**
 * Balanço simples por classes — núcleo puro (ADR-0035 §8, issue #365).
 *
 * Sem Prisma client, sem `server-only`, sem I/O. Recebe as linhas do balancete de verificação
 * (`montarBalanceteVerificacao`: folhas com o acumulado por PERÍODO, abertura incluída) e
 * agrupa-as por conta de RAZÃO (os dois primeiros dígitos do código):
 *
 *  - Activo          = classes 1–3, mais as razões da classe 4 de saldo líquido devedor;
 *  - Passivo         = razões da classe 4 de saldo líquido credor (valor positivo);
 *  - Capital próprio = classes 5 e 8 (credor positivo), a linha sintética dos resultados de
 *                      exercícios anteriores por encerrar (quando a abertura é implícita) e o
 *                      `resultadoDoPeriodo` — classes 6/7 ainda por apurar, credor positivo.
 *
 * O saldo da classe 4 decide-se por RAZÃO, não por folha: 4411 credor e 4412 devedor da mesma
 * 44 compensam-se. Linhas de valor zero não aparecem. Não há reclassificação por prazo nem
 * por natureza fina — é o balanço «por classes» decidido para o arquivo do encerramento.
 */
import { Prisma, type ClassePGC } from '@prisma/client';
import type { LinhaBV } from './balancete-verificacao';

type Decimal = Prisma.Decimal;

export interface LinhaBalanco {
  /** Código da conta de razão (2 dígitos); '' na linha sintética de resultados anteriores. */
  codigo: string;
  nome: string;
  valor: Decimal;
}

export interface MassaBalanco {
  linhas: LinhaBalanco[];
  total: Decimal;
}

export interface Balanco {
  activo: MassaBalanco;
  /** Inclui o `resultadoDoPeriodo` no total (não como linha). */
  capitalProprio: MassaBalanco;
  passivo: MassaBalanco;
  /** Classes 6/7 por apurar no intervalo, credor positivo. Zero depois do encerramento. */
  resultadoDoPeriodo: Decimal;
  /** Activo = Capital próprio + Passivo (igualdade exacta). */
  equilibrado: boolean;
}

export const NOME_RESULTADOS_ANTERIORES = 'Resultados de exercícios anteriores por encerrar';

const CLASSES_ACTIVO = new Set<ClassePGC>(['CLASSE_1', 'CLASSE_2', 'CLASSE_3']);
const CLASSES_CAPITAL = new Set<ClassePGC>(['CLASSE_5', 'CLASSE_8']);
const CLASSES_RESULTADO = new Set<ClassePGC>(['CLASSE_6', 'CLASSE_7']);

const zero = () => new Prisma.Decimal(0);

function somar(linhas: LinhaBalanco[]): Decimal {
  return linhas.reduce((s, l) => s.plus(l.valor), zero());
}

/**
 * @param linhas  linhas do balancete de verificação (folhas + sintética)
 * @param contas  as contas do tenant (para o nome da conta de razão)
 */
export function montarBalanco(
  linhas: LinhaBV[],
  contas: ReadonlyArray<{ codigo: string; nome: string }>,
): Balanco {
  const nomes = new Map(contas.map((c) => [c.codigo, c.nome]));

  /** Saldo líquido (D − C) por razão, com a classe e um nome de recurso. */
  const razoes = new Map<string, { classe: ClassePGC; saldo: Decimal; nomeFolha: string }>();
  let resultado = zero();
  let resultadosAnteriores = zero();

  for (const l of linhas) {
    const saldo = l.saldoDevedor.minus(l.saldoCredor);
    if (!l.conta) {
      resultadosAnteriores = resultadosAnteriores.plus(saldo);
      continue;
    }
    const { classe, codigo, nome } = l.conta;
    if (CLASSES_RESULTADO.has(classe)) {
      resultado = resultado.plus(saldo);
      continue;
    }
    const razao = codigo.slice(0, 2);
    const e = razoes.get(razao) ?? { classe, saldo: zero(), nomeFolha: nome };
    e.saldo = e.saldo.plus(saldo);
    razoes.set(razao, e);
  }

  const activo: LinhaBalanco[] = [];
  const passivo: LinhaBalanco[] = [];
  const capital: LinhaBalanco[] = [];

  for (const codigo of [...razoes.keys()].sort()) {
    const { classe, saldo, nomeFolha } = razoes.get(codigo)!;
    if (saldo.isZero()) continue;
    const nome = nomes.get(codigo) ?? nomeFolha;
    if (CLASSES_ACTIVO.has(classe)) activo.push({ codigo, nome, valor: saldo });
    else if (classe === 'CLASSE_4') {
      if (saldo.greaterThan(0)) activo.push({ codigo, nome, valor: saldo });
      else passivo.push({ codigo, nome, valor: saldo.negated() });
    } else if (CLASSES_CAPITAL.has(classe)) capital.push({ codigo, nome, valor: saldo.negated() });
  }

  if (!resultadosAnteriores.isZero()) {
    capital.push({ codigo: '', nome: NOME_RESULTADOS_ANTERIORES, valor: resultadosAnteriores.negated() });
  }

  const resultadoDoPeriodo = resultado.negated();
  const totalActivo = somar(activo);
  const totalPassivo = somar(passivo);
  const totalCapital = somar(capital).plus(resultadoDoPeriodo);

  return {
    activo: { linhas: activo, total: totalActivo },
    capitalProprio: { linhas: capital, total: totalCapital },
    passivo: { linhas: passivo, total: totalPassivo },
    resultadoDoPeriodo,
    equilibrado: totalActivo.equals(totalCapital.plus(totalPassivo)),
  };
}
