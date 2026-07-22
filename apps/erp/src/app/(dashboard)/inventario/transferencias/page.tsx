/**
 * Transferências de Stock — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import { TransferenciasTable } from './_components/transferencias-table';

async function TransferenciasTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarMovimentos({ take: 25 }, ctx)
  );

  const transferencias = result.items.filter((m) => m.tipo === 'TRANSFERENCIA');

  return <TransferenciasTable data={transferencias} />;
}

export default async function TransferenciasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Transferências de Stock"
        description="Movimentos de stock entre localizações"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Transferências' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/movimentacoes">
              Ver Todas as Movimentações
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <TransferenciasTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
