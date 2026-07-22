/**
 * Novo Agendamento de Serviço — Server Component (carrega serviços, delega o form).
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { PageHeader } from '@/components/patterns';
import { NovoAgendamentoForm } from './_components/novo-agendamento-form';

export default async function NovoAgendamentoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const { items } = await runWithTenantContext({ tenantId, userId }, () =>
    servicoService.listarServicos(
      { take: 100 } as Parameters<typeof servicoService.listarServicos>[0],
      ctx,
    ),
  );
  const servicos = items.map((s) => ({
    id: s.id,
    nome: `${s.codigo} — ${s.nome}`,
    preco: Number(s.preco),
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Agendamento"
        description="Agendar a prestação de um serviço a um cliente"
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos' },
          { label: 'Agendamentos', href: '/servicos/agendamentos' },
          { label: 'Novo' },
        ]}
      />
      <NovoAgendamentoForm servicos={servicos} />
    </div>
  );
}
