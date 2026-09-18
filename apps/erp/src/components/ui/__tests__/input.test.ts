import { describe, expect, it } from 'vitest';
import { semZerosAEsquerda } from '../input';

describe('semZerosAEsquerda', () => {
  it('tira o zero que o formulário deixou à frente do que se escreve', () => {
    expect(semZerosAEsquerda('05')).toBe('5');
    expect(semZerosAEsquerda('007')).toBe('7');
    expect(semZerosAEsquerda('-05')).toBe('-5');
  });

  it('preserva o zero que faz parte do número', () => {
    expect(semZerosAEsquerda('0')).toBe('0');
    expect(semZerosAEsquerda('0.5')).toBe('0.5');
    expect(semZerosAEsquerda('-0.25')).toBe('-0.25');
    expect(semZerosAEsquerda('')).toBe('');
    expect(semZerosAEsquerda('10')).toBe('10');
  });
});
