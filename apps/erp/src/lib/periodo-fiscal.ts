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
