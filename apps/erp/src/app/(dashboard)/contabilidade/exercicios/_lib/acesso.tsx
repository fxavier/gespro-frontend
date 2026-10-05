import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import type { ExercicioContabil } from '@/server/services/financas/contabilidade.interface';

/** As três permissões do encerramento do exercício (ADR-0035, #138) — as mesmas das actions. */
export const PERM_ENCERRAR = 'financas:exercicio:encerrar';
export const PERM_REABRIR = 'financas:exercicio:reabrir';
export const PERM_ENCERRAR_DEFINITIVO = 'financas:exercicio:encerrar-definitivo';

export interface AcessoExercicios {
  ctx: { tenantId: string; userId: string };
  podeEncerrar: boolean;
  podeReabrir: boolean;
  podeEncerrarDefinitivo: boolean;
}

/** Sessão + permissões do encerramento. Sem sessão, vai para o login. */
export async function acessoExercicios(): Promise<AcessoExercicios> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  return {
    ctx: { tenantId, userId },
    podeEncerrar: permissions.includes(PERM_ENCERRAR),
    podeReabrir: permissions.includes(PERM_REABRIR),
    podeEncerrarDefinitivo: permissions.includes(PERM_ENCERRAR_DEFINITIVO),
  };
}

/** O exercício do tenant da sessão, ou `null` (id desconhecido ou de outro tenant). */
export async function obterExercicioDoTenant(
  id: string,
  ctx: { tenantId: string; userId: string },
): Promise<ExercicioContabil | null> {
  const exercicios = await runWithTenantContext(ctx, () => contabilidadeService.listarExercicios(ctx));
  return exercicios.find((e) => e.id === id && e.tenantId === ctx.tenantId) ?? null;
}

export function SemPermissao({ mensagem }: { mensagem: string }) {
  return (
    <div className="max-w-2xl rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-sm">
      <p className="font-medium text-destructive">Sem permissão</p>
      <p className="mt-1 text-muted-foreground">{mensagem}</p>
    </div>
  );
}
