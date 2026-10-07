import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

/**
 * Sessão + permissões das acções sobre documentos de faturação (#148).
 *
 * As permissões vêm da sessão — a mesma fonte que o `createSafeAction` usa para
 * recusar. O ecrã só esconde o que a action recusaria; nunca decide sozinho.
 */
export const PERM = {
  faturaPagar: 'faturacao:fatura:pagar',
  faturaGerir: 'faturacao:fatura:gerir',
  ncLiquidar: 'faturacao:nc:liquidar',
  ncCancelar: 'faturacao:nc:cancelar',
  proformaCancelar: 'faturacao:proforma:cancelar',
  cotacaoGerir: 'faturacao:cotacao:gerir',
  caixaOperar: 'caixa:operar',
  bancaEscrita: 'financas:banca:escrita',
} as const;

export interface AcessoDocumento {
  ctx: { tenantId: string; userId: string };
  tem: (permissao: string) => boolean;
}

/** Sem sessão, vai para o login. */
export async function acessoDocumento(): Promise<AcessoDocumento> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  return { ctx: { tenantId, userId }, tem: (p) => permissions.includes(p) };
}


/** O documento não está num estado que admita a acção. */
export function AvisoEstado({
  mensagem,
  voltar,
  accao,
}: {
  mensagem: string;
  voltar: string;
  /** Acção alternativa (ex.: «Rejeitar» numa cotação já enviada). */
  accao?: { href: string; rotulo: string };
}) {
  return (
    <div
      className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm"
      data-testid="documento-aviso-estado"
    >
      <p>{mensagem}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {accao && (
          <Button asChild size="sm">
            <Link href={accao.href}>{accao.rotulo}</Link>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href={voltar}>Voltar ao documento</Link>
        </Button>
      </div>
    </div>
  );
}
