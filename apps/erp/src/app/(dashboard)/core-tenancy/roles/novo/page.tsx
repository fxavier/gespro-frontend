/**
 * Criar Novo Papel (Role) — Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { PageHeader } from '@/components/patterns';
import { CriarRoleForm } from './_components/criar-role-form';

export default async function NovoRolePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const permissoes = await userAdminService.listarPermissoes();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Papel"
        description="Criar um novo papel com permissões granulares"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Papéis', href: '/core-tenancy/roles' },
          { label: 'Novo Papel' },
        ]}
      />

      <CriarRoleForm permissoes={permissoes} />
    </div>
  );
}
