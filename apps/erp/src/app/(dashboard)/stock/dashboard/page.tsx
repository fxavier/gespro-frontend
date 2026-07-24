/**
 * Dashboard de Stock — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Package,
  PackageOpen,
  PackagePlus,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { KpiSkeleton } from '../../inventario/ativos/_components/table-skeletons';

async function KpiSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [produtos, alertas, movimentos] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      catalogoProdutoService.listarProdutos({ take: 1, orderBy: 'createdAt', orderDir: 'desc' }, ctx),
      stockService.obterAlertasStockMinimo(ctx),
      stockService.listarMovimentos({ take: 1 }, ctx),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        title="Produtos no Catálogo"
        value={produtos.nextCursor !== null ? '25+' : String(produtos.items.length)}
        icon={<Package className="h-5 w-5" />}
        description="itens cadastrados"
      />
      <KpiCard
        title="Alertas de Stock Mínimo"
        value={String(alertas.length)}
        icon={<AlertTriangle className="h-5 w-5" />}
        description="requerem reposição"
      />
      <KpiCard
        title="Movimentações"
        value={movimentos.nextCursor !== null ? '25+' : String(movimentos.items.length)}
        icon={<PackageOpen className="h-5 w-5" />}
        description="registadas"
      />
    </div>
  );
}

const SHORTCUTS = [
  { label: 'Produtos', href: '/produtos', icon: Package, desc: 'Catálogo de produtos e serviços' },
  { label: 'Movimentações', href: '/inventario/movimentacoes', icon: PackageOpen, desc: 'Entradas, saídas e transferências' },
  { label: 'Reposição', href: '/stock/reposicao', icon: PackagePlus, desc: 'Produtos com stock baixo' },
  { label: 'Localizações', href: '/inventario/localizacoes', icon: Package, desc: 'Armazéns e áreas de stock' },
];

export default async function StockDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard de Stock"
        description="Visão geral do inventário de stock e movimentações"
        breadcrumbs={[{ label: 'Stock', href: '/stock' }, { label: 'Dashboard' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/movimentacoes/nova">
              <PackagePlus className="h-4 w-4 mr-2" />
              Nova Movimentação
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection tenantId={tenantId} userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
