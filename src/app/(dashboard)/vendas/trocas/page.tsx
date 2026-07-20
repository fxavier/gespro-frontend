/**
 * Listagem de Trocas — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { trocaService } from '@/server/services/comercial/index';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { TrocasTable } from './_components/trocas-table';

async function TrocasTableSection({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    trocaService.listar({ tenantId, userId })
  );
  return <TrocasTable data={result.items} nextCursor={result.nextCursor} />;
}

function TableSkeleton() {
  return (
    <div className="rounded-md border animate-pulse">
      <div className="h-12 bg-muted" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 border-t bg-muted/30" />
      ))}
    </div>
  );
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TrocasPage({ searchParams: _searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Trocas"
        description="Gestão de trocas de produtos"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Trocas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/devolucoes">
              <Plus className="h-4 w-4 mr-2" />
              Nova Troca (via Devolução)
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<TableSkeleton />}>
        <TrocasTableSection tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
