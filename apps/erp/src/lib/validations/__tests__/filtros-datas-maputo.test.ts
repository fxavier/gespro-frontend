/**
 * Issue #88 — o fim de um intervalo `aaaa-mm-dd` apanha o dia civil INTEIRO em Maputo.
 *
 * `z.coerce.date('2026-12-31')` dá 2026-12-31T00:00Z; usado como `lte`, deixa de fora os
 * lançamentos do próprio último dia. O contrato fica na fronteira por onde todos os
 * chamadores passam: os quatro schemas de filtro por datas da contabilidade.
 *
 * Instantes comparados por `getTime()` contra literais com `+02:00` — nunca com getters
 * de hora local (o host e o CI correm em fusos diferentes).
 */
import { describe, it, expect } from 'vitest';
import {
  FiltroLancamentoSchema,
  FiltroRazaoDatasSchema,
  FiltroBalanceteSchema,
  FiltroDRESchema,
} from '@/lib/validations/contabilidade';

const CONTA_ID = '3f2b8c1a-9d4e-4f6a-8b7c-1e2d3f4a5b6c';

type Caso = {
  nome: string;
  parse: (datas: Record<string, unknown>) => { success: boolean; data?: unknown };
};

const CASOS: Caso[] = [
  { nome: 'FiltroLancamentoSchema', parse: (d) => FiltroLancamentoSchema.safeParse({ ...d }) },
  {
    nome: 'FiltroRazaoDatasSchema',
    parse: (d) => FiltroRazaoDatasSchema.safeParse({ contaId: CONTA_ID, ...d }),
  },
  { nome: 'FiltroBalanceteSchema', parse: (d) => FiltroBalanceteSchema.safeParse({ ...d }) },
  { nome: 'FiltroDRESchema', parse: (d) => FiltroDRESchema.safeParse({ ...d }) },
];

const t = (iso: string) => new Date(iso).getTime();

function datasDe(caso: Caso, entrada: Record<string, unknown>) {
  const r = caso.parse(entrada);
  expect(r.success).toBe(true);
  const data = r.data as { dataInicio?: Date; dataFim?: Date };
  return data;
}

describe.each(CASOS)('$nome — intervalo aaaa-mm-dd em dias civis de Maputo (#88)', (caso) => {
  const DEZEMBRO = { dataInicio: '2026-12-01', dataFim: '2026-12-31' };

  it('dataInicio aaaa-mm-dd vira a meia-noite de Maputo (00:00:00.000 +02:00)', () => {
    const { dataInicio } = datasDe(caso, DEZEMBRO);
    expect(dataInicio).toBeInstanceOf(Date);
    expect(dataInicio!.getTime()).toBe(t('2026-12-01T00:00:00.000+02:00'));
  });

  it('dataFim aaaa-mm-dd vira o último milissegundo do dia em Maputo (23:59:59.999 +02:00)', () => {
    const { dataFim } = datasDe(caso, DEZEMBRO);
    expect(dataFim).toBeInstanceOf(Date);
    expect(dataFim!.getTime()).toBe(t('2026-12-31T23:59:59.999+02:00'));
  });

  it('um lançamento ao meio-dia do último dia fica dentro do intervalo', () => {
    const { dataInicio, dataFim } = datasDe(caso, DEZEMBRO);
    const lancamento = t('2026-12-31T12:00:00+02:00');
    expect(lancamento >= dataInicio!.getTime() && lancamento <= dataFim!.getTime()).toBe(true);
  });

  it('um lançamento do dia anterior em Maputo (30/11 às 23h30) fica fora pelo início', () => {
    const { dataInicio } = datasDe(caso, DEZEMBRO);
    expect(t('2026-11-30T23:30:00+02:00') >= dataInicio!.getTime()).toBe(false);
  });

  it('um lançamento do dia seguinte em Maputo (01/01 às 00h30) fica fora pelo fim', () => {
    const { dataFim } = datasDe(caso, DEZEMBRO);
    expect(t('2027-01-01T00:30:00+02:00') <= dataFim!.getTime()).toBe(false);
  });

  it('um Date já construído passa inalterado (a DFC chama com Date)', () => {
    const inicio = new Date('2026-12-01T00:00:00.000+02:00');
    const fim = new Date('2026-12-31T23:59:59.999+02:00');
    const { dataInicio, dataFim } = datasDe(caso, { dataInicio: inicio, dataFim: fim });
    expect(dataInicio!.getTime()).toBe(inicio.getTime());
    expect(dataFim!.getTime()).toBe(fim.getTime());
  });

  it('um Date à meia-noite UTC passa inalterado (o schema não reinterpreta Dates)', () => {
    const inicio = new Date('2026-12-01T00:00:00.000Z');
    const fim = new Date('2026-12-31T00:00:00.000Z');
    const { dataInicio, dataFim } = datasDe(caso, { dataInicio: inicio, dataFim: fim });
    expect(dataInicio!.getTime()).toBe(inicio.getTime());
    expect(dataFim!.getTime()).toBe(fim.getTime());
  });

  it('uma string ISO com hora passa exactamente para esse instante', () => {
    const { dataInicio, dataFim } = datasDe(caso, {
      dataInicio: '2026-12-01T08:15:00.000+02:00',
      dataFim: '2026-12-31T23:59:59.999+02:00',
    });
    expect(dataInicio!.getTime()).toBe(t('2026-12-01T08:15:00.000+02:00'));
    expect(dataFim!.getTime()).toBe(t('2026-12-31T23:59:59.999+02:00'));
  });

  it('uma string que não é data continua recusada', () => {
    expect(caso.parse({ dataInicio: 'nao-e-data', dataFim: '2026-12-31' }).success).toBe(false);
    expect(caso.parse({ dataInicio: '2026-12-01', dataFim: 'nao-e-data' }).success).toBe(false);
  });
});

describe('FiltroLancamentoSchema — datas opcionais', () => {
  it('sem datas, faz parse com dataInicio e dataFim undefined', () => {
    const r = FiltroLancamentoSchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data?.dataInicio).toBeUndefined();
    expect(r.data?.dataFim).toBeUndefined();
  });
});
