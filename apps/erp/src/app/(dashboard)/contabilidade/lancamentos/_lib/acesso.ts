import 'server-only';
import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';

/** Editar e anular um rascunho pedem a mesma permissão que criar (#137, D4). */
export const PERM_ESCRITA_LANCAMENTOS = 'financas:lancamentos:escrita';

export interface AcessoLancamentos {
  ctx: { tenantId: string; userId: string };
  podeEscrever: boolean;
}

/** Sessão + permissão de escrita nos lançamentos. Sem sessão, vai para o login. */
export async function acessoLancamentos(): Promise<AcessoLancamentos> {
  const { session } = await exigirSessaoDeTenant();
  const { tenantId, id: userId, permissions } = session.user;
  return {
    ctx: { tenantId, userId },
    podeEscrever: permissions.includes(PERM_ESCRITA_LANCAMENTOS),
  };
}
