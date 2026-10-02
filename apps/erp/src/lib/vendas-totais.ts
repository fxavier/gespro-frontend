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

export function calcularTotaisVendaPOS(itens: readonly ItemTotaisVendaPOS[]): TotaisVendaPOS {
  let subtotal = new Prisma.Decimal(0);
  let ivaTotal = new Prisma.Decimal(0);
  const linhas = itens.map((i) => {
    const sub = r2(D(i.quantidade).mul(D(i.precoUnitario)).mul(D(100).minus(D(i.desconto ?? 0))).div(100));
    const iva = r2(sub.mul(D(i.taxaIva)));
    subtotal = subtotal.plus(sub);
    ivaTotal = ivaTotal.plus(iva);
    return { subtotal: sub, ivaItem: iva, total: sub.plus(iva) };
  });
  return { linhas, subtotal, ivaTotal, total: subtotal.plus(ivaTotal) };
}
