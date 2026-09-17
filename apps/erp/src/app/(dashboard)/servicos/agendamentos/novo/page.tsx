/**
 * Novo Agendamento de Serviço — Server Component (carrega serviços e a
 * primeira página de clientes, delega o form).
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { NovoAgendamentoForm, type ClienteOpcao } from './_components/novo-agendamento-form';

export default async function NovoAgendamentoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [{ items }, clientes] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      servicoService.listarServicos(
        { take: 100 } as Parameters<typeof servicoService.listarServicos>[0],
        ctx,
      ),
      // Só a primeira página: a partir daí a combobox pesquisa no servidor
      // (`procurarClientes`) — o mesmo molde de /faturacao/nova.
      clienteService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
    ]),
  );
  const clientesIniciais: ClienteOpcao[] = clientes.items.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
  }));
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
      <NovoAgendamentoForm servicos={servicos} clientesIniciais={clientesIniciais} />
    </div>
  );
}
