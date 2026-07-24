/**
 * Editar Motorista — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import type { MotoristaDetalhe } from '@/server/services/operacoes/motorista.service';
import { PageHeader } from '@/components/patterns';
import { MotoristaForm } from '../../_components/motorista-form';

function toDateInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarMotoristaPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let motorista: MotoristaDetalhe;
  try {
    motorista = await runWithTenantContext(ctx, () => motoristaService.obterMotorista(id, ctx));
  } catch {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar ${motorista.nomeCompleto}`}
        description={`Carta n.º ${motorista.numeroCarta}`}
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Motoristas', href: '/transporte/motoristas' },
          { label: motorista.nomeCompleto, href: `/transporte/motoristas/${motorista.id}` },
          { label: 'Editar' },
        ]}
      />
      <MotoristaForm
        motorista={{
          id: motorista.id,
          nomeCompleto: motorista.nomeCompleto,
          contacto: motorista.contacto,
          morada: motorista.morada,
          numeroBI: motorista.numeroBI,
          numeroCarta: motorista.numeroCarta,
          categoriaCarta: motorista.categoriaCarta,
          dataEmissaoCarta: toDateInput(motorista.dataEmissaoCarta),
          validadeCarta: toDateInput(motorista.validadeCarta),
          localActividade: motorista.localActividade,
          observacoes: motorista.observacoes,
        }}
      />
    </div>
  );
}
