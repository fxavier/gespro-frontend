import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { toCsv } from './csv';
import { toXlsx } from './xlsx';
import { serializeCell, type Dataset } from './dataset';

// Valor com mais precisão do que um Number consegue representar sem perda.
// Prova que a serialização usa Decimal.toString() e NUNCA Number().
const DECIMAL_PRECISO = new Prisma.Decimal('9007199254740993.01');

const dataset: Dataset = {
  nome: 'facturas',
  colunas: [
    { key: 'numero', header: 'Número', type: 'text' },
    { key: 'qtd', header: 'Quantidade', type: 'integer' },
    { key: 'total', header: 'Total (MZN)', type: 'currency' },
    { key: 'taxa', header: 'Taxa IVA', type: 'decimal' },
    { key: 'data', header: 'Data', type: 'date' },
    { key: 'pago', header: 'Pago', type: 'boolean' },
  ],
  linhas: [
    {
      numero: 'FT/2026/000001',
      qtd: 3,
      total: new Prisma.Decimal('1234.56'),
      taxa: new Prisma.Decimal('0.160000'),
      data: new Date('2026-07-20T10:00:00Z'),
      pago: true,
    },
    {
      numero: 'FT/2026/000002',
      qtd: 1,
      total: DECIMAL_PRECISO,
      taxa: new Prisma.Decimal('0.160000'),
      data: new Date('2026-07-21T00:00:00Z'),
      pago: false,
    },
  ],
};

describe('serializeCell — Decimal lossless', () => {
  it('preserva a precisão exacta do Decimal (sem passar por Number)', () => {
    expect(serializeCell(DECIMAL_PRECISO, 'currency')).toBe('9007199254740993.01');
    // Prova negativa: Number() perderia precisão neste valor.
    expect(String(Number(DECIMAL_PRECISO.toString()))).not.toBe('9007199254740993.01');
  });

  it('serializa datas em ISO e booleanos em Sim/Não', () => {
    expect(serializeCell(new Date('2026-07-20T10:00:00Z'), 'date')).toBe('2026-07-20');
    expect(serializeCell(true, 'boolean')).toBe('Sim');
    expect(serializeCell(false, 'boolean')).toBe('Não');
  });
});

describe('toCsv', () => {
  const csv = toCsv(dataset);
  const linhas = csv.replace('﻿', '').split('\r\n');

  it('começa com BOM UTF-8', () => {
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('cabeçalho em Português com separador ;', () => {
    expect(linhas[0]).toBe('Número;Quantidade;Total (MZN);Taxa IVA;Data;Pago');
  });

  it('preserva o Decimal como string exacta na célula', () => {
    expect(linhas[2]).toContain('9007199254740993.01');
  });

  it('mantém o ponto decimal (lossless, não formatação pt-PT)', () => {
    expect(linhas[1]).toContain('1234.56');
    // Decimal.toString() normaliza zeros à direita (0.160000 → 0.16), sem perda.
    expect(linhas[1]).toContain('0.16');
  });
});

describe('toXlsx', () => {
  it('escreve decimais como texto lossless e inteiros como número', () => {
    const bytes = toXlsx(dataset);
    const wb = XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Cabeçalho na linha 1
    expect((ws['A1'] as XLSX.CellObject).v).toBe('Número');
    expect((ws['C1'] as XLSX.CellObject).v).toBe('Total (MZN)');

    // Linha 3 (segunda de dados): total de alta precisão preservado como texto
    const totalCel = ws['C3'] as XLSX.CellObject;
    expect(totalCel.t).toBe('s'); // string
    expect(totalCel.v).toBe('9007199254740993.01');

    // Quantidade escrita como número
    const qtdCel = ws['B2'] as XLSX.CellObject;
    expect(qtdCel.t).toBe('n');
    expect(qtdCel.v).toBe(3);
  });
});
