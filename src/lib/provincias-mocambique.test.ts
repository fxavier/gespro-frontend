import { describe, it, expect } from 'vitest';
import {
  PROVINCIAS_MOCAMBIQUE,
  NOMES_PROVINCIAS,
  ProvinciaEnum,
  getProvincias,
  getDistritosByProvincia,
} from './provincias-mocambique';

describe('PROVINCIAS_MOCAMBIQUE', () => {
  it('contém exactamente 11 províncias', () => {
    expect(PROVINCIAS_MOCAMBIQUE).toHaveLength(11);
  });

  it('cada província tem nome e distritos', () => {
    for (const p of PROVINCIAS_MOCAMBIQUE) {
      expect(p.nome).toBeTruthy();
      expect(p.distritos.length).toBeGreaterThan(0);
    }
  });

  it('inclui Maputo Cidade', () => {
    const nomes = PROVINCIAS_MOCAMBIQUE.map((p) => p.nome);
    expect(nomes).toContain('Maputo Cidade');
  });
});

describe('NOMES_PROVINCIAS', () => {
  it('é um array não vazio', () => {
    expect(NOMES_PROVINCIAS.length).toBe(11);
  });
});

describe('ProvinciaEnum (Zod)', () => {
  it('aceita nome de província válido', () => {
    expect(ProvinciaEnum.parse('Maputo')).toBe('Maputo');
    expect(ProvinciaEnum.parse('Niassa')).toBe('Niassa');
  });

  it('rejeita nome de província inválido', () => {
    expect(() => ProvinciaEnum.parse('Lisboa')).toThrow();
    expect(() => ProvinciaEnum.parse('')).toThrow();
  });
});

describe('getProvincias()', () => {
  it('devolve array de strings', () => {
    const result = getProvincias();
    expect(result).toHaveLength(11);
    expect(typeof result[0]).toBe('string');
  });
});

describe('getDistritosByProvincia()', () => {
  it('devolve distritos para Sofala', () => {
    const distritos = getDistritosByProvincia('Sofala');
    expect(distritos).toContain('Beira');
    expect(distritos.length).toBeGreaterThan(0);
  });

  it('devolve array vazio para província inexistente', () => {
    expect(getDistritosByProvincia('Inexistente')).toEqual([]);
  });
});
