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

const partesDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * 2026-07-24 — o dia civil em Maputo, no formato que `<input type="date">` lê e
 * escreve. Um `toISOString().slice(0, 10)` dá o dia em UTC: o início de um
 * período (00h00 em Maputo = 22h00 UTC da véspera) sairia no dia anterior.
 */
export function formatarDiaIso(v: Entrada): string {
  const d = asDate(v);
  if (!d) return '';
  const p = Object.fromEntries(partesDia.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const UM_DIA_MS = 86_400_000;

/**
 * O dia civil de Maputo, `aaaa-mm-dd`, com deslocamento em dias — a data por
 * omissão de um documento. Calcula-se no Server Component e desce por prop:
 * num módulo `'use client'` o SSR usaria o relógio do arranque do processo e o
 * browser o seu, e o ecrã e o documento emitido divergiriam (#242).
 */
export function diaIsoMaputo(deslocamentoDias = 0, agora: Date = new Date()): string {
  return formatarDiaIso(new Date(agora.getTime() + deslocamentoDias * UM_DIA_MS));
}

/**
 * `aaaa-mm-dd` → o meio-dia desse dia em Maputo, independente do fuso do
 * browser. `new Date('aaaa-mm-dd')` lê meia-noite UTC; o meio-dia fixo em +02:00
 * mantém o dia civil (e o período fiscal) de qualquer lado. Uma string que não
 * seja um dia válido devolve `Invalid Date` — quem a recusa é o schema.
 */
export function diaIsoParaData(dia: string): Date {
  return new Date(`${dia}T12:00:00+02:00`);
}

/** O inverso de `diaIsoParaData` para o `value` de um `<input type="date">`; '' se não houver data válida. */
export function dataParaDiaIso(v: Date | undefined | null): string {
  return v instanceof Date && !Number.isNaN(v.getTime()) ? formatarDiaIso(v) : '';
}

/**
 * Formata uma data pela data civil UTC (dd/mm/aaaa).
 *
 * Usar para vigências paramétricas ancoradas a meia-noite UTC (D1, spec 06):
 * `formatarData` usa Africa/Maputo (UTC+2), o que converteria
 * 2098-12-31T23:59:59.999Z → 01/01/2099 (mesmo dia da vigência seguinte).
 * Este helper lê `toISOString().slice(0, 10)` em UTC e formata como dd/mm/aaaa.
 */
export function formatarDataUtcDia(v: Date | null | undefined): string {
  if (!v) return '—';
  const s = v.toISOString().slice(0, 10); // 'aaaa-mm-dd'
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}
