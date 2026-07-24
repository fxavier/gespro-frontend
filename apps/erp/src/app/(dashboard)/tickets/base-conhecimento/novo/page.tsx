/**
 * Novo Artigo da Base de Conhecimento — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovoArtigoBaseConhecimentoForm } from './_components/novo-artigo-base-conhecimento-form';

export default async function NovoArtigoBaseConhecimentoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo Artigo"
        description="Adicione um artigo à base de conhecimento"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Base de Conhecimento', href: '/tickets/base-conhecimento' },
          { label: 'Novo' },
        ]}
      />
      <NovoArtigoBaseConhecimentoForm />
    </div>
  );
}
