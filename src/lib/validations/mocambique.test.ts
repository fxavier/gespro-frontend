import { describe, it, expect } from 'vitest';
import { nuit, biMocambicano, telefoneMz, emailMz } from './mocambique';

describe('nuit()', () => {
  const schema = nuit();

  it('aceita NUIT de 9 dígitos válido', () => {
    expect(schema.parse('123456789')).toBe('123456789');
    expect(schema.parse('400000001')).toBe('400000001');
  });

  it('rejeita NUIT com menos de 9 dígitos', () => {
    expect(() => schema.parse('12345678')).toThrow();
  });

  it('rejeita NUIT com mais de 9 dígitos', () => {
    expect(() => schema.parse('1234567890')).toThrow();
  });

  it('rejeita NUIT com todos os dígitos iguais', () => {
    expect(() => schema.parse('111111111')).toThrow();
    expect(() => schema.parse('000000000')).toThrow();
    expect(() => schema.parse('999999999')).toThrow();
  });

  it('rejeita NUIT com letras', () => {
    expect(() => schema.parse('12345678A')).toThrow();
  });

  it('rejeita string vazia', () => {
    expect(() => schema.parse('')).toThrow();
  });
});

describe('biMocambicano()', () => {
  const schema = biMocambicano();

  it('aceita BI válido (12 dígitos + letra maiúscula)', () => {
    expect(schema.parse('110100123456A')).toBe('110100123456A');
    expect(schema.parse('123456789012B')).toBe('123456789012B');
  });

  it('aceita BI com letra minúscula (normalizado internamente)', () => {
    // validarBI faz toUpperCase internamente, por isso lowercase passa
    expect(schema.parse('110100123456a')).toBe('110100123456a');
  });

  it('rejeita BI com menos de 13 caracteres', () => {
    expect(() => schema.parse('11010012345A')).toThrow();
  });

  it('rejeita BI sem letra no fim', () => {
    expect(() => schema.parse('1101001234561')).toThrow();
  });

  it('rejeita string vazia', () => {
    expect(() => schema.parse('')).toThrow();
  });
});

describe('telefoneMz()', () => {
  const schema = telefoneMz();

  it('aceita número moçambicano com 9 dígitos começando por 8', () => {
    expect(schema.parse('841234567')).toBe('841234567');
    expect(schema.parse('861234567')).toBe('861234567');
  });

  it('aceita com código de país +258', () => {
    expect(schema.parse('+258841234567')).toBe('+258841234567');
  });

  it('aceita com espaços', () => {
    expect(schema.parse('84 123 4567')).toBe('84 123 4567');
  });

  it('rejeita número com 7 dígitos', () => {
    expect(() => schema.parse('8412345')).toThrow();
  });
});

describe('emailMz()', () => {
  const schema = emailMz();

  it('aceita email válido', () => {
    expect(schema.parse('user@empresa.co.mz')).toBe('user@empresa.co.mz');
  });

  it('rejeita email sem @', () => {
    expect(() => schema.parse('invalid')).toThrow();
  });
});
