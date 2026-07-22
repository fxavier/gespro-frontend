/**
 * Nova Fatura — Server Component.
 * Pré-carrega séries e clientes para o formulário CC (sem Dialog).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarSeries } from '@/server/services/financas/faturacao.service';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { PageHeader } from '@/components/patterns';
import { NovaFaturaForm } from './_components/nova-fatura-form';

export default async function NovaFaturaPage() {
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

  // Serializar: só campos necessários, sem Date/Decimal
  const series = todasSeries
    .filter((s) => s.tipo === 'FATURA' && s.ativo)
    .map((s) => ({ id: s.id, label: `${s.prefixo}/${s.ano} — ${s.tipo}` }));

  const clientes = paginaClientes.items.map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Fatura"
        description="Emitir nova fatura fiscal"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Faturas', href: '/vendas/faturas' },
          { label: 'Nova Fatura' },
        ]}
      />
      <NovaFaturaForm series={series} clientes={clientes} />
    </div>
  );
}
