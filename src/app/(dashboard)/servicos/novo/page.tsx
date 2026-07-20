/**
 * Página de criação de serviço — Server Component (NUNCA 'use client').
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoServicoForm } from '../_components/novo-servico-form';

export default async function NovoServicoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-6 pb-0">
        <PageHeader
          title="Novo Serviço"
          description="Preencha os dados do novo serviço"
          breadcrumbs={[
            { label: 'Serviços', href: '/servicos/lista' },
            { label: 'Novo Serviço' },
          ]}
        />
      </div>
      <NovoServicoForm />
    </div>
  );
}
