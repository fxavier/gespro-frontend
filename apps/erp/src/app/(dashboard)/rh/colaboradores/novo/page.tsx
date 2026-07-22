/**
 * Novo Colaborador — Server Component.
 * A página em si não tem estado; o formulário interactivo está em NovoColaboradorForm (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoColaboradorForm } from '../_components/novo-colaborador-form';

export default async function NovoColaboradorPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

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

      <NovoColaboradorForm />
    </div>
  );
}
