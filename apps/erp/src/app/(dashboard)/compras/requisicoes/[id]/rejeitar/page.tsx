/**
 * Rejeitar Requisição de Compra (#108) — Server Component (NUNCA 'use client').
 *
 * Rota própria porque recolhe dados (o motivo): um campo de texto é formulário, logo é
 * rota, não AlertDialog. Só o aprovador PENDENTE do nível corrente, com a permissão
 * `compras:aprovacao:decidir`, chega ao formulário; os outros voltam ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { nivelPendenteDoAprovador } from '@/lib/compras-aprovacao';
import { RejeitarRequisicaoForm } from './_components/rejeitar-requisicao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RejeitarRequisicaoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;

  let requisicao;
  try {
    requisicao = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterRequisicao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }
  if (!requisicao) notFound();

  const nivel = permissions.includes('compras:aprovacao:decidir')
    ? nivelPendenteDoAprovador(requisicao, userId)
    : null;
  if (nivel === null) redirect(`/compras/requisicoes/${id}`);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Rejeitar Requisição ${requisicao.numero}`}
        description={`A sua decisão no nível ${nivel} do circuito de aprovação`}
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Requisições', href: '/compras/requisicoes' },
          { label: requisicao.numero, href: `/compras/requisicoes/${id}` },
          { label: 'Rejeitar' },
        ]}
        badge={<StatusBadge status={requisicao.status} />}
      />

      <RejeitarRequisicaoForm id={id} nivel={nivel} />
    </div>
  );
}
