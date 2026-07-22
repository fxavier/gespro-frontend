/**
 * Editar Papel (Role) — Server Component.
 */

import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { PageHeader } from '@/components/patterns';
import { EditarRoleForm } from './_components/editar-role-form';
import { NotFoundError } from '@/lib/errors';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarRolePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };
  const { id } = await params;

  let role;
  try {
    role = await userAdminService.obterRole(id, ctx);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const permissoes = await userAdminService.listarPermissoes();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar Papel: ${role.nome}`}
        description="Actualizar nome, descrição e permissões do papel"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Papéis', href: '/core-tenancy/roles' },
          { label: role.nome },
        ]}
      />

      <EditarRoleForm role={role} permissoes={permissoes} />
    </div>
  );
}
