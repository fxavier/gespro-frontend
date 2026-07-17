/**
 * Abate de Ativos — Server Component (NUNCA 'use client').
 * Lista os ativos com estado BAIXADO.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader } from '@/components/patterns';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import { AbateTable } from './_components/abate-table';

async function AbateTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarAtivos({ estado: 'BAIXADO', take: 50, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
  );

  return <AbateTable data={result.items} />;
}

export default async function AbatePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Abate de Ativos"
        description="Registo de ativos baixados e abatidos do inventário"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Abate' },
        ]}
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={4} />}>
        <AbateTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
