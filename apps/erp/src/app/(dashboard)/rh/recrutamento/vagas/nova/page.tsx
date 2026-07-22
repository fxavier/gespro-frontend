/**
 * Nova Vaga — Server Component wrapper.
 * O formulário é um Client Component folha.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { VagaForm } from '../../_components/vaga-form';

export default async function NovaVagaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Vaga"
        description="Crie uma nova vaga de recrutamento"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Recrutamento', href: '/rh/recrutamento' },
          { label: 'Nova Vaga' },
        ]}
      />
      <VagaForm />
    </div>
  );
}
