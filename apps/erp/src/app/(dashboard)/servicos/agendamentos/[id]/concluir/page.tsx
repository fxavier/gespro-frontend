/**
 * Concluir Agendamento — Server Component. Rota própria porque recolhe as notas de conclusão
 * (sem modais). Só um agendamento EM_ANDAMENTO pode ser concluído; os outros voltam ao detalhe.
 */

import { notFound, redirect } from 'next/navigation';
import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { TRANSICOES_AGENDAMENTO } from '@/lib/state-machines';
import { PageHeader } from '@/components/patterns';
import { ConcluirAgendamentoForm } from './_components/concluir-agendamento-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConcluirAgendamentoPage({ params }: Props) {
  const { id } = await params;
  const { session, tenantId } = await exigirSessaoDeTenant();
  const ctx = { tenantId, userId: session.user.id };

  let agendamento;
  try {
    agendamento = await runWithTenantContext(ctx, () => servicoService.obterAgendamento(id, ctx));
  } catch {
    notFound();
  }
  if (!TRANSICOES_AGENDAMENTO[agendamento.status]?.includes('CONCLUIDO')) {
    redirect(`/servicos/agendamentos/${id}`);
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-6 pb-0">
        <PageHeader
          title="Concluir Agendamento"
          description={`${agendamento.codigo} — ${agendamento.servicoNome} · ${agendamento.clienteNome}`}
          breadcrumbs={[
            { label: 'Serviços', href: '/servicos/lista' },
            { label: 'Agendamentos', href: '/servicos/agendamentos' },
            { label: agendamento.codigo, href: `/servicos/agendamentos/${id}` },
            { label: 'Concluir' },
          ]}
        />
      </div>
      <ConcluirAgendamentoForm id={id} />
    </div>
  );
}
