/**
 * Criar Novo Utilizador — Server Component.
 * Carrega os roles disponíveis para o formulário; formulário interactivo em Client Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { PageHeader } from '@/components/patterns';
import { CriarUtilizadorForm } from './_components/criar-utilizador-form';

export default async function NovoUtilizadorPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const roles = await userAdminService.listarRoles(ctx);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Utilizador"
        description="Preencha os dados para criar um novo utilizador no sistema"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Utilizadores', href: '/core-tenancy/utilizadores' },
          { label: 'Novo Utilizador' },
        ]}
      />

      <CriarUtilizadorForm roles={roles} />
    </div>
  );
}
