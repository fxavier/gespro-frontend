import { describe, it, expect } from 'vitest';
import { gerarPalavraPasseInicial } from '../palavra-passe';

describe('gerarPalavraPasseInicial', () => {
  it('tem o formato legível de três grupos', () => {
    expect(gerarPalavraPasseInicial()).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  });

  it('não usa caracteres que se confundem ao ser ditados', () => {
    const amostra = Array.from({ length: 200 }, gerarPalavraPasseInicial).join('');
    expect(amostra).not.toMatch(/[0O1lI]/);
  });

  it('não se repete', () => {
    const cem = new Set(Array.from({ length: 100 }, gerarPalavraPasseInicial));
    expect(cem.size).toBe(100);
  });
});
