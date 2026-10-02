/**
 * Property tests — invariantes de totais de Venda (WS C)
 *
 * Exercita a função REAL usada por `VendaService.criar` e pelo terminal POS:
 * `calcularTotaisVendaPOS` (@/lib/vendas-totais — ADR-0041 §3, arredondamento por linha
 * a 2 casas, meio para cima). Até à S2 este ficheiro testava uma cópia em linha de um
 * cálculo sem arredondamento, que já não existe no serviço.
 *
 * Verifica:
 *  1. subtotal = Σ subtotal das linhas (já arredondadas)
 *  2. ivaTotal = Σ ivaItem das linhas (já arredondados)
 *  3. total = subtotal + ivaTotal
 *  4. Valores não negativos; total >= subtotal
 *  5. desconto 0% → subtotal da linha = round2(preço × qtd); desconto 100% → zero
 *  6. IVA 16% padrão moçambicano (taxaIva = 0.16) — exemplos concretos
 *
 * O oráculo de arredondamento linha a linha vive em src/lib/__tests__/vendas-totais.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';

const D = Prisma.Decimal;
const r2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

interface ItemInput {
  quantidade: number;
  precoUnitario: number;
  desconto: number; // percentagem 0-100
  taxaIva: number;  // fracção 0-1
}

const calcularTotaisVenda = (itens: ItemInput[]) => calcularTotaisVendaPOS(itens);
const calcularItem = (item: ItemInput) => calcularTotaisVendaPOS([item]).linhas[0];

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

  it('[property] desconto 0% → subtotal = round2(precoUnitario * quantidade)', () => {
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
          // Com arredondamento por linha (ADR-0041 §3): round2(preço × qtd), não o produto em bruto.
          const esperado = r2(new D(String(precoUnitario)).mul(String(quantidade)));
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
