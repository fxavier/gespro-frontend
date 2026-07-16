// Helpers internos do WS F (não exportados para fora do módulo).
// Convenção: ficheiros prefixados com _ são privados ao módulo.

import 'server-only';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

// ============================================================
// transitar — validador genérico de máquina de estado
// ============================================================

/**
 * Valida se a transição de `estadoActual` para `estadoAlvo` é permitida
 * pelo mapa `TRANSICOES`. Lança BusinessRuleError('TRANSICAO_INVALIDA') se não.
 *
 * Generic: funciona com qualquer mapa de transições.
 */
export function transitar<Estado extends string>(
  TRANSICOES: Readonly<Record<Estado, ReadonlyArray<Estado>>>,
  estadoActual: Estado,
  estadoAlvo: Estado,
): void {
  const permitidas = TRANSICOES[estadoActual];
  if (!permitidas || !permitidas.includes(estadoAlvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição de ${estadoActual} para ${estadoAlvo} não é permitida.`,
      { estadoActual, estadoAlvo, permitidas: permitidas ?? [] },
    );
  }
}

// ============================================================
// assertTenant — garante que o recurso pertence ao tenant
// ============================================================

/**
 * Lança NotFoundError se o recurso não existir ou pertencer a outro tenant.
 * Uso: assertTenant(viatura, ctx.tenantId, 'Viatura').
 */
export function assertTenant<T extends { tenantId: string } | null>(
  recurso: T,
  tenantId: string,
  nomeEntidade: string,
): asserts recurso is NonNullable<T> {
  if (!recurso || recurso.tenantId !== tenantId) {
    throw new NotFoundError(`${nomeEntidade} não encontrada.`);
  }
}
