/**
 * Listagem de Contas a Pagar — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { DollarSign, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contaPagarService } from '@/server/services/compras/conta-pagar.service';
import { FilterContaPagarSchema } from '@/lib/validations/compras';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ContasPagarTable } from './_components/contas-pagar-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroContaPagarUrlSchema = FilterContaPagarSchema.omit({
  dataVencimentoInicio: true,
  dataVencimentoFim: true,
}).extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroContaPagarUrl = z.infer<typeof FiltroContaPagarUrlSchema>;

const FILTROS_DEFAULT: FiltroContaPagarUrl = {
  take: 25,
  orderBy: 'dataVencimento',
  orderDir: 'asc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

async function ContasPagarKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [todas, pendentes, vencidas, liquidadas] = await Promise.all([
    runWithTenantContext(ctx, () =>
      contaPagarService.listar({ take: 1000, orderBy: 'dataVencimento', orderDir: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      contaPagarService.listar({ status: 'ABERTA', take: 1000, orderBy: 'dataVencimento', orderDir: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      contaPagarService.listar({ vencidas: true, take: 1000, orderBy: 'dataVencimento', orderDir: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      contaPagarService.listar({ status: 'PAGA', take: 1000, orderBy: 'dataVencimento', orderDir: 'asc' }, ctx)
    ),
  ]);

  const totalPendente = pendentes.items.reduce((sum, c) => sum + c.valorRestante, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de contas"
        value={String(todas.items.length)}
        icon={<DollarSign className="h-5 w-5" />}
      />
      <KpiCard
        title="A pagar"
        value={`MT ${totalPendente.toLocaleString('pt-MZ', { maximumFractionDigits: 0 })}`}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Vencidas"
        value={String(vencidas.items.length)}
        icon={<AlertCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Liquidadas"
        value={String(liquidadas.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function ContasPagarTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroContaPagarUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const { status, vencidas, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext(ctx, () =>
    contaPagarService.listar({ status, vencidas, cursor, take, orderBy, orderDir }, ctx)
  );

  return (
    <ContasPagarTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={orderBy}
      currentOrderDir={orderDir}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Aberta', value: 'ABERTA' },
      { label: 'Parcialmente paga', value: 'PARCIALMENTE_PAGA' },
      { label: 'Paga', value: 'PAGA' },
      { label: 'Cancelada', value: 'CANCELADA' },
      { label: 'Vencida', value: 'VENCIDA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContasPagarPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroContaPagarUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Contas a Pagar"
        description="Gestão de obrigações financeiras com fornecedores"
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: 'Contas a Pagar' },
        ]}
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ContasPagarKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número ou fornecedor…"
        searchKey="termo"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <ContasPagarTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
