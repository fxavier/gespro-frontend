import { describe, it, expect } from 'vitest';
import {
  dataParaDiaIso,
  diaIsoMaputo,
  diaIsoParaData,
  formatarData,
  formatarDataExtensa,
  formatarDataHora,
  formatarDiaIso,
} from './format-date';

describe('formatação de datas', () => {
  // 24/07/2026 13:01 UTC = 15:01 em Maputo (UTC+2). O valor tem de ser o
  // mesmo corra isto onde correr — é essa fixação que evita a falha de
  // hidratação nas tabelas.
  const instante = '2026-07-24T13:01:00.000Z';

  it('usa sempre o fuso de Maputo, não o da máquina', () => {
    expect(formatarDataHora(instante)).toContain('15:01');
    expect(formatarData(instante)).toBe('24/07/2026');
    expect(formatarDataExtensa(instante)).toContain('15:01');
  });

  it('aceita Date, string e número', () => {
    const esperado = formatarDataHora(instante);
    expect(formatarDataHora(new Date(instante))).toBe(esperado);
    expect(formatarDataHora(new Date(instante).getTime())).toBe(esperado);
  });

  it('devolve travessão para vazio ou inválido', () => {
    expect(formatarDataHora(null)).toBe('—');
    expect(formatarData(undefined)).toBe('—');
    expect(formatarDataExtensa('não é uma data')).toBe('—');
  });
});

describe('dia do documento (#242)', () => {
  it('diaIsoMaputo: entre as 00h e as 02h de Maputo já é o dia seguinte ao de UTC', () => {
    // 1 de Janeiro, 00h30 em Maputo = 31 de Dezembro, 22h30 UTC.
    const agora = new Date('2026-12-31T22:30:00Z');
    expect(diaIsoMaputo(0, agora)).toBe('2027-01-01');
    expect(diaIsoMaputo(30, agora)).toBe('2027-01-31');
  });

  it('diaIsoParaData: meio-dia de Maputo, qualquer que seja o fuso de quem converte', () => {
    const d = diaIsoParaData('2027-01-01');
    expect(d.toISOString()).toBe('2027-01-01T10:00:00.000Z');
    expect(formatarDiaIso(d)).toBe('2027-01-01');
  });

  it('diaIsoParaData: um ano de cinco algarismos não é um dia — Invalid Date', () => {
    expect(Number.isNaN(diaIsoParaData('92026-09-26').getTime())).toBe(true);
  });

  it('dataParaDiaIso: ida e volta, e vazio sem data válida', () => {
    expect(dataParaDiaIso(diaIsoParaData('2026-09-26'))).toBe('2026-09-26');
    expect(dataParaDiaIso(undefined)).toBe('');
    expect(dataParaDiaIso(new Date('x'))).toBe('');
  });
});
