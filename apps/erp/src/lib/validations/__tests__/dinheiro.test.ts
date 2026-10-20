/**
 * `dinheiro()` (#568): número com no máximo duas casas decimais. A coluna é `Decimal(18,2)`;
 * um valor com mais casas era arredondado na gravação, depois de o equilíbrio ter sido
 * verificado sobre o valor por arredondar. Puro: sem BD.
 */
import { describe, expect, it } from 'vitest';

import { dinheiro } from '../common';

describe('dinheiro()', () => {
  it.each([0, 0.07, 0.29, 1.15, 86.21, 100, 1234567.89])('aceita %s', (v) => {
    expect(dinheiro().safeParse(v).success).toBe(true);
  });

  it.each([86.205, 13.795, 0.001, 1.999])('recusa %s', (v) => {
    expect(dinheiro().safeParse(v).success).toBe(false);
  });
});
