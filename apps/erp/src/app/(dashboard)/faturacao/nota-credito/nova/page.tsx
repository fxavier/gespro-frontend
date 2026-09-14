/**
 * Nova Nota de Crédito — Server Component shell.
 * Carrega as séries de documento para o formulário CC.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PageHeader } from '@/components/patterns';
import { listarSeriesParaSelecao, type SerieOpcao } from '../../_lib/series';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let series: SerieOpcao[] = [];
  try {
    series = await runWithTenantContext({ tenantId, userId }, () =>
      listarSeriesParaSelecao('NOTA_CREDITO', { tenantId, userId }),
    );
  } catch {
    // Form will show empty series list
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Crédito"
        description="Emissão de nota de crédito sobre factura"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Notas de Crédito', href: '/faturacao/nota-credito' },
          { label: 'Nova Nota de Crédito' },
        ]}
      />
      <NovaNotaCreditoForm series={series} />
    </div>
  );
}
