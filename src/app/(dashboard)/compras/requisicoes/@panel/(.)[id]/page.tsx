/**
 * Painel lateral de inspecção rápida de requisição.
 * Rota interceptada: activa durante navegação client-side de lista → /[id].
 * Acesso directo ao URL renderiza [id]/page.tsx (detalhe completo).
 *
 * Este componente é um Server Component — busca os dados do servidor.
 */

import { notFound } from 'next/navigation';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { RequisicaoPainel } from '../../_components/requisicao-panel';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequisicaoPanelPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let requisicao;
  try {
    requisicao = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterRequisicao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!requisicao) notFound();

  return <RequisicaoPainel requisicao={requisicao} />;
}
