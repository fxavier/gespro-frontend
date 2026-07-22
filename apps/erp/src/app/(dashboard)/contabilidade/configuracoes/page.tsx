/**
 * Configurações de Contabilidade — Server Component shell.
 * The actual form is a Client Component to allow live interactions.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { ConfiguracoesForm } from './_components/configuracoes-form';

export default async function ConfiguracoesContabilidadePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Configurações de Contabilidade"
        description="Regime contabilístico, exercício fiscal e contas padrão"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Configurações' },
        ]}
      />
      <ConfiguracoesForm />
    </div>
  );
}
