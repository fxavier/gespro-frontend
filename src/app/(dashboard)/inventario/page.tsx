/**
 * Dashboard de Inventário — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Package,
  Wrench,
  MapPin,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { manutencaoService } from '@/server/services/inventario/manutencao.service';
import { Button } from '@/components/ui/button';
import { PageHeader, KpiCard } from '@/components/patterns';
import { KpiSkeleton } from './ativos/_components/table-skeletons';

// ─── Secção KPIs ──────────────────────────────────────────────────────────────

async function KpiSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [
    ativosResult,
    pendentes,
  ] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      ativosService.listarAtivos({ take: 1, orderBy: 'createdAt', orderDir: 'desc' }, ctx),
      manutencaoService.obterManutencoesPendentes(ctx),
    ])
  );

  const ativosPorEstado = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      ativosService.listarAtivos({ estado: 'EM_USO', take: 1, orderBy: 'createdAt', orderDir: 'desc' }, ctx),
      ativosService.listarAtivos({ estado: 'EM_MANUTENCAO', take: 1, orderBy: 'createdAt', orderDir: 'desc' }, ctx),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Ativos"
        value={ativosResult.nextCursor !== null ? '25+' : String(ativosResult.items.length)}
        icon={<Package className="h-5 w-5" />}
        description="ativos registados"
      />
      <KpiCard
        title="Em Uso"
        value={ativosPorEstado[0].nextCursor !== null ? '25+' : String(ativosPorEstado[0].items.length)}
        icon={<Tag className="h-5 w-5" />}
        description="ativos activos"
      />
      <KpiCard
        title="Em Manutenção"
        value={String(ativosPorEstado[1].items.length)}
        icon={<Wrench className="h-5 w-5" />}
        description="requerem atenção"
      />
      <KpiCard
        title="Manutenções Pendentes"
        value={String(pendentes.length)}
        icon={<Wrench className="h-5 w-5" />}
        description="agendadas vencidas"
      />
    </div>
  );
}

// ─── Atalhos rápidos ─────────────────────────────────────────────────────────

const SHORTCUTS = [
  { label: 'Ativos', href: '/inventario/ativos', icon: Package, desc: 'Equipamentos e bens' },
  { label: 'Manutenção', href: '/inventario/manutencao', icon: Wrench, desc: 'Preventiva e corretiva' },
  { label: 'Categorias', href: '/inventario/categorias', icon: Tag, desc: 'Organização de ativos' },
  { label: 'Localizações', href: '/inventario/localizacoes', icon: MapPin, desc: 'Armazéns e áreas' },
  { label: 'Inventário Físico', href: '/inventario/fisico', icon: Package, desc: 'Contagens e reconciliação' },
  { label: 'Movimentações', href: '/inventario/movimentacoes', icon: ArrowRight, desc: 'Histórico de movimentos' },
];

// ─── Página principal ─────────────────────────────────────────────────────────

export default async function InventarioDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard de Inventário"
        description="Visão geral dos ativos, manutenções e stock da empresa"
        breadcrumbs={[{ label: 'Inventário' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/ativos/novo">
              <Package className="h-4 w-4 mr-2" />
              Novo Ativo
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection tenantId={tenantId} userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SHORTCUTS.map(({ label, href, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-lg border p-4 hover:bg-accent transition-colors"
          >
            <div className="rounded-md bg-primary/10 p-2.5 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        ))}
      </div>
    </div>
  );
}
