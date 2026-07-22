/**
 * Novo Cliente — Server Component.
 * A página em si não tem estado; o formulário interactivo está em NovoClienteForm.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoClienteForm } from '../_components/novo-cliente-form';

export default async function NovoClientePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Cliente"
        description="Preencha os campos abaixo para registar um novo cliente"
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Novo Cliente' },
        ]}
      />
      <NovoClienteForm />
    </div>
  );
}
