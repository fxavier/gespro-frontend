/**
 * Nova Nota de Crédito — Server Component.
 * Pré-carrega séries e faturas elegíveis (sem Dialog).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarSeries, listarFaturas } from '@/server/services/financas/faturacao.service';
import { PageHeader } from '@/components/patterns';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [todasSeries, paginaFaturas] = await Promise.all([
    runWithTenantContext(ctx, () => listarSeries(ctx)),
    runWithTenantContext(ctx, () =>
      listarFaturas({ status: 'EMITIDA', take: 100 }, ctx)
    ),
  ]);

  const series = todasSeries
    .filter((s) => s.tipo === 'NOTA_CREDITO' && s.ativo)
    .map((s) => ({ id: s.id, label: `${s.prefixo}/${s.ano} — NC` }));

  // Apenas faturas emitidas ou pagas podem ter nota de crédito
  const faturas = paginaFaturas.items.map((f) => ({
    id: f.id,
    numero: f.numero,
    total: f.total.toString(),
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Nota de Crédito"
        description="Emitir nota de crédito por devolução ou correcção de valores"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Crédito', href: '/vendas/notas-credito' },
          { label: 'Nova Nota de Crédito' },
        ]}
      />
      <NovaNotaCreditoForm series={series} faturas={faturas} />
    </div>
  );
}
