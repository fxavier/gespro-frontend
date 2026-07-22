import { describe, it, expect } from 'vitest';
import { formatMZN, formatMZNCompact, parseCurrency, formatCurrency, formatCurrencyFull } from './format-currency';

describe('formatMZN()', () => {
  it('formata número com 2 casas decimais', () => {
    const result = formatMZN(1234.5);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('50');
    // Deve conter "MT" (símbolo da moeda)
    expect(result).toContain('MT');
  });

  it('formata zero', () => {
    const result = formatMZN(0);
    expect(result).toContain('0');
  });

  it('aceita string numérica', () => {
    const result = formatMZN('1000');
    expect(result).toContain('1');
  });

  it('devolve "—" para NaN', () => {
    expect(formatMZN(NaN)).toBe('—');
    expect(formatMZN('abc')).toBe('—');
  });
});

describe('formatCurrency() (alias de retrocompatibilidade)', () => {
  it('é equivalente a formatMZN', () => {
    expect(formatCurrency(100)).toBe(formatMZN(100));
  });
});

describe('formatMZNCompact()', () => {
  it('formata valores com sufixo MT', () => {
    const result = formatMZNCompact(1500000);
    expect(result).toContain('MT');
    expect(result).toMatch(/\d/);
  });

  it('devolve "—" para NaN', () => {
    expect(formatMZNCompact(NaN)).toBe('—');
  });
});

describe('parseCurrency()', () => {
  it('parse de "1 234,50 MT" devolve 1234.5', () => {
    expect(parseCurrency('1 234,50 MT')).toBeCloseTo(1234.5);
  });

  it('parse de "1000.00" devolve 1000', () => {
    expect(parseCurrency('1000.00')).toBeCloseTo(1000);
  });

  it('devolve 0 para string inválida', () => {
    expect(parseCurrency('abc')).toBe(0);
  });
});

describe('formatCurrencyFull()', () => {
  it('formata com moeda USD', () => {
    const result = formatCurrencyFull(100, 'USD');
    expect(result).toMatch(/\d/);
  });
});
