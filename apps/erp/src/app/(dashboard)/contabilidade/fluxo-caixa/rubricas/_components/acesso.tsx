import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { voltarSeguro } from '@/lib/validations/fluxo-caixa';

export const PERM_LEITURA = 'financas:fluxo-caixa:leitura';
export const PERM_CONFIGURAR = 'financas:fluxo-caixa:configurar';
export const PERM_VALIDAR = 'financas:fluxo-caixa:validar';

export interface AcessoDFC {
  ctx: { tenantId: string; userId: string };
  podeLer: boolean;
  podeConfigurar: boolean;
  podeValidar: boolean;
}

/** Sessão + as três permissões da DFC. Sem sessão, vai para o login. */
export async function acessoDFC(): Promise<AcessoDFC> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const tem = (p: string) => permissions.includes(p);
  return {
    ctx: { tenantId, userId },
    podeLer: tem(PERM_LEITURA) || tem(PERM_CONFIGURAR) || tem(PERM_VALIDAR),
    podeConfigurar: tem(PERM_CONFIGURAR),
    podeValidar: tem(PERM_VALIDAR),
  };
}

/** O `?voltar=` da URL, só se for um caminho interno da contabilidade. */
export function lerVoltar(v: string | string[] | undefined): string | null {
  return voltarSeguro(Array.isArray(v) ? v[0] : v);
}

export function SemPermissao({ mensagem }: { mensagem: string }) {
  return (
    <div
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm"
      data-testid="dfc-config-sem-permissao"
    >
      <p className="font-medium text-destructive">Sem permissão</p>
      <p className="mt-1 text-muted-foreground">{mensagem}</p>
    </div>
  );
}
