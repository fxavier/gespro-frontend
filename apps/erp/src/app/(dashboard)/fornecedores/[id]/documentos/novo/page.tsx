/**
 * Carregar documento de fornecedor — Server Component.
 * O upload (interactivo) vive no DocumentoUploader (Client Component).
 */
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { PageHeader } from '@/components/patterns';
import { DocumentoUploader } from '../_components/documento-uploader';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NovoDocumentoPage({ params }: Props) {
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
        title="Carregar documento"
        description={fornecedor.nome}
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: fornecedor.nome, href: `/fornecedores/${fornecedor.id}` },
          { label: 'Documentos', href: `/fornecedores/${fornecedor.id}/documentos` },
          { label: 'Carregar' },
        ]}
      />

      <DocumentoUploader
        fornecedorId={fornecedor.id}
        voltarHref={`/fornecedores/${fornecedor.id}/documentos`}
      />
    </div>
  );
}
