/**
 * Editar Manutenção — Server Component.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { manutencaoService } from '@/server/services/inventario/manutencao.service';
import { PageHeader } from '@/components/patterns';
import { EditarManutencaoForm } from './_components/editar-manutencao-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarManutencaoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let manutencao;
  try {
    manutencao = await runWithTenantContext({ tenantId, userId }, () =>
      manutencaoService.obterManutencao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!manutencao) notFound();

  // Manutenções terminais não podem ser editadas
  if (['CONCLUIDA', 'CANCELADA'].includes(manutencao.status)) {
    redirect(`/inventario/manutencao/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar: ${manutencao.titulo}`}
        description={`Estado actual: ${manutencao.status}`}
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Manutenção', href: '/inventario/manutencao' },
          { label: manutencao.titulo, href: `/inventario/manutencao/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarManutencaoForm manutencao={manutencao} />
    </div>
  );
}
