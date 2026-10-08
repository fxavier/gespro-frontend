/**
 * Editar Tarefa (#167) — Server Component; o formulário é o mesmo do criar.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { TarefaService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader } from '@/components/patterns';
import { TarefaForm } from '../../_components/tarefa-form';

export default async function EditarTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let tarefa;
  try {
    tarefa = await runWithTenantContext(ctx, () => TarefaService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Editar Tarefa"
        description={`${tarefa.codigo} — ${tarefa.titulo}`}
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Tarefas', href: '/projetos/tarefas' },
          { label: tarefa.codigo, href: `/projetos/tarefas/${tarefa.id}` },
          { label: 'Editar' },
        ]}
      />
      <TarefaForm
        tarefa={{
          id: tarefa.id,
          codigo: tarefa.codigo,
          titulo: tarefa.titulo,
          descricao: tarefa.descricao,
          prioridade: tarefa.prioridade,
          dataFimPrevista: tarefa.dataFimPrevista,
          projetoLabel: `${tarefa.projeto.codigo} — ${tarefa.projeto.nome}`,
        }}
      />
    </div>
  );
}
