import { afterEach, describe, expect, it } from 'vitest';
import { intervaloDiasDosPeriodos } from '@/lib/periodo-fiscal';

/**
 * Oráculo de `intervaloDiasDosPeriodos` (S4, #284 — drill-down balancete → razão).
 *
 * Os períodos são construídos com as MESMAS fórmulas de
 * `criarExercicioComPeriodos` (contabilidade.service.ts, `inicioDeMesEmMaputo` /
 * `fimDeMesEmMaputo`): início = 00:00 de Maputo (22:00 UTC da véspera), fim =
 * 23:59:59.999 de Maputo (21:59:59.999 UTC do próprio dia); o período 13 tem
 * dataInicio = dataFim = fim de Dezembro.
 *
 * Nota: o helper assume entrada normalizada (inicial <= final, ambos 1..13) —
 * normalizar é responsabilidade de quem chama; aqui só se afirma comportamento
 * para entrada normalizada.
 */

type Periodo = { ordem: number; dataInicio: Date; dataFim: Date };

function inicioDeMesEmMaputo(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1) - 2 * 60 * 60 * 1000);
}

function fimDeMesEmMaputo(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 21, 59, 59, 999));
}

function periodosDoExercicio(ano: number): Periodo[] {
  const ps: Periodo[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    ps.push({ ordem: mes, dataInicio: inicioDeMesEmMaputo(ano, mes), dataFim: fimDeMesEmMaputo(ano, mes) });
  }
  const fimAno = fimDeMesEmMaputo(ano, 12);
  ps.push({ ordem: 13, dataInicio: fimAno, dataFim: fimAno });
  return ps;
}

const P2026 = periodosDoExercicio(2026);

// Fusos do processo sob os quais o resultado tem de ser idêntico: UTC (o servidor),
// oeste de Greenwich (um fim às 21:59Z cai no dia certo, um início às 22:00Z cai na
// véspera), extremo leste (+14: um fim às 21:59Z cai no dia seguinte) e o próprio Maputo.
const FUSOS = ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Africa/Maputo'];
const TZ_ORIGINAL = process.env.TZ;

function emCadaFuso(afirmar: () => void) {
  for (const tz of FUSOS) {
    process.env.TZ = tz;
    afirmar();
  }
}

afterEach(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

describe('intervaloDiasDosPeriodos', () => {
  it('construção: os inícios são instantes cujo dia UTC é a véspera do dia de Maputo', () => {
    // Garante que o oráculo distingue o dia de Maputo do dia UTC (toISOString().slice).
    expect(P2026[2].dataInicio.toISOString()).toBe('2026-02-28T22:00:00.000Z');
    expect(P2026[0].dataInicio.toISOString()).toBe('2025-12-31T22:00:00.000Z');
    expect(P2026[12].dataFim.toISOString()).toBe('2026-12-31T21:59:59.999Z');
  });

  it('um só mês (inicial = final): Março → 2026-03-01..2026-03-31', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 3, 3)).toEqual({ dataInicio: '2026-03-01', dataFim: '2026-03-31' });
    });
  });

  it('Janeiro: o início às 22:00Z de 31/12 do ano anterior dá 2026-01-01', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 1, 1)).toEqual({ dataInicio: '2026-01-01', dataFim: '2026-01-31' });
    });
  });

  it('intervalo 3..5 → 2026-03-01..2026-05-31', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 3, 5)).toEqual({ dataInicio: '2026-03-01', dataFim: '2026-05-31' });
    });
  });

  it('ano inteiro 1..12 → 2026-01-01..2026-12-31', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 1, 12)).toEqual({ dataInicio: '2026-01-01', dataFim: '2026-12-31' });
    });
  });

  it('1..13 → 2026-01-01..2026-12-31', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 1, 13)).toEqual({ dataInicio: '2026-01-01', dataFim: '2026-12-31' });
    });
  });

  it('12..13 → 2026-12-01..2026-12-31', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 12, 13)).toEqual({ dataInicio: '2026-12-01', dataFim: '2026-12-31' });
    });
  });

  it('13..13 → 2026-12-31..2026-12-31 (dataInicio = dataFim = fim de Dezembro)', () => {
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2026, 13, 13)).toEqual({ dataInicio: '2026-12-31', dataFim: '2026-12-31' });
    });
  });

  it('Fevereiro de ano bissexto (2028) termina a 29; de ano comum (2026) a 28', () => {
    const P2028 = periodosDoExercicio(2028);
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(P2028, 2, 2)).toEqual({ dataInicio: '2028-02-01', dataFim: '2028-02-29' });
      expect(intervaloDiasDosPeriodos(P2028, 3, 3)).toEqual({ dataInicio: '2028-03-01', dataFim: '2028-03-31' });
      expect(intervaloDiasDosPeriodos(P2026, 2, 2)).toEqual({ dataInicio: '2026-02-01', dataFim: '2026-02-28' });
    });
  });

  it('procura por `ordem`, não pela posição na lista', () => {
    const baralhados = [...P2026].reverse();
    emCadaFuso(() => {
      expect(intervaloDiasDosPeriodos(baralhados, 3, 5)).toEqual({ dataInicio: '2026-03-01', dataFim: '2026-05-31' });
    });
  });

  it('todos os pares normalizados i <= f dão o 1.º dia do mês i e o último do mês min(f,12)', () => {
    emCadaFuso(() => {
      for (let i = 1; i <= 13; i++) {
        for (let f = i; f <= 13; f++) {
          const mesIni = Math.min(i, 12);
          const mesFim = Math.min(f, 12);
          const diaIni = i === 13 ? 31 : 1;
          const ultimo = new Date(Date.UTC(2026, mesFim, 0)).getUTCDate();
          const pad = (n: number) => String(n).padStart(2, '0');
          expect(intervaloDiasDosPeriodos(P2026, i, f)).toEqual({
            dataInicio: `2026-${pad(mesIni)}-${pad(diaIni)}`,
            dataFim: `2026-${pad(mesFim)}-${pad(ultimo)}`,
          });
        }
      }
    });
  });

  it('falta o período inicial → null', () => {
    const semMarco = P2026.filter((p) => p.ordem !== 3);
    expect(intervaloDiasDosPeriodos(semMarco, 3, 5)).toBeNull();
  });

  it('falta o período final → null', () => {
    const semMaio = P2026.filter((p) => p.ordem !== 5);
    expect(intervaloDiasDosPeriodos(semMaio, 3, 5)).toBeNull();
    const sem13 = P2026.filter((p) => p.ordem !== 13);
    expect(intervaloDiasDosPeriodos(sem13, 12, 13)).toBeNull();
  });

  it('lista vazia → null', () => {
    expect(intervaloDiasDosPeriodos([], 1, 12)).toBeNull();
  });

  it('não altera a lista recebida', () => {
    const copia = P2026.map((p) => ({ ...p }));
    intervaloDiasDosPeriodos(P2026, 1, 13);
    expect(P2026).toEqual(copia);
  });
});
