/**
 * Novo Diário Contabilístico — Server Component.
 *
 * A página não tem estado; o formulário interactivo vive em NovoDiarioForm
 * (Client Component). Padrão golden standard: page.tsx = Server Component.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoDiarioForm } from './_components/novo-diario-form';

export default async function NovoDiarioPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Diário Contabilístico"
        description="Registe um diário por natureza (Vendas, Compras, Caixa, Banco…)"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Diários', href: '/contabilidade/diarios' },
          { label: 'Novo Diário' },
        ]}
      />

      <NovoDiarioForm />
    </div>
  );
}