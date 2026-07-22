/**
 * Editar Colaborador — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';
import { PageHeader } from '@/components/patterns';
import { EditarColaboradorForm } from './_components/editar-colaborador-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarColaboradorPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let colaborador;
  try {
    colaborador = await runWithTenantContext(ctx, () =>
      ColaboradorService.obter(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!colaborador) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar: ${colaborador.nome}`}
        description="Actualizar os dados do colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Colaboradores', href: '/rh/colaboradores' },
          { label: colaborador.codigo, href: `/rh/colaboradores/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarColaboradorForm colaborador={colaborador} />
    </div>
  );
}
