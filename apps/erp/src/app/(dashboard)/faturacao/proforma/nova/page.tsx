/**
 * Nova Fatura Proforma — Server Component shell.
 * Carrega as séries de documento; o cliente é indicado por ID (mesmo padrão de
 * `faturacao/nova`, até haver pesquisa comercial integrada).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PageHeader } from '@/components/patterns';
import { listarSeriesParaSelecao, type SerieOpcao } from '../../_lib/series';
import { NovaProformaForm } from './_components/nova-proforma-form';

export default async function NovaProformaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let series: SerieOpcao[] = [];
  try {
    series = await runWithTenantContext({ tenantId, userId }, () =>
      listarSeriesParaSelecao('PROFORMA', { tenantId, userId }),
    );
  } catch {
    // O formulário mostra lista de séries vazia.
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Fatura Proforma"
        description="Documento pró-forma para o cliente"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Proformas', href: '/faturacao/proforma' },
          { label: 'Nova Proforma' },
        ]}
      />
      <NovaProformaForm series={series} />
    </div>
  );
}
