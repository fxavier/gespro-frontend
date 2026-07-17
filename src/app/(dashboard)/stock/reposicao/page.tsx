/**
 * Reposição de Stock — Server Component (NUNCA 'use client').
 * Lista produtos com alertas de stock mínimo.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { PageHeader } from '@/components/patterns';
import { TableSkeleton } from '../../inventario/ativos/_components/table-skeletons';
import { ReposicaoTable } from './_components/reposicao-table';

async function ReposicaoTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const alertas = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.obterAlertasStockMinimo(ctx)
  );

  return <ReposicaoTable data={alertas} />;
}

export default async function ReposicaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reposição de Stock"
        description="Produtos abaixo do stock mínimo que necessitam de reposição"
        breadcrumbs={[
          { label: 'Stock', href: '/stock' },
          { label: 'Reposição' },
        ]}
        actions={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span>Produtos com stock abaixo do mínimo</span>
          </div>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <ReposicaoTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
