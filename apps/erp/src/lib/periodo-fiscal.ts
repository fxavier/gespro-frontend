/**
 * Período por omissão dos mapas contabilísticos.
 *
 * Módulo neutro de propósito: o selector de período é `'use client'`, e tudo o
 * que um módulo cliente exporta chega a um Server Component como referência de
 * cliente — incluindo funções e constantes. As páginas do balancete, da DRE e
 * do razão são Server Components e precisam disto do lado do servidor.
 */

/** Exercício corrente — o período em que um contabilista pensa por omissão. */
export function periodoPorOmissao(): { dataInicio: string; dataFim: string } {
  const ano = new Date().getFullYear();
  return {
    dataInicio: isoData(new Date(Date.UTC(ano, 0, 1))),
    dataFim: isoData(new Date(Date.UTC(ano, 11, 31))),
  };
}

/** `aaaa-mm-dd` — o formato que `<input type="date">` lê e escreve. */
export function isoData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Um intervalo `aaaa-mm-dd` da URL em instantes do dia civil em Maputo, para os
 * mapas que filtram `Lancamento.data` com `gte`/`lte`.
 *
 * `z.coerce.date('2026-06-30')` dá a meia-noite UTC: como `dataFim` num `lte`,
 * deixa de fora os lançamentos do próprio último dia (um lançamento de 30/06 às
 * 20h17 UTC ficava fora da DRE de Abril a Junho), e como `dataInicio` deixa
 * entrar as duas horas da véspera em Maputo. O início é às 00h00 e o fim às
 * 23h59m59,999 de Maputo (+02:00, sem hora de Verão) — os mesmos instantes que
 * delimitam um `PeriodoContabil`. Assim a DRE e o razão pedidos com as datas de
 * um período coincidem com o que a DFC lê para esse período.
 *
 * Um valor que não seja `aaaa-mm-dd` passa inalterado: quem valida é o schema
 * da página (`z.coerce.date`), que continua a recusar o que não for data.
 */
export function intervaloDoDiaMaputo<T extends { dataInicio?: unknown; dataFim?: unknown }>(p: T): T {
  const r = { ...p };
  if (typeof p.dataInicio === 'string' && DIA_ISO.test(p.dataInicio)) {
    r.dataInicio = `${p.dataInicio}T00:00:00.000+02:00`;
  }
  if (typeof p.dataFim === 'string' && DIA_ISO.test(p.dataFim)) {
    r.dataFim = `${p.dataFim}T23:59:59.999+02:00`;
  }
  return r;
}
