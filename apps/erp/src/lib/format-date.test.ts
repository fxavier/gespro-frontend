import { describe, it, expect } from 'vitest';
import { formatarData, formatarDataHora, formatarDataExtensa } from './format-date';

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
