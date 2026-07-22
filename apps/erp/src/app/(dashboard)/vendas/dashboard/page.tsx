/**
 * Dashboard de Vendas — Server Component.
 * KPIs e vendas recentes a partir do serviço real.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShoppingCart, CheckCircle, Clock, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendaService } from '@/server/services/comercial/index';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader, KpiCard, StatusBadge } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';

async function VendasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext(ctx, () =>
    vendaService.listar({ take: 100, orderBy: 'dataVenda', order: 'desc' }, ctx)
  );

  const total = resultado.items.length;
  const concluidas = resultado.items.filter((v) => v.status === 'CONCLUIDA').length;
  const pendentes = resultado.items.filter((v) =>
    v.status === 'PENDENTE' || v.status === 'CONFIRMADA' || v.status === 'EM_PREPARACAO'
  ).length;
  const volume = resultado.items.reduce((acc, v) => acc + parseFloat(v.total), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Volume Total"
        value={`MT ${volume.toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <KpiCard title="Total Vendas" value={String(total)} icon={<ShoppingCart className="h-5 w-5" />} />
      <KpiCard title="Concluídas" value={String(concluidas)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard title="Em Curso" value={String(pendentes)} icon={<Clock className="h-5 w-5" />} />
    </div>
  );
}

async function VendasRecentes({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext(ctx, () =>
    vendaService.listar({ take: 10, orderBy: 'dataVenda', order: 'desc' }, ctx)
  );

  if (resultado.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Nenhuma venda registada ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Vendas Recentes</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/vendas">
            Ver todas
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {resultado.items.map((v) => (
            <Link
              key={v.id}
              href={`/vendas/${v.id}`}
              className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium tabular-nums">{v.numero}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.dataVenda).toLocaleDateString('pt-MZ')} · {v.origem}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  MT {parseFloat(v.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                </span>
                <StatusBadge status={v.status} />
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-lg border">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-14 px-6 gap-4 border-b last:border-0 items-center">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function VendasDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard de Vendas"
        description="Visão geral do desempenho de vendas"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Dashboard' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/pos">
              <Plus className="h-4 w-4 mr-2" />
              Nova Venda (POS)
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <VendasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <VendasRecentes tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
