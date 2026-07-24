/**
 * Novo Orçamento de Projecto — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoOrcamentoProjetoForm } from './_components/novo-orcamento-projeto-form';

export default async function NovoOrcamentoProjetoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Orçamento"
        description="Defina as categorias e valores planeados do projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos' },
          { label: 'Orçamento', href: '/projetos/orcamento' },
          { label: 'Novo' },
        ]}
      />
      <NovoOrcamentoProjetoForm />
    </div>
  );
}
