/**
 * Nova Categoria de Serviço — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaCategoriaServicoForm } from './_components/nova-categoria-servico-form';

export default async function NovaCategoriaServicoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Categoria de Serviço"
        description="Organize os serviços por categoria"
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos' },
          { label: 'Categorias', href: '/servicos/categorias' },
          { label: 'Nova' },
        ]}
      />
      <NovaCategoriaServicoForm />
    </div>
  );
}
