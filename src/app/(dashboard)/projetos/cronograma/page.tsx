/**
 * Cronograma de Projectos (Gantt global) — Server Component.
 * Mostra todos os projectos activos e as suas tarefas em vista de linha do tempo.
 * O componente Gantt é pesado → carregado via GanttWrapper (dynamic + skeleton).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, FolderKanban, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { CronogramaService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GanttWrapper } from './_components/gantt-wrapper';

// ─────────────────────────────────────────────────────────────────────────────
// Secções assíncronas com Suspense
// ─────────────────────────────────────────────────────────────────────────────

async function CronogramaKpisSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const projetos = await runWithTenantContext({ tenantId, userId }, () =>
    CronogramaService.listarCronograma({ tenantId, userId })
  );

  const atrasados = projetos.filter(
    (p) => p.status !== 'CONCLUIDO' && new Date(p.dataFimPrevista) < new Date()
  ).length;
  const emAndamento = projetos.filter((p) => p.status === 'EM_ANDAMENTO').length;
  const progMedio = projetos.length
    ? Math.round(projetos.reduce((s, p) => s + p.progresso, 0) / projetos.length)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard title="Total de Projectos" value={projetos.length} icon={<CalendarDays className="h-5 w-5" />} />
      <KpiCard title="Em Andamento" value={emAndamento} icon={<CalendarDays className="h-5 w-5" />} />
      <KpiCard title="Com Atraso" value={atrasados} icon={<CalendarDays className="h-5 w-5" />} />
      <KpiCard title="Progresso Médio" value={`${progMedio}%`} icon={<CalendarDays className="h-5 w-5" />} />
    </div>
  );
}

async function ListaProjetosSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const projetos = await runWithTenantContext({ tenantId, userId }, () =>
    CronogramaService.listarCronograma({ tenantId, userId })
  );

  if (projetos.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
        <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground mb-3" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Nenhum projecto activo.{' '}
          <Link href="/projetos/lista/novo" className="text-primary underline-offset-4 hover:underline">
            Criar projecto
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border divide-y divide-border overflow-hidden">
      {projetos.map((p) => (
        <Link
          key={p.id}
          href={`/projetos/cronograma?projeto=${p.id}`}
          className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors group"
        >
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{p.codigo}</span>
              <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                {p.nome}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {new Date(p.dataInicio).toLocaleDateString('pt-MZ')} →{' '}
                {new Date(p.dataFimPrevista).toLocaleDateString('pt-MZ')}
              </span>
              <span>{p._count.tarefas} tarefa(s)</span>
            </div>
          </div>
          <div className="w-32 space-y-1 flex-shrink-0">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progresso</span>
              <span>{p.progresso}%</span>
            </div>
            <div
              className="h-1.5 bg-muted rounded-full overflow-hidden"
              aria-label={`Progresso: ${p.progresso}%`}
            >
              <div
                className="h-full bg-primary/70 rounded-full"
                style={{ width: `${p.progresso}%` }}
              />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

async function GanttDetalheSection({
  projetoId,
  tenantId,
  userId,
}: {
  projetoId: string;
  tenantId: string;
  userId: string;
}) {
  const dados = await runWithTenantContext({ tenantId, userId }, () =>
    CronogramaService.cronograma(projetoId, { tenantId, userId })
  );

  const projeto = {
    ...dados.projeto,
    dataInicio: new Date(dados.projeto.dataInicio),
    dataFimPrevista: new Date(dados.projeto.dataFimPrevista),
  };
  const tarefas = dados.tarefas.map((t) => ({
    ...t,
    dataInicio: t.dataInicio ? new Date(t.dataInicio) : null,
    dataFimPrevista: new Date(t.dataFimPrevista),
    dataFimReal: t.dataFimReal ? new Date(t.dataFimReal) : null,
  }));
  const marcos = dados.marcos.map((m) => ({
    ...m,
    dataPrevista: new Date(m.dataPrevista),
    dataReal: m.dataReal ? new Date(m.dataReal) : null,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link
          href="/projetos/cronograma"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Todos os projectos
        </Link>
        <span className="text-sm font-semibold">{projeto.nome}</span>
        <Link
          href={`/projetos/lista/${projeto.id}`}
          className="ml-auto text-xs text-primary hover:underline underline-offset-4"
        >
          Ver detalhe do projecto →
        </Link>
      </div>
      <GanttWrapper projeto={projeto} tarefas={tarefas} marcos={marcos} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CronogramaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const params = await searchParams;
  const projetoId = typeof params.projeto === 'string' ? params.projeto : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cronograma"
        description="Vista de Gantt e linha de tempo dos projectos activos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Cronograma' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/projetos/lista/novo">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Novo Projecto
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <Suspense
        fallback={
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        }
      >
        <CronogramaKpisSection tenantId={tenantId} userId={userId} />
      </Suspense>

      {projetoId ? (
        /* Vista Gantt detalhada de um projecto */
        <Suspense
          key={projetoId}
          fallback={
            <div className="rounded-lg border border-border p-4 space-y-2" aria-busy="true">
              <Skeleton className="h-8 w-full" />
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          }
        >
          <GanttDetalheSection projetoId={projetoId} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        /* Lista de projectos com link para Gantt individual */
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Projectos Activos</h2>
            <span className="text-xs text-muted-foreground ml-auto">
              Clique num projecto para ver o Gantt detalhado
            </span>
          </div>
          <Suspense
            fallback={
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            }
          >
            <ListaProjetosSection tenantId={tenantId} userId={userId} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
