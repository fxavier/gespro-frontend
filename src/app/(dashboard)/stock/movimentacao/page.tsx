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
import { PageHeader, FilterBar, DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn, FilterConfig } from '@/components/patterns';
import type { MovimentoStockDto } from '@/server/services/inventario/stock.interface';
import { TableSkeleton } from '../../inventario/ativos/_components/table-skeletons';

const FiltroSchema = z.object({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type Filtro = z.infer<typeof FiltroSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

const TIPO_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  ENTRADA: 'success',
  SAIDA: 'destructive',
  TRANSFERENCIA: 'info',
  BAIXA: 'destructive',
  AJUSTE: 'outline',
  RESERVA: 'warning',
};

const TIPO_LABELS: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  TRANSFERENCIA: 'Transferência',
  BAIXA: 'Baixa',
  AJUSTE: 'Ajuste',
  RESERVA: 'Reserva',
};

const columns: TableColumn<MovimentoStockDto>[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => (
      <StatusBadge
        status={row.tipo}
        variant={TIPO_VARIANTES[row.tipo] ?? 'default'}
        label={TIPO_LABELS[row.tipo] ?? row.tipo}
      />
    ),
  },
  {
    key: 'produtoId',
    label: 'Produto',
    render: (row) => <span className="text-sm font-medium tabular-nums">{row.produtoId.slice(0, 8)}…</span>,
  },
  {
    key: 'quantidade',
    label: 'Qtd',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="tabular-nums font-medium">{Number(row.quantidade).toLocaleString('pt-MZ')}</span>
    ),
  },
  {
    key: 'motivo',
    label: 'Motivo',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground truncate max-w-[200px] block">{row.motivo ?? '—'}</span>
    ),
  },
  {
    key: 'createdAt',
    label: 'Data',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm text-muted-foreground">
        {new Date(row.createdAt).toLocaleDateString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })}
      </span>
    ),
  },
];

async function MovimentacoesTableSection({ filtros, tenantId, userId }: { filtros: Filtro; tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarMovimentos({ cursor: filtros.cursor, take: filtros.take }, ctx)
  );

  return (
    <DataTable
      data={result.items}
      columns={columns}
      nextCursor={result.nextCursor}
      emptyState={
        <EmptyState
          title="Sem movimentações registadas"
          description="As movimentações de stock aparecerão aqui."
        />
      }
    />
  );
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
