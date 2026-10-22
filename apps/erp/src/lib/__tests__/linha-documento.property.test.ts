/**
 * #570 — a linha de Factura/NC/ND/Proforma/Cotação (transform do `LinhaDocumentoSchema`) arredonda
 * como a venda POS: Decimal, a 2 casas, meio para cima, pela mesma função.
 *
 * Os dois caminhos diferem só no desconto: no documento é um VALOR (Decimal(18,2), subtraído à
 * base), no POS é uma PERCENTAGEM. Para comparar a linha com desconto, a base do documento
 * (q×p − d, exacta) entra no POS como preço de uma unidade sem desconto.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { LinhaDocumentoSchema } from '@/lib/validations/faturacao';
import { calcularTotaisVendaPOS } from '@/lib/vendas-totais';
import { TAXAS_IVA } from '@/lib/iva';

const linha = (quantidade: number, precoUnitario: number, desconto = 0, taxaIva = 0.16) =>
  LinhaDocumentoSchema.parse({ descricao: 'x', quantidade, precoUnitario, desconto, taxaIva });

// Divisores com até 4 casas (1/16 = 0,0625) põem a base muitas vezes num meio cêntimo exacto —
// é aí que o float e o Decimal divergem; um inteiro/10000 uniforme quase nunca lá cai.
const quantidade4 = fc
  .tuple(fc.integer({ min: 1, max: 20_000 }), fc.constantFrom(1, 2, 4, 8, 16, 10, 100, 1_000, 10_000))
  .map(([n, div]) => n / div);
const preco2 = fc.oneof(
  fc.integer({ min: 0, max: 5_000 }).map((n) => n / 100),
  fc.integer({ min: 0, max: 10_000_000 }).map((n) => n / 100),
);
const taxa = fc.constantFrom(...TAXAS_IVA);

/**
 * #617 — o desconto é um valor a 2 casas e nunca excede q × p: é a fracção k/1000 de q×p, truncada ao
 * cêntimo em Decimal (truncar garante d ≤ q×p). k = 1000 é a fronteira (d = q×p quando q×p tem
 * cêntimos exactos, subtotal 0); k = 0 é a linha sem desconto.
 */
const linhaComDesconto = fc
  .tuple(
    quantidade4,
    preco2,
    fc.oneof(fc.constant(0), fc.constant(1_000), fc.integer({ min: 0, max: 1_000 })),
    taxa,
  )
  .map(([q, p, k, t]) => {
    const d = new Prisma.Decimal(String(q))
      .mul(String(p))
      .mul(k)
      .div(1_000)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
      .toNumber();
    return [q, p, d, t] as const;
  });

describe('#570 — linha de documento = linha do POS', () => {
  it('exemplos: 0,5 × 2,01 = 1,01 e 1,125 × 10,04 = 11,30', () => {
    expect(linha(0.5, 2.01, 0, 0).subtotal).toBe(1.01);
    expect(linha(1.125, 10.04, 0, 0).subtotal).toBe(11.3);
  });

  it('fronteira #617: desconto = q × p ⇒ subtotal, IVA e total 0', () => {
    const l = linha(2, 22.59, 45.18);
    expect([l.subtotal, l.ivaItem, l.total]).toEqual([0, 0, 0]);
  });

  it('sem desconto: subtotal, IVA e total iguais a calcularTotaisVendaPOS de uma linha', () => {
    fc.assert(
      fc.property(quantidade4, preco2, taxa, (q, p, t) => {
        const l = linha(q, p, 0, t);
        const [pos] = calcularTotaisVendaPOS([{ quantidade: q, precoUnitario: p, taxaIva: t }]).linhas;
        expect([l.subtotal, l.ivaItem, l.total]).toEqual([
          pos.subtotal.toNumber(),
          pos.ivaItem.toNumber(),
          pos.total.toNumber(),
        ]);
      }),
      { numRuns: 2000 },
    );
  });

  it('com desconto em valor: igual ao POS sobre a base exacta q × p − d', () => {
    fc.assert(
      fc.property(linhaComDesconto, ([q, p, d, t]) => {
        const l = linha(q, p, d, t);
        const exacta = calcularTotaisVendaPOS([
          {
            quantidade: 1,
            // q×p − d em Decimal, sem passar por float
            precoUnitario: new Prisma.Decimal(String(q)).mul(String(p)).minus(String(d)),
            taxaIva: t,
          },
        ]).linhas[0];
        expect([l.subtotal, l.ivaItem, l.total]).toEqual([
          exacta.subtotal.toNumber(),
          exacta.ivaItem.toNumber(),
          exacta.total.toNumber(),
        ]);
      }),
      { numRuns: 2000 },
    );
  });
});
