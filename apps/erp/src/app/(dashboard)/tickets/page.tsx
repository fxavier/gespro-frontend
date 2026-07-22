/**
 * Dashboard de Tickets — Server Component.
 * Visão geral com KPIs e navegação rápida.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Ticket, AlertTriangle, CheckCircle, Clock,
  Inbox, User, Zap, BookOpen, Tag, BarChart3,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ticketService } from '@/server/services/operacoes/ticket.service';
import { KpiCard, PageHeader } from '@/components/patterns';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function TicketsDashboardKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [abertos, emAtraso] = await Promise.all([
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ estado: 'ABERTO', take: 50, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      ticketService.listarTickets({ slaEmAtraso: true, take: 50, orderBy: 'createdAt', order: 'desc' }, ctx)
    ),
  ]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Tickets Abertos"
        value={String(abertos.items.length)}
        icon={<Ticket className="h-5 w-5" />}
      />
      <KpiCard
        title="SLA em Atraso"
        value={String(emAtraso.items.length)}
        icon={<AlertTriangle className="h-5 w-5" />}
      />
      <KpiCard
        title="Em Progresso"
        value={String(abertos.items.filter(t => t.estado === 'EM_PROGRESSO').length)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Urgentes"
        value={String(abertos.items.filter(t => t.prioridade === 'URGENTE').length)}
        icon={<Zap className="h-5 w-5" />}
      />
    </div>
  );
}

const NAV_LINKS = [
  { href: '/tickets/lista', label: 'Todos os Tickets', icon: Ticket, description: 'Listagem completa' },
  { href: '/tickets/caixa-entrada', label: 'Caixa de Entrada', icon: Inbox, description: 'Tickets por atribuir' },
  { href: '/tickets/meus', label: 'Os Meus Tickets', icon: User, description: 'Tickets atribuídos a mim' },
  { href: '/tickets/urgentes', label: 'Urgentes', icon: Zap, description: 'Alta prioridade' },
  { href: '/tickets/resolvidos', label: 'Resolvidos', icon: CheckCircle, description: 'Tickets fechados' },
  { href: '/tickets/categorias', label: 'Categorias', icon: Tag, description: 'Configurar categorias' },
  { href: '/tickets/base-conhecimento', label: 'Base de Conhecimento', icon: BookOpen, description: 'Artigos e soluções' },
  { href: '/tickets/relatorios', label: 'Relatórios', icon: BarChart3, description: 'Métricas e análises' },
];

export default async function TicketsPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Tickets de Suporte"
        description="Central de gestão de tickets e pedidos de serviço"
        breadcrumbs={[{ label: 'Tickets' }]}
      />

      <Suspense fallback={<KpiSkeleton />}>
        <TicketsDashboardKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {NAV_LINKS.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href}>
            <Card className="hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer h-full">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-md bg-primary/10 flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
