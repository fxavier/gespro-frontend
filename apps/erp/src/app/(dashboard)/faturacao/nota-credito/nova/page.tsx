/**
 * Nova Nota de Crédito — Server Component shell.
 * Carrega as séries de documento para o formulário CC.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { PageHeader } from '@/components/patterns';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  let series: Array<{ id: string; codigo: string; nome: string }> = [];
  try {
    const rawSeries = await runWithTenantContext({ tenantId, userId }, () =>
      faturacaoService.listarSeries({ tenantId, userId })
    );
    series = rawSeries
      .filter((s: any) => s.tipo === 'NOTA_CREDITO')
      .map((s: any) => ({
        id: s.id,
        codigo: s.prefixo,
        nome: `${s.prefixo} ${s.ano}`,
      }));
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
