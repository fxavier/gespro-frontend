import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/** Editar e anular um rascunho pedem a mesma permissão que criar (#137, D4). */
export const PERM_ESCRITA_LANCAMENTOS = 'financas:lancamentos:escrita';

export interface AcessoLancamentos {
  ctx: { tenantId: string; userId: string };
  podeEscrever: boolean;
}

/** Sessão + permissão de escrita nos lançamentos. Sem sessão, vai para o login. */
export async function acessoLancamentos(): Promise<AcessoLancamentos> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  return {
    ctx: { tenantId, userId },
    podeEscrever: permissions.includes(PERM_ESCRITA_LANCAMENTOS),
  };
}
