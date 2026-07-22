/**
 * Abertura de Caixa — Server Component (shell).
 * O wizard interactivo vive em AberturaWizard (Client Component).
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { AberturaWizard } from './_components/abertura-wizard';

export default async function AberturaCaixaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Abertura de Caixa"
        description="Registar abertura de turno e definir fundo inicial"
        breadcrumbs={[
          { label: 'Caixa', href: '/caixa' },
          { label: 'Abertura' },
        ]}
      />

      <AberturaWizard />
    </div>
  );
}
