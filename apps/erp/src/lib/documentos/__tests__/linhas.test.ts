/**
 * Oráculo da issue #77 — T2: aritmética pura das linhas de documento.
 *
 * O formulário mostrava um total e o servidor gravava outro (o 0 virava 0.16
 * só num dos lados). A propriedade que fecha isto: `calcularLinha` — o que a
 * UI mostra — coincide, ao cêntimo, com `LinhaDocumentoSchema.parse` — o que
 * o servidor grava. E a taxa 0 dá IVA 0, sempre.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calcularLinha, calcularTotais, type LinhaCalculo } from '@/lib/documentos/linhas';
import { TAXAS_IVA } from '@/lib/iva';
import { LinhaDocumentoSchema } from '@/lib/validations/faturacao';

const round2 = (x: number) => Math.round(x * 100) / 100;
const NUM_RUNS = 1000;

/** quantidade e preço com 2 casas; desconto com 2 casas e ≤ q·p. */
const linhaArb: fc.Arbitrary<LinhaCalculo> = fc
  .record({
    qCent: fc.integer({ min: 1, max: 100_000 }), // 0.01 .. 1000.00
    pCent: fc.integer({ min: 0, max: 10_000_000 }), // 0.00 .. 100000.00
    fracDesconto: fc.double({ min: 0, max: 1, noNaN: true }),
    taxaIva: fc.constantFrom(...TAXAS_IVA),
  })
  .map(({ qCent, pCent, fracDesconto, taxaIva }) => {
    const quantidade = qCent / 100;
    const precoUnitario = pCent / 100;
    const bruto = quantidade * precoUnitario;
    const desconto = Math.max(0, Math.floor(bruto * fracDesconto * 100) / 100);
    return { quantidade, precoUnitario, desconto, taxaIva };
  });

describe('calcularLinha — propriedades', () => {
  it('taxa 0 ⇒ iva = 0 e total = base', () => {
    fc.assert(
      fc.property(linhaArb, (l) => {
        const r = calcularLinha({ ...l, taxaIva: 0 });
        // `=== 0` e não `toBe(0)`: um −0 vindo de base −ε não é o defeito em causa.
        expect(r.iva === 0, `iva = ${r.iva}`).toBe(true);
        expect(r.total === r.base, `total ${r.total} ≠ base ${r.base}`).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('taxa 0.16 ⇒ iva = round2(base × 0.16)', () => {
    fc.assert(
      fc.property(linhaArb, (l) => {
        const r = calcularLinha({ ...l, taxaIva: 0.16 });
        expect(r.iva).toBe(round2(r.base * 0.16));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('base = round2(q·p − d) e total = base + iva (a 2 casas)', () => {
    fc.assert(
      fc.property(linhaArb, (l) => {
        const r = calcularLinha(l);
        expect(r.base).toBe(round2(l.quantidade * l.precoUnitario - l.desconto));
        expect(Math.abs(r.total - (r.base + r.iva))).toBeLessThan(0.005);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('mostrado = gravado: coincide com LinhaDocumentoSchema.parse', () => {
    fc.assert(
      fc.property(linhaArb, (l) => {
        const gravado = LinhaDocumentoSchema.parse({ descricao: 'x', ordemLinha: 0, ...l });
        const mostrado = calcularLinha(l);
        expect(mostrado).toEqual({ base: gravado.subtotal, iva: gravado.ivaItem, total: gravado.total });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('calcularTotais — propriedades', () => {
  it('é a soma das linhas arredondadas', () => {
    fc.assert(
      fc.property(fc.array(linhaArb, { minLength: 0, maxLength: 12 }), (linhas) => {
        const t = calcularTotais(linhas);
        const soma = linhas
          .map((l) => calcularLinha(l))
          .reduce((a, r) => ({ base: a.base + r.base, iva: a.iva + r.iva, total: a.total + r.total }), {
            base: 0,
            iva: 0,
            total: 0,
          });
        expect(Math.abs(t.base - soma.base)).toBeLessThan(0.005);
        expect(Math.abs(t.iva - soma.iva)).toBeLessThan(0.005);
        expect(Math.abs(t.total - soma.total)).toBeLessThan(0.005);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('só linhas isentas ⇒ iva total 0', () => {
    fc.assert(
      fc.property(fc.array(linhaArb, { minLength: 1, maxLength: 12 }), (linhas) => {
        const t = calcularTotais(linhas.map((l) => ({ ...l, taxaIva: 0 as const })));
        expect(t.iva === 0, `iva = ${t.iva}`).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('calcularLinha — exemplos da issue', () => {
  it('1 × 1000 a 0% ⇒ base 1000, iva 0, total 1000', () => {
    expect(calcularLinha({ quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0 })).toEqual({
      base: 1000,
      iva: 0,
      total: 1000,
    });
  });

  it('1000 a 0% + 1000 a 16% ⇒ base 2000, iva 160, total 2160', () => {
    expect(
      calcularTotais([
        { quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0 },
        { quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 },
      ]),
    ).toEqual({ base: 2000, iva: 160, total: 2160 });
  });
});
