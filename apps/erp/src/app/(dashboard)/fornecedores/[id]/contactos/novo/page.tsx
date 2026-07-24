/**
 * Novo contacto de fornecedor — Server Component.
 */
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { PageHeader } from '@/components/patterns';
import { ContactoForm } from '../_components/contacto-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NovoContactoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let fornecedor;
  try {
    fornecedor = await runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.obter(id, { tenantId, userId }),
    );
  } catch {
    notFound();
  }
  if (!fornecedor) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Novo contacto"
        description={fornecedor.nome}
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: fornecedor.nome, href: `/fornecedores/${fornecedor.id}` },
          { label: 'Contactos', href: `/fornecedores/${fornecedor.id}/contactos` },
          { label: 'Novo' },
        ]}
      />

      <ContactoForm fornecedorId={fornecedor.id} />
    </div>
  );
}
