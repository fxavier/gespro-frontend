/**
 * Totais da venda POS (ADR-0041 §3) — o ÚNICO cálculo, partilhado pelo terminal
 * (browser) e por `VendaService.criar`: Σ pagamentos só iguala o total ao cêntimo
 * se os dois lados calcularem da mesma maneira.
 *
 * Arredonda como a facturação — por linha, a 2 casas, meio para cima — e os totais
 * do documento são somas das linhas já arredondadas.
 *
 * Client-safe: no browser `@prisma/client` resolve para `index-browser` (só o Decimal).
 */
import { Prisma } from '@prisma/client';

type Valor = number | string | Prisma.Decimal;

export interface ItemTotaisVendaPOS {
  quantidade: Valor;
  precoUnitario: Valor;
  /** Percentagem 0–100. */
  desconto?: Valor;
  /** Fracção (0.16). */
  taxaIva: Valor;
}

export interface LinhaTotaisVendaPOS {
  subtotal: Prisma.Decimal;
  ivaItem: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface TotaisVendaPOS {
  linhas: LinhaTotaisVendaPOS[];
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

const D = (v: Valor) => new Prisma.Decimal(String(v));
const r2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Arredondamento de UMA linha a partir da base já descontada (#570): subtotal e IVA a 2 casas,
 * meio para cima; total = subtotal + IVA. Partilhado com as linhas de Factura/NC/ND/Proforma/
 * Cotação (`LinhaDocumentoSchema`), cujo desconto é um valor e não uma percentagem.
 */
export function arredondarLinha(base: Valor, taxaIva: Valor): LinhaTotaisVendaPOS {
  const sub = r2(D(base));
  const iva = r2(sub.mul(D(taxaIva)));
  return { subtotal: sub, ivaItem: iva, total: sub.plus(iva) };
}

export function calcularTotaisVendaPOS(itens: readonly ItemTotaisVendaPOS[]): TotaisVendaPOS {
  let subtotal = new Prisma.Decimal(0);
  let ivaTotal = new Prisma.Decimal(0);
  const linhas = itens.map((i) => {
    const linha = arredondarLinha(
      D(i.quantidade).mul(D(i.precoUnitario)).mul(D(100).minus(D(i.desconto ?? 0))).div(100),
      i.taxaIva,
    );
    subtotal = subtotal.plus(linha.subtotal);
    ivaTotal = ivaTotal.plus(linha.ivaItem);
    return linha;
  });
  return { linhas, subtotal, ivaTotal, total: subtotal.plus(ivaTotal) };
}
