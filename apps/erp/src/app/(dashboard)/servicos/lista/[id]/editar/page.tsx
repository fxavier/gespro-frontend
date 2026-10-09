/**
 * Editar Serviço — Server Component (NUNCA 'use client'). Ligado pela lista e pelo detalhe (#114).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { PageHeader } from '@/components/patterns';
import { NovoServicoForm } from '../../../_components/novo-servico-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarServicoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let servico;
  try {
    servico = await runWithTenantContext(ctx, () => servicoService.obterServico(id, ctx));
  } catch {
    notFound();
  }
  const categorias = (await runWithTenantContext(ctx, () => servicoService.listarCategorias(ctx)))
    .filter((c) => c.ativo || c.id === servico.categoriaServicoId)
    .map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <div className="flex flex-col min-h-full">
      <div className="p-6 pb-0">
        <PageHeader
          title="Editar Serviço"
          description={`${servico.codigo} — ${servico.nome}`}
          breadcrumbs={[
            { label: 'Serviços', href: '/servicos/lista' },
            { label: servico.nome, href: `/servicos/lista/${servico.id}` },
            { label: 'Editar' },
          ]}
        />
      </div>
      <NovoServicoForm servico={servico} categorias={categorias} />
    </div>
  );
}
