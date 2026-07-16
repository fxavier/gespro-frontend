/**
 * Ponto único de formatação monetária para o GestPro.
 * Moeda padrão: MZN (Metical Moçambicano).
 * Locale: pt-MZ (Português de Moçambique).
 *
 * USO: importe sempre daqui — não use Intl.NumberFormat directamente.
 */

/**
 * Formata um valor em Metical Moçambicano (MZN).
 * Exemplo: 1234.5 → "1 234,50 MT"
 */
export function formatMZN(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '—';
  return (
    new Intl.NumberFormat('pt-MZ', {
      style: 'currency',
      currency: 'MZN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(n)
      // Substitui símbolo "MZN" por "MT" (notação local comum em Moçambique)
      .replace('MZN', 'MT')
      .trim()
  );
}

/**
 * Alias mantido para retrocompatibilidade com código existente.
 * @deprecated Use `formatMZN` nos novos módulos.
 */
export function formatCurrency(value: number): string {
  return formatMZN(value);
}

/**
 * Formata valores de forma compacta (K, M, B) — para dashboards.
 * Exemplo: 1500000 → "1,5M MT"
 */
export function formatMZNCompact(value: number): string {
  if (isNaN(value)) return '—';
  const fmt = new Intl.NumberFormat('pt-MZ', {
    notation: 'compact',
    compactDisplay: 'short',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${fmt.format(value)} MT`;
}

/**
 * @deprecated Use `formatMZNCompact` nos novos módulos.
 */
export function formatCurrencyCompact(value: number): string {
  return formatMZNCompact(value);
}

/**
 * Parse de string de moeda → número.
 * Aceita formatos com separador decimal vírgula ou ponto.
 */
export function parseCurrency(value: string): number {
  // Remove tudo excepto dígitos, vírgula e ponto; normaliza decimal.
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=.*\.)/g, '') // remove pontos de milhar (todos excepto o último)
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
}

/**
 * Formata com moeda arbitrária (para módulos multi-moeda como faturação/compras).
 */
export function formatCurrencyFull(value: number, currency: string, locale = 'pt-MZ'): string {
  if (isNaN(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
