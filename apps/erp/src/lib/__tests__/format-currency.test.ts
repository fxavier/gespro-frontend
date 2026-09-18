/**
 * O símbolo do metical depende do ICU do runtime — já foi «MZN» e hoje é
 * «MTn». Este teste tranca a saída em «MT», que é o que a casa mostra, para a
 * próxima actualização do Node não mudar todos os valores do produto em
 * silêncio.
 */

import { describe, it, expect } from 'vitest';
import { formatMZN } from '../format-currency';

/**
 * O ICU separa grupos e símbolo com espaços inquebráveis (U+00A0, U+202F) —
 * e faz bem, senão «48 250,00 MT» parte-se ao fim da linha. Para comparar,
 * reduz-se tudo a um espaço normal.
 */
const normalizar = (s: string) => s.replace(/\s/g, ' ');

describe('formatMZN', () => {
  it('usa «MT» como símbolo, e mais nenhuma variante', () => {
    const saida = formatMZN(48250);
    expect(saida).toMatch(/MT$/);
    expect(saida).not.toMatch(/MTn|MZN/);
  });

  it('formata com vírgula decimal e duas casas', () => {
    expect(normalizar(formatMZN(1234.5))).toBe('1234,50 MT');
  });

  it('aceita string (a fronteira SC→CC serializa Decimal para string)', () => {
    expect(normalizar(formatMZN('13467.60'))).toBe('13 467,60 MT');
  });

  it('devolve «—» para valores não numéricos', () => {
    expect(formatMZN('nada')).toBe('—');
  });
});
