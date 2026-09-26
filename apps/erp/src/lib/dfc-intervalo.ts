/**
 * Do par de datas da URL ao par de períodos da DFC (nó `fatia`, ticket 6.3).
 *
 * A DFC recebe ids de `PeriodoContabil` (ADR-0037 §6, E3: `FiltroDFC` sem
 * datas); o `SeletorPeriodo` partilhado com o balancete e a DRE trabalha com
 * datas `aaaa-mm-dd`. Em vez de mudar o selector (três páginas) ou pôr ids
 * opacos na URL, a página continua a receber datas e resolve-as aqui, no
 * servidor, para os períodos que as contêm. A DFC é sempre de períodos
 * COMPLETOS: um dia a meio de um mês alarga ao mês inteiro, e a página di-lo
 * (`alargado`).
 *
 * Módulo neutro e puro (sem Prisma, sem `server-only`, sem `Date.now()`): a
 * data de hoje entra por parâmetro.
 *
 * Os dias comparam-se como dia civil em Maputo (`formatarDiaIso`), nunca por
 * `getFullYear()`/UTC nem com um `+2` à mão. Um dia pode estar em DOIS períodos
 * do mesmo exercício: o 31/12 está no período 12 e no 13 (encerramento, que
 * coincide em data com o 12 — ADR-0033). Escolhe-se sempre o de menor `ordem`:
 * a DFC até Dezembro é a do período 12, e a dívida do período 13 fica com o
 * ADR-0035 (MINOR-3 do nó `servico`).
 */
import { formatarDiaIso } from '@/lib/format-date';

export interface PeriodoParaIntervalo {
  id: string;
  codigo: string;
  ordem: number;
  exercicioId: string;
  dataInicio: Date;
  dataFim: Date;
}

export type IntervaloDFC<P extends PeriodoParaIntervalo> =
  | {
      ok: true;
      inicio: P;
      fim: P;
      /** `aaaa-mm-dd` do primeiro e do último dia do intervalo resolvido. */
      dataInicio: string;
      dataFim: string;
      /** O utilizador pediu datas que não coincidem com limites de período. */
      alargado: boolean;
    }
  | { ok: false; motivo: string };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(s: string): boolean {
  if (!DIA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

function dd_mm_aaaa(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

/** O período (de menor `ordem`) que contém o dia civil `dia` (`aaaa-mm-dd`), ou `null`. */
export function periodoQueContem<P extends PeriodoParaIntervalo>(periodos: readonly P[], dia: string): P | null {
  let escolhido: P | null = null;
  for (const p of periodos) {
    if (formatarDiaIso(p.dataInicio) > dia || formatarDiaIso(p.dataFim) < dia) continue;
    if (!escolhido || p.ordem < escolhido.ordem) escolhido = p;
  }
  return escolhido;
}

/**
 * Resolve o intervalo da DFC.
 *  - `dataFim` ausente ⇒ o período que contém `hoje`;
 *  - `dataInicio` ausente ⇒ o primeiro período (menor `ordem`) do exercício do fim.
 * Não valida o mesmo exercício nem a ordem: isso é do serviço (V4,
 * `DFC_ENTRE_EXERCICIOS`, `DFC_INTERVALO_INVERTIDO`), que a página mostra.
 */
export function resolverIntervaloDFC<P extends PeriodoParaIntervalo>(
  periodos: readonly P[],
  pedido: { dataInicio?: string; dataFim?: string },
  hoje: Date,
): IntervaloDFC<P> {
  if (periodos.length === 0) {
    return {
      ok: false,
      motivo: 'O tenant ainda não tem nenhum exercício contabilístico, e sem períodos não há DFC. Crie o exercício em Contabilidade › Exercícios.',
    };
  }
  for (const [campo, valor] of [
    ['inicial', pedido.dataInicio],
    ['final', pedido.dataFim],
  ] as const) {
    if (valor !== undefined && !diaValido(valor)) {
      return { ok: false, motivo: `A data ${campo} «${valor}» não é uma data válida.` };
    }
  }

  const diaFim = pedido.dataFim ?? formatarDiaIso(hoje);
  const fim = periodoQueContem(periodos, diaFim);
  if (!fim) {
    return { ok: false, motivo: `Não há período contabilístico que contenha ${dd_mm_aaaa(diaFim)}.` };
  }

  let inicio: P | null;
  if (pedido.dataInicio !== undefined) {
    inicio = periodoQueContem(periodos, pedido.dataInicio);
    if (!inicio) {
      return {
        ok: false,
        motivo: `Não há período contabilístico que contenha ${dd_mm_aaaa(pedido.dataInicio)}.`,
      };
    }
  } else {
    inicio = periodos
      .filter((p) => p.exercicioId === fim.exercicioId)
      .reduce<P | null>((a, p) => (!a || p.ordem < a.ordem ? p : a), null);
  }
  // `fim` é do exercício, logo o filtro acima nunca fica vazio.
  if (!inicio) return { ok: false, motivo: 'Exercício sem períodos.' };

  const dataInicio = formatarDiaIso(inicio.dataInicio);
  const dataFim = formatarDiaIso(fim.dataFim);
  const alargado =
    (pedido.dataInicio !== undefined && pedido.dataInicio !== dataInicio) ||
    (pedido.dataFim !== undefined && pedido.dataFim !== dataFim);
  return { ok: true, inicio, fim, dataInicio, dataFim, alargado };
}
