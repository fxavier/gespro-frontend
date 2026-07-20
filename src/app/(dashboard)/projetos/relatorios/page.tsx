/**
 * Relatórios de Projectos — Server Component.
 * KPIs globais + gráfico de progresso por projecto.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BarChart3, Clock, FolderKanban, TrendingUp } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { RelatorioService } from '@/server/services/pessoas-projetos/projetos.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressoChartWrapper } from './_components/progresso-chart-wrapper';

// ─────────────────────────────────────────────────────────────────────────────
// KPIs globais
// ─────────────────────────────────────────────────────────────────────────────

async function RelatoriosKpisSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpis = await runWithTenantContext({ tenantId, userId }, () =>
    RelatorioService.kpisGlobais({ tenantId, userId })
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Projectos"
        value={kpis.totalProjetos}
        icon={<FolderKanban className="h-5 w-5" />}
      />
      <KpiCard
        title="Em Andamento"
        value={kpis.emAndamento}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <KpiCard
        title="Concluídos"
        value={kpis.concluidos}
        icon={<BarChart3 className="h-5 w-5" />}
      />
      <KpiCard
        title="Horas Registadas"
        value={kpis.horasTotal.toFixed(1)}
        icon={<Clock className="h-5 w-5" />}
        description="Horas totais de timesheet"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gráfico de progresso
// ─────────────────────────────────────────────────────────────────────────────

async function ProgressoSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const projetos = await runWithTenantContext({ tenantId, userId }, () =>
    RelatorioService.progressoPorProjeto({ tenantId, userId })
  );

  const projetosSer = projetos.map((p) => ({
    id: p.id,
    nome: p.nome,
    codigo: p.codigo,
    status: p.status as string,
    progresso: p.progresso,
    dataFimPrevista: new Date(p.dataFimPrevista),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Progresso por Projecto</CardTitle>
      </CardHeader>
      <CardContent>
        <ProgressoChartWrapper projetos={projetosSer} />
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório de projecto específico
// ─────────────────────────────────────────────────────────────────────────────

async function RelatorioProjetoSection({
  projetoId,
  tenantId,
  userId,
}: {
  projetoId: string;
  tenantId: string;
  userId: string;
}) {
  const rel = await runWithTenantContext({ tenantId, userId }, () =>
    RelatorioService.relatorio(projetoId, { tenantId, userId })
  );

  const desvioOrcamento = rel.orcamento.planejado > 0
    ? ((rel.orcamento.utilizado - rel.orcamento.planejado) / rel.orcamento.planejado * 100).toFixed(1)
    : '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/projetos/relatorios" className="text-xs text-muted-foreground hover:text-foreground">
          ← Relatório global
        </Link>
        <span className="text-sm font-semibold">{rel.projeto.nome}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          title="Progresso"
          value={`${rel.projeto.progresso}%`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Tarefas Concluídas"
          value={`${rel.tarefas.concluidas}/${rel.tarefas.total}`}
          icon={<FolderKanban className="h-5 w-5" />}
        />
        <KpiCard
          title="Horas (est./real)"
          value={`${rel.horas.estimadas}h / ${rel.horas.trabalhadas.toFixed(1)}h`}
          icon={<Clock className="h-5 w-5" />}
        />
        <KpiCard
          title="Desvio Orçamental"
          value={desvioOrcamento === '—' ? '—' : `${desvioOrcamento}%`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      {rel.marcos.lista.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Marcos ({rel.marcos.atrasados} em atraso)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rel.marcos.lista.map((m) => {
                const atrasado = m.status !== 'CONCLUIDO' && new Date(m.dataPrevista) < new Date();
                return (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <span className={`font-medium ${atrasado ? 'text-destructive' : ''}`}>
                      {atrasado ? '⚠ ' : ''}{m.nome}
                    </span>
                    <span className="text-muted-foreground tabular-nums ml-auto">
                      {new Date(m.dataPrevista).toLocaleDateString('pt-MZ')}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      m.status === 'CONCLUIDO' ? 'bg-success/20 text-success' :
                      atrasado ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RelatoriosProjetosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const params = await searchParams;
  const projetoId = typeof params.projeto === 'string' ? params.projeto : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios"
        description="Análise de desempenho e indicadores dos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Relatórios' },
        ]}
      />

      <Suspense
        fallback={
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        }
      >
        <RelatoriosKpisSection tenantId={tenantId} userId={userId} />
      </Suspense>

      {projetoId ? (
        <Suspense
          key={projetoId}
          fallback={<Skeleton className="h-64 w-full" />}
        >
          <RelatorioProjetoSection projetoId={projetoId} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ProgressoSection tenantId={tenantId} userId={userId} />
        </Suspense>
      )}

      <div className="text-xs text-muted-foreground">
        Para relatório detalhado de um projecto, aceda ao projecto e clique em{' '}
        <Link href="/projetos/lista" className="text-primary hover:underline underline-offset-4">
          Lista de Projectos
        </Link>
        .
      </div>
    </div>
  );
}
