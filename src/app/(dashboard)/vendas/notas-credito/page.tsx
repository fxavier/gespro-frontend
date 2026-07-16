/**
 * Notas de Crédito — Server Component (listagem).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarNotasCredito } from '@/server/services/financas/faturacao.service';
import { FiltroNotaCreditoSchema } from '@/lib/validations/faturacao';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import { NotasCreditoTable, type NotaCreditoRow } from './_components/notas-credito-table';

const FiltroUrlSchema = FiltroNotaCreditoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Emitida', value: 'EMITIDA' },
      { label: 'Liquidada', value: 'LIQUIDADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

async function NotasCreditoTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: z.infer<typeof FiltroUrlSchema>;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    listarNotasCredito({ status: filtros.status, cursor: filtros.cursor, take: filtros.take, faturaOriginalId: filtros.faturaOriginalId, dataInicio: filtros.dataInicio, dataFim: filtros.dataFim }, ctx)
  );

  const rows: NotaCreditoRow[] = result.items.map((n) => ({
    id: n.id,
    numero: n.numero,
    faturaOriginalId: n.faturaOriginalId,
    status: n.status,
    motivo: n.motivo,
    dataEmissao: n.dataEmissao.toISOString(),
    total: n.total.toString(),
    moeda: n.moeda,
  }));

  return <NotasCreditoTable data={rows} nextCursor={result.nextCursor} />;
}

function TableSkeleton() {
  return (
    <div className="rounded-lg border">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-11 px-4 gap-4 border-b last:border-0 items-center">
          {[1, 2, 3, 4, 5].map((j) => <Skeleton key={j} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

export default async function NotasCreditoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : { take: 25 };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Notas de Crédito"
        description="Documentos de crédito por devolução ou correcção de valores"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Crédito' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/notas-credito/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Nota de Crédito
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <NotasCreditoTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
