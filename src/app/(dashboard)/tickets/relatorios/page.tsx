/**
 * Relatórios de Tickets — Server Component.
 * Dashboard de métricas resumidas.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { BarChart3, Ticket, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { KpiCard, PageHeader } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}><CardContent className="p-5"><Skeleton className="h-8 w-24" /></CardContent></Card>
      ))}
    </div>
  );
}

async function RelatorioKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [todos, emAtraso, resolvidos, urgentes] = await Promise.all([
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ take: 200, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ slaEmAtraso: true, take: 200, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ estado: 'RESOLVIDO', take: 200, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ prioridade: 'URGENTE', take: 200, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
  ]);

  const total = todos.items.length;
  const slaAtraso = emAtraso.items.length;
  const totalResolvidos = resolvidos.items.length;
  const totalUrgentes = urgentes.items.length;

  const taxaResolucao = total > 0 ? Math.round((totalResolvidos / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total de Tickets" value={String(total)} icon={<Ticket className="h-5 w-5" />} />
        <KpiCard title="Taxa de Resolução" value={`${taxaResolucao}%`} icon={<CheckCircle className="h-5 w-5" />} />
        <KpiCard title="SLA em Atraso" value={String(slaAtraso)} icon={<AlertTriangle className="h-5 w-5" />} />
        <KpiCard title="Urgentes" value={String(totalUrgentes)} icon={<Clock className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Distribuição por Estado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(['ABERTO', 'EM_PROGRESSO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'FECHADO', 'CANCELADO'] as const).map((estado) => {
              const count = todos.items.filter((t) => t.estado === estado).length;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={estado} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{estado.replace('_', ' ')}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function RelatoriosTicketsPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Relatórios de Tickets"
        description="Métricas e análises do serviço de suporte"
        breadcrumbs={[
          { label: 'Tickets', href: '/tickets' },
          { label: 'Relatórios' },
        ]}
      />

      <Suspense fallback={<KpiSkeleton />}>
        <RelatorioKpis tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
