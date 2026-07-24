/**
 * Nova Atividade — Server Component (NUNCA 'use client').
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader } from '@/components/patterns';
import { AtividadeForm } from '../_components/atividade-form';

export default async function NovaAtividadePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [viaturasResult, motoristasResult] = await Promise.all([
    runWithTenantContext(ctx, () =>
      viaturaService.listarViaturas({ estado: 'DISPONIVEL', take: 100, orderBy: 'matricula', order: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      motoristaService.listarMotoristas({ estadoOperacional: 'ACTIVO', take: 100, orderBy: 'nomeCompleto', order: 'asc' }, ctx)
    ),
  ]);

  const viaturas = viaturasResult.items.map((v) => ({ id: v.id, label: `${v.matricula} — ${v.marca} ${v.modelo}` }));
  const motoristas = motoristasResult.items.map((m) => ({ id: m.id, label: m.nomeCompleto }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Atividade"
        description="Registe uma nova atividade de transporte"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Atividades', href: '/transporte/atividades' },
          { label: 'Nova Atividade' },
        ]}
      />
      <AtividadeForm viaturas={viaturas} motoristas={motoristas} />
    </div>
  );
}
