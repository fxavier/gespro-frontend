/**
 * Relatórios de Produção — Server Component (NUNCA 'use client').
 *
 * KPIs reais via `relatoriosService`; gráficos `dataviz` carregados com
 * dynamic(ssr:false) dentro da fronteira client; exportação por Route Handler
 * (`/api/export/producao-ordens`) — download nativo, sem fetch manual.
 */
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Factory, CircleCheck, Coins, Gauge, Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { relatoriosService } from '@/server/services/plataforma/relatorios.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GraficoOrdensPorStatusWrapper, GraficoCustosWrapper } from './_components/graficos';

function SeccaoSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border p-5 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-[300px] w-full rounded-lg" />
    </div>
  );
}

const mt = (v: string) => `MT ${parseFloat(v).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;

async function ConteudoProducao({ tenantId, userId }: { tenantId: string; userId: string }) {
  const r = await relatoriosService.relatorioProducao({ tenantId, userId });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total de Ordens"
          value={String(r.totalOrdens)}
          description={`${r.ordensConcluidas} concluídas`}
          icon={<Factory className="h-5 w-5" />}
        />
        <KpiCard
          title="Custo Realizado"
          value={mt(r.custoRealizadoTotal)}
          description={`Estimado: ${mt(r.custoEstimadoTotal)}`}
          icon={<Coins className="h-5 w-5" />}
        />
        <KpiCard
          title="Taxa de Qualidade"
          value={`${parseFloat(r.taxaQualidade).toFixed(1)}%`}
          description="Ordens concluídas aprovadas"
          icon={<CircleCheck className="h-5 w-5" />}
        />
        <KpiCard
          title="Progresso Médio"
          value={`${parseFloat(r.progressoMedio).toFixed(0)}%`}
          icon={<Gauge className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoOrdensPorStatusWrapper dados={r.porStatus} />
        <GraficoCustosWrapper estimado={r.custoEstimadoTotal} realizado={r.custoRealizadoTotal} />
      </div>
    </div>
  );
}

export default async function RelatoriosProducaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios de Produção"
        description="Análises de eficiência, custos e qualidade da produção"
        breadcrumbs={[{ label: 'Produção', href: '/producao' }, { label: 'Relatórios' }]}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/export/producao-ordens?formato=csv" download>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/export/producao-ordens?formato=xlsx" download>
                <Download className="h-4 w-4 mr-2" />
                XLSX
              </a>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<SeccaoSkeleton />}>
        <ConteudoProducao tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
