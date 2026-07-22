/**
 * Dashboard de Clientes — Server Component.
 * KPIs e clientes recentes a partir do serviço real.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users, UserCheck, UserX, Crown, Plus, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { PageHeader, KpiCard, StatusBadge } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';

async function ClientesKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext(ctx, () =>
    clienteService.listar({ take: 100, orderBy: 'createdAt', order: 'desc' }, ctx)
  );

  const total = resultado.items.length;
  const ativos = resultado.items.filter((c) => c.status === 'ATIVO').length;
  const suspensos = resultado.items.filter((c) => c.status === 'SUSPENSO').length;
  const vip = resultado.items.filter((c) => c.categoria === 'VIP').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total Clientes" value={String(total)} icon={<Users className="h-5 w-5" />} />
      <KpiCard title="Activos" value={String(ativos)} icon={<UserCheck className="h-5 w-5" />} />
      <KpiCard title="Suspensos" value={String(suspensos)} icon={<UserX className="h-5 w-5" />} />
      <KpiCard title="VIP" value={String(vip)} icon={<Crown className="h-5 w-5" />} />
    </div>
  );
}

async function ClientesRecentes({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext(ctx, () =>
    clienteService.listar({ take: 10, orderBy: 'createdAt', order: 'desc' }, ctx)
  );

  if (resultado.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Nenhum cliente registado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Clientes Recentes</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/clientes">
            Ver todos
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {resultado.items.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="flex items-center justify-between px-6 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.nuit} · {c.email}</p>
              </div>
              <StatusBadge status={c.status} />
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
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default async function ClientesDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard de Clientes"
        description="Visão geral da carteira de clientes"
        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: 'Dashboard' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/clientes/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ClientesKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <ClientesRecentes tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
