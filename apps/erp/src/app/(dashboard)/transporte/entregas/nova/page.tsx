/**
 * Nova Entrega — Server Component (NUNCA 'use client').
 * Carrega viaturas, motoristas e rotas disponíveis e passa ao formulário cliente.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { rotaService } from '@/server/services/operacoes/rota.service';
import { PageHeader } from '@/components/patterns';
import { NovaEntregaForm } from './_components/nova-entrega-form';

export default async function NovaEntregaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [viaturasResult, motoristasResult, rotasResult] = await Promise.all([
    runWithTenantContext(ctx, () =>
      viaturaService.listarViaturas(
        { estado: 'DISPONIVEL', take: 100, orderBy: 'matricula', order: 'asc' },
        ctx
      )
    ),
    runWithTenantContext(ctx, () =>
      motoristaService.listarMotoristas(
        { estadoOperacional: 'ACTIVO', take: 100, orderBy: 'nomeCompleto', order: 'asc' },
        ctx
      )
    ),
    runWithTenantContext(ctx, () =>
      rotaService.listarRotas(
        { estado: 'ATIVA', take: 100, orderBy: 'dataInicio', order: 'desc' },
        ctx
      )
    ),
  ]);

  const motoristas = motoristasResult.items.map((m) => ({
    id: m.id,
    nomeCompleto: m.nomeCompleto,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Entrega"
        description="Registe uma nova entrega de mercadoria"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Entregas', href: '/transporte/entregas' },
          { label: 'Nova Entrega' },
        ]}
      />

      <NovaEntregaForm
        viaturas={viaturasResult.items}
        motoristas={motoristas}
        rotas={rotasResult.items}
      />
    </div>
  );
}
