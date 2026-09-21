/**
 * Ponto único de formatação de datas do GestPro.
 *
 * O fuso é FIXO em Africa/Maputo, e isso não é decoração: o servidor corre em
 * UTC e o browser no fuso do utilizador, por isso um `toLocaleString` sem
 * `timeZone` produz horas diferentes dos dois lados e o React descarta a
 * árvore por falha de hidratação — o que, numa tabela, silencia os cliques nas
 * linhas. Ver `formatMZN` em format-currency.ts para o mesmo princípio.
 *
 * USO: importe sempre daqui — não use Intl.DateTimeFormat directamente.
 */

const FUSO = 'Africa/Maputo';
const LOCALE = 'pt-MZ';

const dataHora = new Intl.DateTimeFormat(LOCALE, {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const data = new Intl.DateTimeFormat(LOCALE, {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dataExtensa = new Intl.DateTimeFormat(LOCALE, {
  timeZone: FUSO,
  dateStyle: 'long',
  timeStyle: 'short',
});

const diaMes = new Intl.DateTimeFormat(LOCALE, {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
});

type Entrada = Date | string | number | null | undefined;

const asDate = (v: Entrada): Date | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 24/07/2026, 15:01 */
export function formatarDataHora(v: Entrada): string {
  const d = asDate(v);
  return d ? dataHora.format(d) : '—';
}

/** 24/07/2026 */
export function formatarData(v: Entrada): string {
  const d = asDate(v);
  return d ? data.format(d) : '—';
}

/** 24 de julho de 2026 às 15:01 */
export function formatarDataExtensa(v: Entrada): string {
  const d = asDate(v);
  return d ? dataExtensa.format(d) : '—';
}

/** 24/07 — rótulo curto para eixos de gráficos e buckets (spec 22). */
export function formatarDiaMes(v: Entrada): string {
  const d = asDate(v);
  return d ? diaMes.format(d) : '—';
}
