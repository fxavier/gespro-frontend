/**
 * Editar Categoria de Serviço — Server Component shell (#114).
 */
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { PageHeader } from '@/components/patterns';
import { NovaCategoriaServicoForm } from '../../novo/_components/nova-categoria-servico-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarCategoriaServicoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let categoria;
  try {
    categoria = await runWithTenantContext(ctx, () => servicoService.obterCategoria(id, ctx));
  } catch {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Categoria de Serviço"
        description={categoria.nome}
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos/lista' },
          { label: 'Categorias', href: '/servicos/categorias' },
          { label: categoria.nome },
          { label: 'Editar' },
        ]}
      />
      <NovaCategoriaServicoForm categoria={categoria} />
    </div>
  );
}
