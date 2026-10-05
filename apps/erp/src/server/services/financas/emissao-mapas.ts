import 'server-only';
/**
 * Cabeçalho dos mapas contabilísticos em PDF (balanço, DRE, balancete arquivados — #365): a
 * entidade (nome, NUIT) do tenant e o «emitido por» lido da base pelo `ctx.userId` — a sessão
 * não traz nome nem email. Nome do utilizador, senão o email.
 */
import { prismaBase } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';

type Ctx = { tenantId: string; userId: string };

export async function emissaoDosMapas(ctx: Ctx, em: Date = new Date()) {
  const [tenant, utilizador] = await Promise.all([
    prismaBase.tenant.findFirst({ where: { id: ctx.tenantId }, select: { nome: true, nuit: true } }),
    prismaBase.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { nome: true, email: true },
    }),
  ]);
  if (!tenant) throw new NotFoundError('Entidade não encontrada');
  return {
    entidade: { nome: tenant.nome, nuit: tenant.nuit },
    emissao: { em, por: utilizador?.nome?.trim() || utilizador?.email || 'utilizador desconhecido' },
  };
}
