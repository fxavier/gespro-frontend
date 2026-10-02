/**
 * Oráculo S2 (A) — totais da venda POS (ADR-0041 §3; issue #306).
 *
 * `calcularTotaisVendaPOS(itens)` é o ÚNICO cálculo de totais da venda POS: o terminal
 * (cliente) e o servidor usam-no, para que Σ pagamentos possa igualar o total ao cêntimo.
 * Arredonda como a facturação — por linha, a 2 casas, meio para cima:
 *   subtotal = round2(qtd × preço × (1 − desconto/100))   (desconto em PERCENTAGEM 0–100)
 *   ivaItem  = round2(subtotal × taxaIva)                   (taxa em FRACÇÃO, 0.16)
 *   total    = subtotal + ivaItem
 * e os totais do documento são somas das linhas JÁ arredondadas.
 *
 * O oráculo independente usa Prisma.Decimal (ROUND_HALF_UP), nunca o código testado.
 * Escrito antes da implementação; o implementador não o altera.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';

const D = (v: unknown) => new Prisma.Decimal(String(v));
const r2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** Igualdade exacta de valores monetários, qualquer que seja a classe Decimal devolvida. */
function igual(recebido: unknown, esperado: string | Prisma.Decimal, rotulo = '') {
  expect(typeof recebido, `${rotulo} tem de ser Decimal, não number`).not.toBe('number');
  expect(D(recebido).equals(D(esperado)), `${rotulo}: ${String(recebido)} ≠ ${String(esperado)}`).toBe(true);
}

type Item = { quantidade: number; precoUnitario: number; desconto: number; taxaIva: number };

function oraculoLinha(i: Item) {
  const subtotal = r2(D(i.quantidade).mul(D(i.precoUnitario)).mul(D(100).minus(D(i.desconto))).div(100));
  const ivaItem = r2(subtotal.mul(D(i.taxaIva)));
  return { subtotal, ivaItem, total: subtotal.plus(ivaItem) };
}

describe('calcularTotaisVendaPOS — exemplos', () => {
  it('uma linha com desconto percentual: 3 × 33,33 − 10% = 89,99; IVA 16% = 14,40; total 104,39', () => {
    const r = calcularTotaisVendaPOS([{ quantidade: 3, precoUnitario: 33.33, desconto: 10, taxaIva: 0.16 }]);
    expect(r.linhas).toHaveLength(1);
    igual(r.linhas[0].subtotal, '89.99', 'linha.subtotal');
    igual(r.linhas[0].ivaItem, '14.40', 'linha.ivaItem');
    igual(r.linhas[0].total, '104.39', 'linha.total');
    igual(r.subtotal, '89.99', 'subtotal');
    igual(r.ivaTotal, '14.40', 'ivaTotal');
    igual(r.total, '104.39', 'total');
  });

  it('o IVA do documento é a soma das linhas arredondadas, não o arredondamento da soma', () => {
    // 10,03 × 16% = 1,6048 → 1,60 por linha; 3 linhas → 4,80 (e não round(4,8144) = 4,81).
    const linha = { quantidade: 1, precoUnitario: 10.03, desconto: 0, taxaIva: 0.16 };
    const r = calcularTotaisVendaPOS([linha, linha, linha]);
    expect(r.linhas).toHaveLength(3);
    for (const l of r.linhas) igual(l.ivaItem, '1.60', 'linha.ivaItem');
    igual(r.subtotal, '30.09', 'subtotal');
    igual(r.ivaTotal, '4.80', 'ivaTotal');
    igual(r.total, '34.89', 'total');
  });

  it('o subtotal da linha arredonda meio-cêntimo para cima (como Math.round da facturação)', () => {
    const r = calcularTotaisVendaPOS([{ quantidade: 1, precoUnitario: 0.125, desconto: 0, taxaIva: 0 }]);
    igual(r.linhas[0].subtotal, '0.13', 'linha.subtotal');
    igual(r.total, '0.13', 'total');
  });

  it('IVA a 0% e desconto de 100% dão zero, sem negativos', () => {
    const r = calcularTotaisVendaPOS([
      { quantidade: 2, precoUnitario: 50, desconto: 0, taxaIva: 0 },
      { quantidade: 1, precoUnitario: 999.99, desconto: 100, taxaIva: 0.16 },
    ]);
    igual(r.linhas[0].ivaItem, '0', 'isenta.ivaItem');
    igual(r.linhas[0].total, '100', 'isenta.total');
    igual(r.linhas[1].subtotal, '0', 'oferta.subtotal');
    igual(r.linhas[1].ivaItem, '0', 'oferta.ivaItem');
    igual(r.subtotal, '100', 'subtotal');
    igual(r.ivaTotal, '0', 'ivaTotal');
    igual(r.total, '100', 'total');
  });

  it('a ordem das linhas do resultado é a ordem dos itens', () => {
    const r = calcularTotaisVendaPOS([
      { quantidade: 1, precoUnitario: 100, desconto: 0, taxaIva: 0.16 },
      { quantidade: 1, precoUnitario: 200, desconto: 0, taxaIva: 0 },
    ]);
    igual(r.linhas[0].subtotal, '100', 'linha 1');
    igual(r.linhas[1].subtotal, '200', 'linha 2');
  });
});

describe('calcularTotaisVendaPOS — propriedades', () => {
  const arbItem: fc.Arbitrary<Item> = fc.record({
    quantidade: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 1, max: 50_000 }).map((n) => n / 1000)),
    precoUnitario: fc.integer({ min: 0, max: 5_000_000 }).map((c) => c / 100),
    desconto: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 10_000 }).map((n) => n / 100)),
    taxaIva: fc.constantFrom(0, 0.05, 0.16, 0.17),
  });

  it('cada linha coincide com o oráculo (round2 meio-para-cima) e os totais são somas das linhas arredondadas', () => {
    fc.assert(
      fc.property(fc.array(arbItem, { minLength: 1, maxLength: 12 }), (itens) => {
        const r = calcularTotaisVendaPOS(itens);
        expect(r.linhas).toHaveLength(itens.length);

        let sub = new Prisma.Decimal(0);
        let iva = new Prisma.Decimal(0);
        itens.forEach((it, k) => {
          const o = oraculoLinha(it);
          igual(r.linhas[k].subtotal, o.subtotal, `linha ${k} subtotal`);
          igual(r.linhas[k].ivaItem, o.ivaItem, `linha ${k} ivaItem`);
          igual(r.linhas[k].total, o.total, `linha ${k} total`);
          sub = sub.plus(o.subtotal);
          iva = iva.plus(o.ivaItem);
        });

        igual(r.subtotal, sub, 'subtotal');
        igual(r.ivaTotal, iva, 'ivaTotal');
        igual(r.total, sub.plus(iva), 'total');
        // Nunca mais de 2 casas: é o que permite Σ pagamentos = total ao cêntimo.
        expect(D(r.total).decimalPlaces()).toBeLessThanOrEqual(2);
        expect(D(r.total).equals(D(r.subtotal).plus(D(r.ivaTotal)))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('vendas-totais é client-safe', () => {
  it('não importa server-only nem nada de @/server (o terminal POS usa-o no browser)', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../vendas-totais.ts'), 'utf8');
    expect(fonte).not.toMatch(/['"]server-only['"]/);
    expect(fonte).not.toMatch(/['"]@\/server\//);
    expect(fonte).not.toMatch(/^\s*['"]use server['"]/m);
  });
});
