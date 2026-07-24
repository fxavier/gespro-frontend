/**
 * Editar Viatura — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { PageHeader } from '@/components/patterns';
import { ViaturaForm } from '../../_components/viatura-form';
import type { ViaturaDetalhe } from '@/server/services/operacoes/viatura.interface';

function toDateInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarViaturaPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let viatura: ViaturaDetalhe;
  try {
    viatura = await runWithTenantContext(ctx, () => viaturaService.obterViatura(id, ctx));
  } catch {
    notFound();
  }

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
        title={`Editar ${viatura.matricula}`}
        description={`${viatura.marca} ${viatura.modelo}`}
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Viaturas', href: '/transporte/veiculos' },
          { label: viatura.matricula, href: `/transporte/veiculos/${viatura.id}` },
          { label: 'Editar' },
        ]}
      />
      <ViaturaForm
        motoristas={motoristas}
        viatura={{
          id: viatura.id,
          matricula: viatura.matricula,
          marca: viatura.marca,
          modelo: viatura.modelo,
          tipoViatura: viatura.tipoViatura,
          capacidade: viatura.capacidade,
          unidadeCapacidade: viatura.unidadeCapacidade,
          localActividade: viatura.localActividade,
          dataInicioActividade: toDateInput(viatura.dataInicioActividade),
          motoristaResponsavelId: viatura.motoristaResponsavelId,
          observacoes: viatura.observacoes,
        }}
      />
    </div>
  );
}
