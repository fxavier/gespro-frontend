/**
 * Detalhe de Tarefa (#167) — Server Component (NUNCA 'use client').
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Edit } from 'lucide-react';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { formatarData } from '@/lib/format-date';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { TarefaService } from '@/server/services/pessoas-projetos/projetos.service';
import { Button } from '@/components/ui/button';
import { DetailShell, PageHeader, StatusBadge } from '@/components/patterns';

export default async function TarefaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let tarefa;
  try {
    tarefa = await runWithTenantContext(ctx, () => TarefaService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const podeEditar = permissions.includes('projetos:tarefas:update');

  const metadata = [
    { label: 'Código', value: <span className="font-mono text-sm">{tarefa.codigo}</span> },
    {
      label: 'Projecto',
      value: (
        <Link href={`/projetos/lista/${tarefa.projetoId}`} className="hover:underline">
          {tarefa.projeto.codigo} — {tarefa.projeto.nome}
        </Link>
      ),
    },
    { label: 'Estado', value: <StatusBadge status={tarefa.status} /> },
    { label: 'Prioridade', value: <StatusBadge status={tarefa.prioridade} /> },
    { label: 'Prazo', value: <span className="tabular-nums">{formatarData(tarefa.dataFimPrevista)}</span> },
    ...(tarefa.dataFimReal
      ? [{ label: 'Conclusão', value: <span className="tabular-nums">{formatarData(tarefa.dataFimReal)}</span> }]
      : []),
    { label: 'Progresso', value: <span className="tabular-nums">{tarefa.progresso}%</span> },
    {
      label: 'Horas',
      value: (
        <span className="tabular-nums">
          {tarefa.horasTrabalhadas}h{tarefa.horasEstimadas ? ` / ${tarefa.horasEstimadas}h` : ''}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={tarefa.titulo}
            breadcrumbs={[
              { label: 'Projectos', href: '/projetos/lista' },
              { label: 'Tarefas', href: '/projetos/tarefas' },
              { label: tarefa.codigo },
            ]}
            badge={<StatusBadge status={tarefa.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/projetos/tarefas">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/projetos/tarefas/${tarefa.id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'descricao',
            label: 'Descrição',
            content: (
              <p className="text-sm whitespace-pre-wrap">
                {tarefa.descricao || <span className="text-muted-foreground">Sem descrição.</span>}
              </p>
            ),
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
