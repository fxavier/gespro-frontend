/**
 * Dashboard de Compras — Server Component (NUNCA 'use client').
 * Dados reais via comprasService + fornecedorService; sem mock data.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, FileCheck, Building, ShoppingBag } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { Button } from '@/components/ui/button';
import { PageHeader, KpiCard } from '@/components/patterns';
import { KpiSkeleton } from './_components/kpi-skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function ComprasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [requisicoes, pedidos, fornecedores] = await Promise.all([
    runWithTenantContext(ctx, () =>
      comprasService.listarRequisicoes(
        { take: 1000, orderBy: 'createdAt', orderDir: 'desc' },
        ctx,
      )
    ),
    runWithTenantContext(ctx, () =>
      comprasService.listarPedidos(
        { take: 1000, orderBy: 'createdAt', orderDir: 'desc' },
        ctx,
      )
    ),
    runWithTenantContext(ctx, () =>
      fornecedorService.listar({ take: 1000, orderBy: 'nome', orderDir: 'asc' }, ctx)
    ),
  ]);

  const requisicoesAbertas = requisicoes.items.filter(
    (r) => r.status === 'PENDENTE' || r.status === 'EM_APROVACAO',
  ).length;
  const pedidosEmAndamento = pedidos.items.filter(
    (p) => p.status === 'ENVIADO' || p.status === 'CONFIRMADO' || p.status === 'EM_TRANSITO',
  ).length;
  const fornecedoresAtivos = fornecedores.items.filter((f) => f.status === 'ATIVO').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Requisições abertas"
        value={String(requisicoesAbertas)}
        icon={<ClipboardList className="h-5 w-5" />}
      />
      <KpiCard
        title="Pedidos em andamento"
        value={String(pedidosEmAndamento)}
        icon={<FileCheck className="h-5 w-5" />}
      />
      <KpiCard
        title="Fornecedores activos"
        value={String(fornecedoresAtivos)}
        icon={<Building className="h-5 w-5" />}
      />
      <KpiCard
        title="Total requisições"
        value={String(requisicoes.items.length)}
        icon={<ShoppingBag className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function ComprasDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Compras"
        description="Visão geral do módulo de compras"
        breadcrumbs={[{ label: 'Compras' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/compras/requisicoes/novo">
              <ClipboardList className="h-4 w-4 mr-2" />
              Nova Requisição
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ComprasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* Atalhos rápidos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { href: '/compras/requisicoes', label: 'Requisições', icon: ClipboardList },
          { href: '/fornecedores/lista', label: 'Fornecedores', icon: Building },
          { href: '/compras/pedidos', label: 'Pedidos', icon: FileCheck },
          { href: '/servicos/lista', label: 'Serviços', icon: ShoppingBag },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent transition-colors"
          >
            <Icon className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
