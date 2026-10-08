/**
 * Cancelar Comissão (#131) — Server Component (NUNCA 'use client').
 *
 * Rota própria porque recolhe dados (o motivo): um campo de texto é formulário, logo é rota,
 * não AlertDialog. Só PENDENTE e APROVADA se cancelam, com a permissão `comissoes:gerir`; as
 * outras voltam ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comissaoService } from '@/server/services/comercial/index';
import { NotFoundError } from '@/lib/errors';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { CancelarComissaoForm } from './_components/cancelar-comissao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CancelarComissaoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let comissao;
  try {
    comissao = await runWithTenantContext(ctx, () => comissaoService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const detalhe = `/vendas/comissoes/${id}`;
  if (
    !['PENDENTE', 'APROVADA'].includes(comissao.status) ||
    !permissions.includes('comissoes:gerir')
  ) {
    redirect(detalhe);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cancelar Comissão"
        description={`Comissão de ${formatMZN(comissao.valorComissao)} sobre a venda ${comissao.vendaId.slice(-8)}`}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Comissões', href: '/vendas/comissoes' },
          { label: id.slice(-8), href: detalhe },
          { label: 'Cancelar' },
        ]}
        badge={<StatusBadge status={comissao.status} />}
      />

      <CancelarComissaoForm id={id} />
    </div>
  );
}
