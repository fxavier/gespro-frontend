/**
 * Editar Projecto — Server Component.
 *
 * Carrega dados via ProjetoService e passa ao formulário cliente.
 * Anteriormente usava localStorage (padrão legado) — migrado para o serviço real.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { EditarProjetoForm } from '../_components/editar-projeto-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditarProjetoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let projeto;
  try {
    projeto = await runWithTenantContext(ctx, () =>
      ProjetoService.obter(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!projeto) notFound();

  if (projeto.status === 'ARQUIVADO') {
    redirect(`/projetos/lista/${id}`);
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Projecto"
        description={projeto.nome}
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: projeto.codigo, href: `/projetos/lista/${id}` },
          { label: 'Editar' },
        ]}
      />

      <EditarProjetoForm
        id={id}
        defaultValues={{
          nome: projeto.nome,
          descricao: projeto.descricao,
          prioridade: projeto.prioridade,
          dataFimPrevista: projeto.dataFimPrevista,
          orcamentoPlanejado: projeto.orcamentoPlanejado ? projeto.orcamentoPlanejado.toString() : null,
          horasEstimadas: projeto.horasEstimadas,
          observacoes: projeto.observacoes,
          tags: projeto.tags as string[],
        }}
      />
    </div>
  );
}
