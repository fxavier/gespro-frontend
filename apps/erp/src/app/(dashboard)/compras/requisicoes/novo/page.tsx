/**
 * Nova Requisição de Compra — Server Component.
 *
 * A página em si não tem estado; o formulário interactivo está em
 * NovaRequisicaoForm (Client Component). Segue o padrão golden standard:
 * page.tsx = Server Component, lógica de UI = Client Component filho.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaRequisicaoForm } from '../_components/nova-requisicao-form';

export default async function NovaRequisicaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Requisição de Compra"
        description="Preencha os campos abaixo para criar uma nova solicitação de compra"
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Requisições', href: '/compras/requisicoes' },
          { label: 'Nova Requisição' },
        ]}
      />

      <NovaRequisicaoForm />
    </div>
  );
}
