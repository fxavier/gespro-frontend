/**
 * Movimentações de Stock — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { TableSkeleton } from '../../inventario/ativos/_components/table-skeletons';
import { MovimentacaoTable } from './_components/movimentacao-table';

const FiltroSchema = z.object({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type Filtro = z.infer<typeof FiltroSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function MovimentacoesTableSection({ filtros, tenantId, userId }: { filtros: Filtro; tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarMovimentos({ cursor: filtros.cursor, take: filtros.take }, ctx)
  );

  return <MovimentacaoTable data={result.items} nextCursor={result.nextCursor} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MovimentacaoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Movimentações de Stock"
        description="Histórico de entradas, saídas e transferências"
        breadcrumbs={[
          { label: 'Stock', href: '/stock' },
          { label: 'Movimentações' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/stock/movimentacao/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Movimentação
            </Link>
          </Button>
        }
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={5} />}>
        <MovimentacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
