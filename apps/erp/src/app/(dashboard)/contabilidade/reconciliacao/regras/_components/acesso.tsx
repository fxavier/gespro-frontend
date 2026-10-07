import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export const PERM_RECONCILIACAO = 'financas:banca:reconciliacao';
export const PERM_LEITURA = 'financas:leitura';

export interface AcessoRegras {
  ctx: { tenantId: string; userId: string };
  podeLer: boolean;
  podeEscrever: boolean;
}

/**
 * Sessão + permissões das regras de sugestão (issue #140): lê quem tiver
 * `financas:banca:reconciliacao` OU `financas:leitura`; escreve só quem tiver a
 * primeira. Sem sessão, vai para o login.
 */
export async function acessoRegras(): Promise<AcessoRegras> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const tem = (p: string) => permissions.includes(p);
  const podeEscrever = tem(PERM_RECONCILIACAO);
  return {
    ctx: { tenantId, userId },
    podeLer: podeEscrever || tem(PERM_LEITURA),
    podeEscrever,
  };
}

