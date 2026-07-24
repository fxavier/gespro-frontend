/**
 * Nova Ausência — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaAusenciaForm } from './_components/nova-ausencia-form';

export default async function NovaAusenciaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Ausência"
        description="Registe uma ausência de um colaborador"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Ausências', href: '/rh/ausencias' },
          { label: 'Nova' },
        ]}
      />
      <NovaAusenciaForm />
    </div>
  );
}
