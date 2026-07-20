/**
 * Reconciliação de Inventário — Server Component (NUNCA 'use client').
 * Lista inventários físicos concluídos para reconciliação.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { inventarioFisicoService } from '@/server/services/inventario/inventario-fisico.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import { ReconciliacaoTable } from './_components/reconciliacao-table';

async function ReconciliacaoTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    inventarioFisicoService.listarInventarios({ status: 'CONCLUIDO', take: 25 }, ctx)
  );

  return <ReconciliacaoTable data={result.items} nextCursor={result.nextCursor} />;
}

export default async function ReconciliacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Reconciliação de Inventário"
        description="Inventários físicos concluídos e seus ajustes"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Reconciliação' },
        ]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/inventario/fisico">
              Ver Todos os Inventários
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <ReconciliacaoTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
