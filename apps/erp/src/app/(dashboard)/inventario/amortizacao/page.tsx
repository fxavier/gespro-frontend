/**
 * Amortização de Ativos — Server Component (NUNCA 'use client').
 * Mostra ativos activos com informação de amortização.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader } from '@/components/patterns';
import { TableSkeleton } from '../ativos/_components/table-skeletons';
import { AmortizacaoTable } from './_components/amortizacao-table';

async function AmortizacaoTableSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarAtivos({ estado: 'EM_USO', take: 50, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
  );

  return <AmortizacaoTable data={result.items} nextCursor={result.nextCursor} />;
}

export default async function AmortizacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Amortização de Ativos"
        description="Valores líquidos e planos de amortização dos ativos em uso"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Amortização' },
        ]}
      />

      <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
        <AmortizacaoTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
