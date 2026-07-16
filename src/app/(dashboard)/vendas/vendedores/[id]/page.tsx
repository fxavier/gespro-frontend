/**
 * Perfil de Vendedor — Server Component.
 * Mostra o resumo de comissões do vendedor a partir do serviço real.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DollarSign, Clock, CheckCircle, TrendingUp, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comissaoService } from '@/server/services/comercial/index';
import { Button } from '@/components/ui/button';
import { PageHeader, KpiCard, StatusBadge } from '@/components/patterns';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function VendedorKpis({ vendedorId, tenantId, userId }: { vendedorId: string; tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext(ctx, () =>
    comissaoService.listar({ vendedorId, take: 100, orderBy: 'createdAt', order: 'desc' }, ctx)
  );

  const total = resultado.items.length;
  const pendentes = resultado.items.filter((c) => c.status === 'PENDENTE').length;
  const pagas = resultado.items.filter((c) => c.status === 'PAGA').length;
  const valorTotal = resultado.items.reduce((acc, c) => acc + parseFloat(c.valorComissao), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total Comissões" value={String(total)} icon={<DollarSign className="h-5 w-5" />} />
      <KpiCard title="Pendentes" value={String(pendentes)} icon={<Clock className="h-5 w-5" />} />
      <KpiCard title="Pagas" value={String(pagas)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard
        title="Valor Total"
        value={`MT ${valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

async function UltimasComissoes({ vendedorId, tenantId, userId }: { vendedorId: string; tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext(ctx, () =>
    comissaoService.listar({ vendedorId, take: 10, orderBy: 'createdAt', order: 'desc' }, ctx)
  );

  if (resultado.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Nenhuma comissão registada para este vendedor.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Últimas Comissões</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/vendas/vendedores/${vendedorId}/comissoes`}>
            Ver todas
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {resultado.items.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-6 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium font-mono">
                  <Link href={`/vendas/${c.vendaId}`} className="text-primary hover:underline">
                    {c.vendaId.slice(-8)}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {new Date(c.createdAt).toLocaleDateString('pt-MZ')} · {parseFloat(c.percentualAplicado).toFixed(2)}%
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  MT {parseFloat(c.valorComissao).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                </span>
                <StatusBadge status={c.status} />
              </div>
            </div>
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
          <Skeleton className="h-7 w-16" />
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
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function VendedorDetalhePage({ params }: PageProps) {
  const { id: vendedorId } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Vendedor ${vendedorId.slice(-8)}`}
        description="Perfil e desempenho do vendedor"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Vendedores', href: '/vendas/vendedores' },
          { label: vendedorId.slice(-8) },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/vendas/vendedores">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Vendedores
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <VendedorKpis vendedorId={vendedorId} tenantId={tenantId} userId={userId} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <UltimasComissoes vendedorId={vendedorId} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
