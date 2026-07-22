/**
 * Nova Fatura — Server Component shell.
 * Loads clientes + series para o formulário CC.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { PageHeader } from '@/components/patterns';
import { NovaFaturaForm } from './_components/nova-fatura-form';

export default async function NovaFaturaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let series: Array<{ id: string; codigo: string; nome: string }> = [];
  try {
    const rawSeries = await runWithTenantContext({ tenantId, userId }, () =>
      faturacaoService.listarSeries({ tenantId, userId })
    );
    series = rawSeries.map((s: any) => ({
      id: s.id,
      codigo: s.codigo,
      nome: s.nome ?? s.codigo,
    }));
  } catch {
    // Form will show empty series list
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Fatura"
        description="Emissão de fatura fiscal"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Nova Fatura' },
        ]}
      />
      <NovaFaturaForm series={series} />
    </div>
  );
}
