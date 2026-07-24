/**
 * Nova Fatura Proforma — Server Component shell.
 * Carrega as séries de documento; o cliente é indicado por ID (mesmo padrão de
 * `faturacao/nova`, até haver pesquisa comercial integrada).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { PageHeader } from '@/components/patterns';
import { NovaProformaForm } from './_components/nova-proforma-form';

export default async function NovaProformaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let series: Array<{ id: string; codigo: string; nome: string }> = [];
  try {
    const rawSeries = await runWithTenantContext({ tenantId, userId }, () =>
      faturacaoService.listarSeries({ tenantId, userId }),
    );
    series = rawSeries.map((s: any) => ({
      id: s.id,
      codigo: s.codigo,
      nome: s.nome ?? s.codigo,
    }));
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
