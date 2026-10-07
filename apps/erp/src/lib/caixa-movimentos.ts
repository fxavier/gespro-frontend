/**
 * Constantes client-safe para classificação de movimentos de caixa.
 * Espelha a lógica de caixa.service.ts — alterações aqui afectam
 * fecharSessao, resumoSessao, analytics e a tabela de movimentos na UI.
 *
 * Client-safe: no browser `@prisma/client` resolve para `index-browser` (só o Decimal).
 */
import { Prisma } from '@prisma/client';

export const MOVIMENTOS_SAIDA = ['SANGRIA', 'DEVOLUCAO', 'PAGAMENTO'] as const;
/** Inclui ABERTURA para o sinal/cor na tabela de movimentos — NÃO para os totais (#91). */
export const MOVIMENTOS_ENTRADA = ['VENDA', 'RECEBIMENTO', 'REFORCO', 'ABERTURA'] as const;

export interface TotaisSessaoCaixa {
  totalEntradas: Prisma.Decimal;
  totalSaidas: Prisma.Decimal;
  saldoEsperado: Prisma.Decimal;
}

/**
 * A ÚNICA aritmética dos totais de uma sessão de caixa (#91/#92).
 * Ignora ABERTURA (o fundo já entra por `fundoInicial`) e FECHAMENTO (é a contagem
 * do fecho, não um movimento de dinheiro).
 */
export function totaisSessaoCaixa(
  movimentos: ReadonlyArray<{ tipo: string; valor: Prisma.Decimal | string | number }>,
  fundoInicial: Prisma.Decimal | string | number,
): TotaisSessaoCaixa {
  let totalEntradas = new Prisma.Decimal(0);
  let totalSaidas = new Prisma.Decimal(0);
  for (const m of movimentos) {
    if (m.tipo === 'ABERTURA' || m.tipo === 'FECHAMENTO') continue;
    if ((MOVIMENTOS_ENTRADA as readonly string[]).includes(m.tipo)) {
      totalEntradas = totalEntradas.plus(m.valor);
    } else if ((MOVIMENTOS_SAIDA as readonly string[]).includes(m.tipo)) {
      totalSaidas = totalSaidas.plus(m.valor);
    }
  }
  const saldoEsperado = new Prisma.Decimal(fundoInicial).plus(totalEntradas).minus(totalSaidas);
  return { totalEntradas, totalSaidas, saldoEsperado };
}
