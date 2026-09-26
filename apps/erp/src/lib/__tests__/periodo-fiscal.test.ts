import { describe, it, expect } from 'vitest';
import { intervaloDoDiaMaputo } from '../periodo-fiscal';

describe('intervaloDoDiaMaputo', () => {
  it('o fim apanha o último dia inteiro em Maputo (23:59:59.999 +02:00)', () => {
    const r = intervaloDoDiaMaputo({ dataInicio: '2026-04-01', dataFim: '2026-06-30' });
    expect(new Date(r.dataFim as string).toISOString()).toBe('2026-06-30T21:59:59.999Z');
    // Um lançamento de 30/06 às 20h17 UTC fica dentro.
    expect(new Date('2026-06-30T20:17:00Z') <= new Date(r.dataFim as string)).toBe(true);
  });

  it('o início é a meia-noite de Maputo (22h00 UTC da véspera)', () => {
    const r = intervaloDoDiaMaputo({ dataInicio: '2026-01-01', dataFim: '2026-01-31' });
    expect(new Date(r.dataInicio as string).toISOString()).toBe('2025-12-31T22:00:00.000Z');
  });

  it('valores que não são aaaa-mm-dd passam inalterados (o schema recusa-os)', () => {
    const r = intervaloDoDiaMaputo({ dataInicio: 'lixo', dataFim: undefined, outro: 'x' });
    expect(r).toEqual({ dataInicio: 'lixo', dataFim: undefined, outro: 'x' });
  });
});
