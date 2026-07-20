/**
 * Property tests — invariantes de totais de Venda (WS C)
 *
 * Verifica:
 *  1. subtotal = Σ(precoUnitario * quantidade * (1 - desconto/100))
 *  2. ivaTotal = Σ(subtotalItem * taxaIva)
 *  3. total = subtotal + ivaTotal
 *  4. Valores não negativos
 *  5. IVA 16% padrão moçambicano (taxaIva = 0.16)
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Lógica de cálculo extraída do venda.service.ts (função pura — testável)
// ---------------------------------------------------------------------------

interface ItemInput {
  quantidade: number;
  precoUnitario: number;
  desconto: number; // percentagem 0-100
  taxaIva: number;  // fracção 0-1
}

interface ItemCalculado {
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
}

function calcularItem(item: ItemInput): ItemCalculado {
  const preco = new D(item.precoUnitario);
  const qtd = new D(item.quantidade);
  const desc = new D(item.desconto);
  const taxaIva = new D(item.taxaIva);

  const subtotalBruto = preco.mul(qtd);
  const descontoValor = subtotalBruto.mul(desc).div(100);
  const subtotal = subtotalBruto.minus(descontoValor);
  const ivaItem = subtotal.mul(taxaIva);
  const total = subtotal.plus(ivaItem);

  return { subtotal, ivaItem, total };
}

interface TotaisVenda {
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

function calcularTotaisVenda(itens: ItemInput[]): TotaisVenda {
  let subtotal = new D(0);
  let ivaTotal = new D(0);

  for (const item of itens) {
    const calc = calcularItem(item);
    subtotal = subtotal.plus(calc.subtotal);
    ivaTotal = ivaTotal.plus(calc.ivaItem);
  }

  return { subtotal, ivaTotal, total: subtotal.plus(ivaTotal) };
}

// ---------------------------------------------------------------------------
// Arbitrários
// ---------------------------------------------------------------------------

const positiveDecimalArb = fc
  .float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100); // 2 casas decimais

const descontoArb = fc
  .float({ min: Math.fround(0), max: Math.fround(100), noNaN: true, noDefaultInfinity: true })
  .map((n) => Math.round(n * 100) / 100);

const itemArb = fc.record({
  quantidade: positiveDecimalArb,
  precoUnitario: positiveDecimalArb,
  desconto: descontoArb,
  taxaIva: fc.constantFrom(0, 0.05, 0.12, 0.16, 0.20), // taxas comuns MZ
});

const vendaArb = fc
  .array(itemArb, { minLength: 1, maxLength: 20 })
  .filter((itens) => itens.length > 0);

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('Invariantes de totais da Venda', () => {
  it('[property] subtotal = Σ subtotalItem', () => {
    fc.assert(
      fc.property(vendaArb, (itens) => {
        const totais = calcularTotaisVenda(itens);
        const somaSubtotais = itens.reduce(
          (acc, item) => acc.plus(calcularItem(item).subtotal),
          new D(0),
        );
        expect(totais.subtotal.toFixed(4)).toBe(somaSubtotais.toFixed(4));
      }),
    );
  });

  it('[property] ivaTotal = Σ ivaItem', () => {
    fc.assert(
      fc.property(vendaArb, (itens) => {
        const totais = calcularTotaisVenda(itens);
        const somaIva = itens.reduce(
          (acc, item) => acc.plus(calcularItem(item).ivaItem),
          new D(0),
        );
        expect(totais.ivaTotal.toFixed(4)).toBe(somaIva.toFixed(4));
      }),
    );
  });

  it('[property] total = subtotal + ivaTotal', () => {
    fc.assert(
      fc.property(vendaArb, (itens) => {
        const { subtotal, ivaTotal, total } = calcularTotaisVenda(itens);
        expect(total.toFixed(4)).toBe(subtotal.plus(ivaTotal).toFixed(4));
      }),
    );
  });

  it('[property] todos os valores são não-negativos', () => {
    fc.assert(
      fc.property(vendaArb, (itens) => {
        const { subtotal, ivaTotal, total } = calcularTotaisVenda(itens);
        expect(subtotal.greaterThanOrEqualTo(0)).toBe(true);
        expect(ivaTotal.greaterThanOrEqualTo(0)).toBe(true);
        expect(total.greaterThanOrEqualTo(0)).toBe(true);
      }),
    );
  });

  it('[property] total >= subtotal (IVA não pode ser negativo)', () => {
    fc.assert(
      fc.property(vendaArb, (itens) => {
        const { subtotal, total } = calcularTotaisVenda(itens);
        expect(total.greaterThanOrEqualTo(subtotal)).toBe(true);
      }),
    );
  });

  it('[property] desconto 0% → subtotal = precoUnitario * quantidade', () => {
    fc.assert(
      fc.property(
        fc.record({
          quantidade: positiveDecimalArb,
          precoUnitario: positiveDecimalArb,
          taxaIva: fc.constant(0.16),
        }),
        ({ quantidade, precoUnitario, taxaIva }) => {
          const item = { quantidade, precoUnitario, desconto: 0, taxaIva };
          const { subtotal } = calcularItem(item);
          const esperado = new D(precoUnitario).mul(quantidade);
          expect(subtotal.toFixed(4)).toBe(esperado.toFixed(4));
        },
      ),
    );
  });

  it('[property] desconto 100% → subtotal = 0 e ivaItem = 0', () => {
    fc.assert(
      fc.property(
        fc.record({
          quantidade: positiveDecimalArb,
          precoUnitario: positiveDecimalArb,
          taxaIva: fc.constant(0.16),
        }),
        ({ quantidade, precoUnitario, taxaIva }) => {
          const item = { quantidade, precoUnitario, desconto: 100, taxaIva };
          const { subtotal, ivaItem, total } = calcularItem(item);
          expect(subtotal.toFixed(4)).toBe('0.0000');
          expect(ivaItem.toFixed(4)).toBe('0.0000');
          expect(total.toFixed(4)).toBe('0.0000');
        },
      ),
    );
  });

  it('IVA 16% moçambicano — exemplo concreto', () => {
    // Produto: 100 MT × 2 unidades, sem desconto, IVA 16%
    const item: ItemInput = { quantidade: 2, precoUnitario: 100, desconto: 0, taxaIva: 0.16 };
    const { subtotal, ivaItem, total } = calcularItem(item);

    expect(subtotal.toFixed(2)).toBe('200.00');
    expect(ivaItem.toFixed(2)).toBe('32.00');
    expect(total.toFixed(2)).toBe('232.00');
  });

  it('desconto 50% — exemplo concreto', () => {
    // Produto: 200 MT × 1 unidade, 50% desconto, IVA 16%
    const item: ItemInput = { quantidade: 1, precoUnitario: 200, desconto: 50, taxaIva: 0.16 };
    const { subtotal, ivaItem, total } = calcularItem(item);

    expect(subtotal.toFixed(2)).toBe('100.00');
    expect(ivaItem.toFixed(2)).toBe('16.00');
    expect(total.toFixed(2)).toBe('116.00');
  });
});
