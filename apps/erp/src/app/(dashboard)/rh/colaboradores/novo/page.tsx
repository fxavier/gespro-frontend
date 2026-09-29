/**
 * Novo Colaborador — Server Component.
 * A página em si não tem estado; o formulário interactivo está em NovoColaboradorForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';
import { PageHeader } from '@/components/patterns';
import { NovoColaboradorForm } from '../_components/novo-colaborador-form';

export default async function NovoColaboradorPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const opcoes = await runWithTenantContext(ctx, () => ColaboradorService.listarOpcoes(ctx));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Colaborador"
        description="Preencha os dados do novo colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Colaboradores', href: '/rh/colaboradores' },
          { label: 'Novo Colaborador' },
        ]}
      />

      <NovoColaboradorForm opcoes={opcoes} />
    </div>
  );
}
