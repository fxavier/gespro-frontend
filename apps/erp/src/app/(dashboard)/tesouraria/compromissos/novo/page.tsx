/**
 * Novo Compromisso de Tesouraria — Server Component.
 *
 * A página não tem estado; o formulário interactivo é o `CompromissoForm`
 * (Client Component). Rota dedicada — sem modais (R7.3).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { CompromissoForm } from '../_components/compromisso-form';

export default async function NovoCompromissoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Compromisso"
        description="Registe uma obrigação ou um direito datado que não nasce de documentos do ERP"
        breadcrumbs={[
          { label: 'Tesouraria', href: '/tesouraria' },
          { label: 'Compromissos', href: '/tesouraria/compromissos' },
          { label: 'Novo Compromisso' },
        ]}
      />

      <CompromissoForm modo="criar" />
    </div>
  );
}
