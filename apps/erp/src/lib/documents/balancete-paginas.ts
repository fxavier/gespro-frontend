/**
 * Paginação do balancete de verificação para o PDF (S6, issue #286) — puro e
 * client-safe.
 *
 * Cada página leva até `linhasPorPagina` linhas e, à moda do PHC, o «Transporte»
 * (o acumulado das páginas anteriores) e o «A transportar» (transporte + as linhas
 * desta página). Só somam as linhas que compõem os totais do balancete: CONTA não
 * agregadora e fora de contexto, e a SINTETICA. SUBTOTAL_CLASSE e agregadoras já são
 * somas dessas linhas — contá-las duplicava valores.
 */
import { Prisma } from '@prisma/client';
import type { LinhaHierarquica, TotaisBV } from '@/server/services/financas/balancete-verificacao';

export interface PaginaBalancete {
  linhas: LinhaHierarquica[];
  /** null na 1.ª página; nas outras, o «A transportar» da anterior. */
  transporte: TotaisBV | null;
  /** null na última página; nas outras, transporte + Σ das linhas que contam nesta. */
  aTransportar: TotaisBV | null;
}

const CAMPOS = ['movD', 'movC', 'acumD', 'acumC', 'saldoDevedor', 'saldoCredor'] as const;

/** A linha entra nos totais do balancete (e por isso no transporte). */
export function linhaContaNosTotais(l: LinhaHierarquica): boolean {
  return (l.tipo === 'CONTA' && !l.agregadora && !l.contexto) || l.tipo === 'SINTETICA';
}

export function zeros(): TotaisBV {
  const z = new Prisma.Decimal(0);
  return { movD: z, movC: z, acumD: z, acumC: z, saldoDevedor: z, saldoCredor: z };
}

/** `base` + as linhas de `linhas` que contam nos totais (as outras são ignoradas). */
export function somarLinhasQueContam(base: TotaisBV, linhas: LinhaHierarquica[]): TotaisBV {
  const r = { ...base };
  for (const l of linhas) {
    if (!linhaContaNosTotais(l)) continue;
    for (const k of CAMPOS) r[k] = r[k].plus(l[k]);
  }
  return r;
}

export function paginarBalancete(linhas: LinhaHierarquica[], linhasPorPagina: number): PaginaBalancete[] {
  const tamanho = Math.max(1, Math.floor(linhasPorPagina));
  const paginas: PaginaBalancete[] = [];
  let transporte: TotaisBV | null = null;
  for (let i = 0; i < linhas.length; i += tamanho) {
    const desta = linhas.slice(i, i + tamanho);
    const ultima = i + tamanho >= linhas.length;
    const aTransportar: TotaisBV | null = ultima ? null : somarLinhasQueContam(transporte ?? zeros(), desta);
    paginas.push({ linhas: desta, transporte, aTransportar });
    transporte = aTransportar;
  }
  return paginas;
}
