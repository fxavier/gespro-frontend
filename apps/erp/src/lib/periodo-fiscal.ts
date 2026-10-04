/**
 * Período por omissão dos mapas contabilísticos.
 *
 * Módulo neutro de propósito: o selector de período é `'use client'`, e tudo o
 * que um módulo cliente exporta chega a um Server Component como referência de
 * cliente — incluindo funções e constantes. As páginas do balancete, da DRE e
 * do razão são Server Components e precisam disto do lado do servidor.
 */

/** Dia civil em Maputo, `aaaa-mm-dd` (o locale en-CA formata nesta ordem). */
const DIA_CIVIL_MAPUTO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Maputo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Exercício corrente — o período em que um contabilista pensa por omissão. O ano
 * é o do dia civil de Maputo: o servidor corre em UTC e, a 31/12 às 22h30 UTC,
 * `getFullYear()` ainda diz o ano anterior.
 */
export function periodoPorOmissao(): { dataInicio: string; dataFim: string } {
  const ano = DIA_CIVIL_MAPUTO.format(new Date()).slice(0, 4);
  return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/*
 * Limites de um intervalo `aaaa-mm-dd` em instantes do dia civil de Maputo, para
 * os schemas de filtro que comparam `Lancamento.data` com `gte`/`lte` (#88).
 * `z.coerce.date('2026-06-30')` dá a meia-noite UTC: como `dataFim` num `lte`
 * deixava de fora o próprio último dia. Início às 00h00 e fim às 23h59m59,999 de
 * Maputo (+02:00, sem hora de Verão) — os instantes que delimitam um
 * `PeriodoContabil`. Qualquer outro valor passa inalterado para o `z.coerce.date`.
 */
/** `aaaa-mm-dd` ⇒ 00:00:00.000 de Maputo; qualquer outro valor passa inalterado. */
export function inicioDoDiaMaputo(v: unknown): unknown {
  return typeof v === 'string' && DIA_ISO.test(v) ? `${v}T00:00:00.000+02:00` : v;
}

/** `aaaa-mm-dd` ⇒ 23:59:59.999 de Maputo; qualquer outro valor passa inalterado. */
export function fimDoDiaMaputo(v: unknown): unknown {
  return typeof v === 'string' && DIA_ISO.test(v) ? `${v}T23:59:59.999+02:00` : v;
}

/**
 * Intervalo de dias civis de Maputo coberto pelos períodos `inicial..final` de
 * um exercício (procurados por `ordem`): do `dataInicio` do inicial ao `dataFim`
 * do final. `null` se faltar algum dos dois. Espera entrada normalizada
 * (inicial <= final). Usado pelo drill-down balancete → razão.
 *
 * Não usa `toISOString().slice`: o início de um período é às 22:00 UTC da véspera,
 * e o dia UTC sairia trocado.
 */
export function intervaloDiasDosPeriodos(
  periodos: { ordem: number; dataInicio: Date; dataFim: Date }[],
  inicial: number,
  final: number,
): { dataInicio: string; dataFim: string } | null {
  const pIni = periodos.find((p) => p.ordem === inicial);
  const pFim = periodos.find((p) => p.ordem === final);
  if (!pIni || !pFim) return null;
  return {
    dataInicio: DIA_CIVIL_MAPUTO.format(pIni.dataInicio),
    dataFim: DIA_CIVIL_MAPUTO.format(pFim.dataFim),
  };
}
