/**
 * Nova Nota de Crédito — Server Component.
 * Pré-carrega as faturas elegíveis (sem Dialog). A série não se escolhe (#93):
 * é a activa de NOTA_CREDITO no ano da data de emissão.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarFaturas } from '@/server/services/financas/faturacao.service';
import { PageHeader } from '@/components/patterns';
import { NovaNotaCreditoForm } from './_components/nova-nota-credito-form';

export default async function NovaNotaCreditoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const paginaFaturas = await runWithTenantContext(ctx, () =>
    listarFaturas({ status: 'EMITIDA', take: 100 }, ctx)
  );

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
      <NovaNotaCreditoForm faturas={faturas} />
    </div>
  );
}
