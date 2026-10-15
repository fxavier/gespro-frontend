/**
 * Editar contacto de fornecedor — Server Component.
 */
import { notFound } from 'next/navigation';
import { exigirSessaoDeTenant } from '@/server/auth/sessao-tenant';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { PageHeader } from '@/components/patterns';
import { ContactoForm } from '../../_components/contacto-form';

interface Props {
  params: Promise<{ id: string; contactoId: string }>;
}

export default async function EditarContactoPage({ params }: Props) {
  const { id, contactoId } = await params;

  const { session } = await exigirSessaoDeTenant();

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

  const contacto = fornecedor.contactos.find((c) => c.id === contactoId);
  if (!contacto) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar contacto"
        description={`${contacto.nome} · ${fornecedor.nome}`}
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: fornecedor.nome, href: `/fornecedores/${fornecedor.id}` },
          { label: 'Contactos', href: `/fornecedores/${fornecedor.id}/contactos` },
          { label: 'Editar' },
        ]}
      />

      <ContactoForm fornecedorId={fornecedor.id} contacto={contacto} />
    </div>
  );
}
