/**
 * Nova Categoria de Ticket — Server Component shell.
 */
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { NovaCategoriaTicketForm } from './_components/nova-categoria-ticket-form';

export default async function NovaCategoriaTicketPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Categoria de Ticket"
        description="Defina categorias de suporte e os respetivos SLA"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Categorias', href: '/tickets/categorias' },
          { label: 'Nova' },
        ]}
      />
      <NovaCategoriaTicketForm />
    </div>
  );
}
