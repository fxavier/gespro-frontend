/**
 * Faturas — Server Component.
 * Listagem de faturas com filtros por estado e pesquisa.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, FileText, CheckCircle, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  listarFaturas,
} from '@/server/services/financas/faturacao.service';
import { FiltroFaturaSchema } from '@/lib/validations/faturacao';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import { FaturasTable, type FaturaRow } from './_components/faturas-table';

const FiltroUrlSchema = FiltroFaturaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().optional(),
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
      { label: 'Paga', value: 'PAGA' },
      { label: 'Parcialmente Paga', value: 'PARCIALMENTE_PAGA' },
      { label: 'Vencida', value: 'VENCIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

async function FaturasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  // ponytail: uma query com take:100 — suficiente para KPIs; adicionar count() se escala exigir
  const resultado = await runWithTenantContext(ctx, () => listarFaturas({ take: 100 }, ctx));

  const pagas = resultado.items.filter((f) => f.status === 'PAGA').length;
  const emitidas = resultado.items.filter((f) => f.status === 'EMITIDA').length;
  const vencidas = resultado.items.filter((f) => f.status === 'VENCIDA').length;
  const totalMT = resultado.items.reduce((acc, f) => acc + parseFloat(f.total.toString()), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Volume Faturado"
        value={`MT ${totalMT.toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <KpiCard title="Pagas" value={String(pagas)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard title="Emitidas" value={String(emitidas)} icon={<Clock className="h-5 w-5" />} />
      <KpiCard title="Vencidas" value={String(vencidas)} icon={<AlertCircle className="h-5 w-5" />} />
    </div>
  );
}

async function FaturasTableSection({
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
    listarFaturas(
      {
        status: filtros.status,
        search: filtros.search,
        cursor: filtros.cursor,
        take: filtros.take,
        clienteId: filtros.clienteId,
        dataEmissaoInicio: filtros.dataEmissaoInicio,
        dataEmissaoFim: filtros.dataEmissaoFim,
        dataVencimentoInicio: filtros.dataVencimentoInicio,
        dataVencimentoFim: filtros.dataVencimentoFim,
      },
      ctx
    )
  );

  // Serializar Prisma.Decimal → string e Date → ISO string
  const rows: FaturaRow[] = result.items.map((f) => ({
    id: f.id,
    numero: f.numero,
    clienteId: f.clienteId,
    status: f.status,
    dataEmissao: f.dataEmissao.toISOString(),
    dataVencimento: f.dataVencimento.toISOString(),
    total: f.total.toString(),
    ivaTotal: f.ivaTotal.toString(),
    subtotal: f.subtotal.toString(),
    moeda: f.moeda,
  }));

  return <FaturasTable data={rows} nextCursor={result.nextCursor} />;
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
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

export default async function FaturasPage({ searchParams }: PageProps) {
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
        title="Faturas"
        description="Emissão e gestão de faturas fiscais"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Faturas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/faturas/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Fatura
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <FaturasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <FaturasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
