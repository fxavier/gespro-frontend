/**
 * Kanban de Projecto — Server Component (NUNCA 'use client').
 * Carrega tarefas agrupadas por estado e passa ao KanbanBoard (CC).
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { TarefaService, ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { KanbanBoard } from './_components/kanban-board';
import type { TarefaKanban } from './_components/kanban-board';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjetoKanbanPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let projeto;
  let colunasRaw: Record<string, TarefaKanban[]>;

  try {
    [projeto, colunasRaw] = await runWithTenantContext(ctx, () =>
      Promise.all([
        ProjetoService.obter(id, ctx),
        TarefaService.listarKanban(id, ctx).then((cols) => {
          // Converter campos para tipos simples (Date → Date está ok pois é SC)
          const result: Record<string, TarefaKanban[]> = {};
          for (const [status, tarefas] of Object.entries(cols)) {
            result[status] = tarefas.map((t) => ({
              id: t.id,
              codigo: t.codigo,
              titulo: t.titulo,
              status: t.status,
              prioridade: t.prioridade,
              posicao: t.posicao,
              dataFimPrevista: t.dataFimPrevista,
              tags: t.tags as string[],
            }));
          }
          return result;
        }),
      ])
    );
  } catch {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Kanban — ${projeto.nome}`}
        description="Arraste as tarefas para reordená-las ou mudar de estado"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: projeto.nome, href: `/projetos/lista/${id}` },
          { label: 'Kanban' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projetos/lista/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Voltar ao Projecto
            </Link>
          </Button>
        }
      />

      <KanbanBoard colunas={colunasRaw} projetoId={id} />
    </div>
  );
}
