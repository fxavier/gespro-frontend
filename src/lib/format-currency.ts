
/**
 * Formata valores monetários para Metical Moçambicano (MT)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-MZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value) + ' MT';
}

/**
 * Formata valores monetários de forma compacta (K, M, B)
 */
export function formatCurrencyCompact(value: number): string {
  if (value >= 1000000000) {
    return (value / 1000000000).toFixed(1) + 'B MT';
  }
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + 'M MT';
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'K MT';
  }
  return formatCurrency(value);
}

/**
 * Parse string de moeda para número
 */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
}
