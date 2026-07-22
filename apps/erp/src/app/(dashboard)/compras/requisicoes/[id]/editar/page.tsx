/**
 * Editar Requisição de Compra — Server Component (NUNCA 'use client').
 *
 * Carrega a requisição do serviço. Se não estiver em RASCUNHO, redireciona
 * para o detalhe com mensagem de erro. Formulário de edição em EditarRequisicaoForm.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { EditarRequisicaoForm } from './_components/editar-requisicao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarRequisicaoPage({ params }: Props) {
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

  // Só RASCUNHO é editável — ver máquina de estados TRANSICOES_REQUISICAO
  if (requisicao.status !== 'RASCUNHO') {
    redirect(`/compras/requisicoes/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar Requisição ${requisicao.numero}`}
        description="Actualize os dados da requisição de compra"
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Requisições', href: '/compras/requisicoes' },
          { label: requisicao.numero, href: `/compras/requisicoes/${id}` },
          { label: 'Editar' },
        ]}
        badge={<StatusBadge status={requisicao.status} />}
      />

      <EditarRequisicaoForm
        id={id}
        defaultValues={{
          data: requisicao.data,
          departamento: requisicao.departamento,
          prioridade: requisicao.prioridade as 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE',
          justificativa: requisicao.justificativa,
          observacoes: requisicao.observacoes ?? undefined,
          dataEntregaDesejada: requisicao.dataEntregaDesejada ?? undefined,
        }}
      />
    </div>
  );
}
