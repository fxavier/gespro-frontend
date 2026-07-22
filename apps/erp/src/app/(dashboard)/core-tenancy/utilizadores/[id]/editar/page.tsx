/**
 * Editar Utilizador — Server Component.
 */

import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { PageHeader } from '@/components/patterns';
import { EditarUtilizadorForm } from './_components/editar-utilizador-form';
import { NotFoundError } from '@/lib/errors';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarUtilizadorPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };
  const { id } = await params;

  let utilizador;
  try {
    utilizador = await userAdminService.obterUtilizador(id, ctx);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const roles = await userAdminService.listarRoles(ctx);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar: ${utilizador.nome}`}
        description="Actualizar os dados do utilizador"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Utilizadores', href: '/core-tenancy/utilizadores' },
          { label: utilizador.nome },
        ]}
      />

      <EditarUtilizadorForm utilizador={utilizador} roles={roles} />
    </div>
  );
}
