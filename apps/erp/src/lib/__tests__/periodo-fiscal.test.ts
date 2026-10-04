import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inicioDoDiaMaputo, fimDoDiaMaputo, periodoPorOmissao } from '../periodo-fiscal';

describe('fimDoDiaMaputo', () => {
  it('o fim apanha o último dia inteiro em Maputo (23:59:59.999 +02:00)', () => {
    const fim = fimDoDiaMaputo('2026-06-30');
    expect(fim).toBe('2026-06-30T23:59:59.999+02:00');
    expect(new Date(fim as string).toISOString()).toBe('2026-06-30T21:59:59.999Z');
    // Um lançamento de 30/06 às 20h17 UTC fica dentro.
    expect(new Date('2026-06-30T20:17:00Z') <= new Date(fim as string)).toBe(true);
  });

  it('valores que não são aaaa-mm-dd passam inalterados (o schema recusa-os)', () => {
    const d = new Date('2026-06-30T00:00:00Z');
    expect(fimDoDiaMaputo('lixo')).toBe('lixo');
    expect(fimDoDiaMaputo(undefined)).toBeUndefined();
    expect(fimDoDiaMaputo(d)).toBe(d);
    expect(fimDoDiaMaputo('2026-06-30T10:00:00Z')).toBe('2026-06-30T10:00:00Z');
  });
});

describe('inicioDoDiaMaputo', () => {
  it('o início é a meia-noite de Maputo (22h00 UTC da véspera)', () => {
    const inicio = inicioDoDiaMaputo('2026-01-01');
    expect(inicio).toBe('2026-01-01T00:00:00.000+02:00');
    expect(new Date(inicio as string).toISOString()).toBe('2025-12-31T22:00:00.000Z');
  });

  it('valores que não são aaaa-mm-dd passam inalterados (o schema recusa-os)', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(inicioDoDiaMaputo('lixo')).toBe('lixo');
    expect(inicioDoDiaMaputo(undefined)).toBeUndefined();
    expect(inicioDoDiaMaputo(d)).toBe(d);
    expect(inicioDoDiaMaputo('2026-01-01T10:00:00Z')).toBe('2026-01-01T10:00:00Z');
  });
});

describe('periodoPorOmissao', () => {
  // O servidor corre em UTC: fixar o fuso do processo torna o caso vermelho em
  // qualquer máquina enquanto o ano vier de getFullYear() (hora local do processo).
  const tzOriginal = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  });

  it('à 00h30 de 01/01/2027 em Maputo (22h30 UTC de 31/12) o exercício por omissão é 2027', () => {
    vi.setSystemTime(new Date('2026-12-31T22:30:00Z'));
    expect(periodoPorOmissao()).toEqual({ dataInicio: '2027-01-01', dataFim: '2027-12-31' });
  });

  it('a meio do ano devolve o exercício corrente inteiro', () => {
    vi.setSystemTime(new Date('2026-06-15T10:00:00+02:00'));
    expect(periodoPorOmissao()).toEqual({ dataInicio: '2026-01-01', dataFim: '2026-12-31' });
  });
});
