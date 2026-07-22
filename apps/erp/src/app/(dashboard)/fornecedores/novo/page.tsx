/**
 * Novo Fornecedor — Server Component.
 *
 * A página em si não tem estado; o formulário interactivo está em
 * NovoFornecedorForm (Client Component). Segue o padrão golden standard.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoFornecedorForm } from '../_components/novo-fornecedor-form';

export default async function NovoFornecedorPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Fornecedor"
        description="Registe um novo fornecedor ou parceiro comercial"
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: 'Novo Fornecedor' },
        ]}
      />

      <NovoFornecedorForm />
    </div>
  );
}
