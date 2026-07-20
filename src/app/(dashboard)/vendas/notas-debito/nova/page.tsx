/**
 * Nova Nota de Débito — Server Component.
 * Pré-carrega séries e clientes para o formulário (sem Dialog).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarSeries } from '@/server/services/financas/faturacao.service';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { NovaNotaDebitoForm } from './_components/nova-nota-debito-form';

export default async function NovaNotaDebitoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [todasSeries, paginaClientes] = await Promise.all([
    runWithTenantContext(ctx, () => listarSeries(ctx)),
    runWithTenantContext(ctx, () =>
      clienteService.listar({ status: 'ATIVO', take: 200, orderBy: 'nome', order: 'asc' }, ctx)
    ),
  ]);

  const series = todasSeries
    .filter((s) => s.tipo === 'NOTA_DEBITO' && s.ativo)
    .map((s) => ({ id: s.id, label: `${s.prefixo}/${s.ano} — ND` }));

  const clientes = paginaClientes.items.map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Débito"
        description="Registar valores adicionais a cobrar ao cliente"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Débito', href: '/vendas/notas-debito' },
          { label: 'Nova Nota de Débito' },
        ]}
      />
      <NovaNotaDebitoForm series={series} clientes={clientes} />
    </div>
  );
}
