/**
 * Nova Viatura — Server Component (NUNCA 'use client').
 * Carrega motoristas activos para o select responsável.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader } from '@/components/patterns';
import { ViaturaForm } from '../_components/viatura-form';

export default async function NovaViaturaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const motoristasResult = await runWithTenantContext(ctx, () =>
    motoristaService.listarMotoristas(
      { estadoOperacional: 'ACTIVO', take: 100, orderBy: 'nomeCompleto', order: 'asc' },
      ctx
    )
  );

  const motoristas = motoristasResult.items.map((m) => ({ id: m.id, nomeCompleto: m.nomeCompleto }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Viatura"
        description="Registe uma nova viatura na frota"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Viaturas', href: '/transporte/veiculos' },
          { label: 'Nova Viatura' },
        ]}
      />
      <ViaturaForm motoristas={motoristas} />
    </div>
  );
}
