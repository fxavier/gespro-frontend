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

// ============================================================
// Estado da viatura acompanha a actividade/rota (#174)
// ============================================================

/** Cliente transaccional mínimo — serve o `tx` do `prisma` estendido e o do `prismaBase`. */
interface TxViatura {
  viatura: {
    updateMany(args: {
      where: { id: string; tenantId: string; estado: 'DISPONIVEL' | 'EM_ACTIVIDADE' };
      data: { estado: 'DISPONIVEL' | 'EM_ACTIVIDADE' };
    }): Promise<{ count: number }>;
  };
}

/**
 * Põe a viatura `EM_ACTIVIDADE` ao iniciar uma actividade/rota, na transacção do chamador.
 * Actualização condicional (só a partir de `DISPONIVEL`): em manutenção, inactiva ou já ocupada
 * noutra actividade/rota, recusa com `VIATURA_INDISPONIVEL` e a transacção inteira volta atrás.
 */
export async function ocuparViaturaEmTx(tx: TxViatura, viaturaId: string, ctx: { tenantId: string }): Promise<void> {
  const { count } = await tx.viatura.updateMany({
    where: { id: viaturaId, tenantId: ctx.tenantId, estado: 'DISPONIVEL' },
    data: { estado: 'EM_ACTIVIDADE' },
  });
  if (count === 0) {
    throw new BusinessRuleError(
      'VIATURA_INDISPONIVEL',
      'A viatura não está disponível (em manutenção, inactiva ou já em actividade).',
      { viaturaId },
    );
  }
}

/** Devolve a viatura a `DISPONIVEL` ao terminar (concluir/cancelar) uma actividade/rota em curso. */
export async function libertarViaturaEmTx(tx: TxViatura, viaturaId: string, ctx: { tenantId: string }): Promise<void> {
  await tx.viatura.updateMany({
    where: { id: viaturaId, tenantId: ctx.tenantId, estado: 'EM_ACTIVIDADE' },
    data: { estado: 'DISPONIVEL' },
  });
}

/**
 * Troca de viatura num item em curso (actividade EM_CURSO/SUSPENSA, rota ATIVA/PAUSADA), na
 * transacção do chamador: liberta a antiga e ocupa a nova (que passa pela mesma recusa
 * `VIATURA_INDISPONIVEL`). Fora de curso, ou sem troca efectiva, não toca em viatura nenhuma.
 */
export async function trocarViaturaEmTx(
  tx: TxViatura,
  antiga: string | null,
  nova: string | null,
  emCurso: boolean,
  ctx: { tenantId: string },
): Promise<void> {
  if (!emCurso || antiga === nova) return;
  if (antiga) await libertarViaturaEmTx(tx, antiga, ctx);
  if (nova) await ocuparViaturaEmTx(tx, nova, ctx);
}
