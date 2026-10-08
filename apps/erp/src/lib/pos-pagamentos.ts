/**
 * Pagamentos do terminal POS (#128) — transforma a lista que o operador escreveu
 * (meio + valor recebido) nos `pagamentos` que `vendaService.criar` aceita: Σ valor = total
 * ao cêntimo (PAGAMENTOS_NAO_BATEM_TOTAL), com o total de `calcularTotaisVendaPOS`.
 *
 * Regras:
 *   - valor vazio, não numérico, ≤ 0 ou com mais de 2 casas → VALOR_INVALIDO (recusa, não arredonda);
 *   - Σ < total → EM_FALTA (com quanto falta);
 *   - Σ > total → o excesso é troco, e só o dinheiro dá troco: sai das linhas DINHEIRO (da última
 *     para a primeira; uma linha que fique a zero desaparece) e fica registado na última linha
 *     DINHEIRO que sobra. Excesso que o dinheiro não cubra, ou que o consuma todo → EXCESSO_SEM_DINHEIRO.
 *
 * Client-safe: no browser `@prisma/client` resolve para `index-browser` (só o Decimal).
 */
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { MetodoPagamentoTipoEnum } from '@/lib/validations/vendas';

export type MeioPagamentoPOS = z.infer<typeof MetodoPagamentoTipoEnum>;

export interface EntradaPagamentoPOS {
  tipo: MeioPagamentoPOS;
  /** O que o operador recebeu neste meio; aceita vírgula decimal ("85,60"). */
  valor: number | string;
}

export interface PagamentoPOS {
  tipo: MeioPagamentoPOS;
  valor: number;
  troco?: number;
}

export type MotivoRecusaPagamentosPOS =
  | 'SEM_PAGAMENTOS'
  | 'VALOR_INVALIDO'
  | 'EM_FALTA'
  | 'EXCESSO_SEM_DINHEIRO';

export type ResolucaoPagamentosPOS =
  | { ok: true; pagamentos: PagamentoPOS[]; troco: number }
  | { ok: false; motivo: MotivoRecusaPagamentosPOS; emFalta: number };

const ZERO = new Prisma.Decimal(0);

/** Valor recebido → Decimal positivo com ≤ 2 casas, ou `null` se inválido. */
export function lerValorPagamentoPOS(valor: number | string): Prisma.Decimal | null {
  let texto: string;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    texto = String(valor);
  } else {
    texto = valor.trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(texto)) return null;
  }
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(texto);
  } catch {
    return null;
  }
  if (!d.isFinite() || d.lte(0) || d.decimalPlaces() > 2) return null;
  return d;
}

export function resolverPagamentosPOS(
  total: number | string | Prisma.Decimal,
  entradas: readonly EntradaPagamentoPOS[],
): ResolucaoPagamentosPOS {
  const totalD = new Prisma.Decimal(String(total));
  if (entradas.length === 0) return { ok: false, motivo: 'SEM_PAGAMENTOS', emFalta: totalD.toNumber() };

  const linhas: Array<{ tipo: MeioPagamentoPOS; valor: Prisma.Decimal }> = [];
  for (const e of entradas) {
    const valor = lerValorPagamentoPOS(e.valor);
    if (!valor) return { ok: false, motivo: 'VALOR_INVALIDO', emFalta: 0 };
    linhas.push({ tipo: e.tipo, valor });
  }

  const pago = linhas.reduce((a, l) => a.plus(l.valor), ZERO);
  if (pago.lt(totalD)) return { ok: false, motivo: 'EM_FALTA', emFalta: totalD.minus(pago).toNumber() };

  const troco = pago.minus(totalD);
  if (troco.isZero()) {
    return { ok: true, pagamentos: linhas.map((l) => ({ tipo: l.tipo, valor: l.valor.toNumber() })), troco: 0 };
  }

  // O troco sai do dinheiro, da última linha para a primeira.
  let porDescontar = troco;
  for (let i = linhas.length - 1; i >= 0 && porDescontar.gt(0); i--) {
    if (linhas[i].tipo !== 'DINHEIRO') continue;
    const desconto = Prisma.Decimal.min(linhas[i].valor, porDescontar);
    linhas[i] = { ...linhas[i], valor: linhas[i].valor.minus(desconto) };
    porDescontar = porDescontar.minus(desconto);
  }
  const restantes = linhas.filter((l) => l.valor.gt(0));
  const ultimaDinheiro = restantes.map((l) => l.tipo).lastIndexOf('DINHEIRO');
  if (porDescontar.gt(0) || ultimaDinheiro < 0) {
    return { ok: false, motivo: 'EXCESSO_SEM_DINHEIRO', emFalta: 0 };
  }

  return {
    ok: true,
    pagamentos: restantes.map((l, i) => ({
      tipo: l.tipo,
      valor: l.valor.toNumber(),
      ...(i === ultimaDinheiro ? { troco: troco.toNumber() } : {}),
    })),
    troco: troco.toNumber(),
  };
}
