// Utilitário de máquina de estado para o módulo de inventário
import 'server-only';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Valida e executa uma transição de estado.
 * Lança BusinessRuleError('TRANSICAO_INVALIDA') se a transição não for permitida.
 */
export function transitar<S extends string>(
  mapa: Record<S, S[]>,
  estadoActual: S,
  novoEstado: S,
  entidade: string,
): void {
  const permitidos = mapa[estadoActual] ?? [];
  if (!permitidos.includes(novoEstado)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de "${estadoActual}" para "${novoEstado}" em ${entidade}.`,
      { estadoActual, novoEstado, permitidos },
    );
  }
}
