import 'server-only';

/**
 * Balanço simples por classes (ADR-0035 §8, issue #365).
 *
 * Não re-agrega partidas: lê o balancete de verificação (`gerarBalanceteVerificacao`, o
 * acumulado por PERÍODO 1..periodoFinal com o diário AB ou a abertura implícita) e passa-lhe
 * as linhas ao núcleo puro `montarBalanco` (`balanco.ts`), que as agrupa por conta de razão.
 *
 * `periodoFinal` por omissão: 13 com o exercício encerrado (provisório ou definitivo) — o
 * balanço depois do apuramento, com o resultado em 88 e o imposto estimado no passivo —, senão
 * o 12, com o resultado do período ainda por apurar no capital próprio.
 */
import { prisma } from '@/server/db/client';
import { periodoFinalPorOmissao } from '@/lib/state-machines';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { gerarBalanceteVerificacao } from './contabilidade.service';
import type { Ctx, EstadoExercicio } from './contabilidade.interface';
import { montarBalanco, type Balanco } from './balanco';

export type { Balanco, LinhaBalanco, MassaBalanco } from './balanco';

export interface BalancoResult extends Balanco {
  exercicio: { id: string; codigo: string; estado: EstadoExercicio; dataInicio: Date; dataFim: Date };
  periodoFinal: number;
}

export async function gerarBalanco(
  input: { exercicioId: string; periodoFinal?: number },
  ctx: Ctx,
): Promise<BalancoResult> {
  const exercicio = await prisma.exercicioContabil.findFirst({
    where: { id: input.exercicioId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, estado: true, dataInicio: true, dataFim: true },
  });
  if (!exercicio) throw new NotFoundError('Exercício contabilístico não encontrado');

  const periodoFinal = input.periodoFinal ?? periodoFinalPorOmissao(exercicio.estado);
  if (!Number.isInteger(periodoFinal) || periodoFinal < 1 || periodoFinal > 13) {
    throw new ValidationError('O período final do balanço tem de estar entre 1 e 13');
  }

  const balancete = await gerarBalanceteVerificacao(
    { exercicioId: exercicio.id, periodoInicial: 1, periodoFinal, incluir13: periodoFinal === 13 },
    ctx,
  );
  return { ...montarBalanco(balancete.linhas, balancete.contas), exercicio, periodoFinal };
}
