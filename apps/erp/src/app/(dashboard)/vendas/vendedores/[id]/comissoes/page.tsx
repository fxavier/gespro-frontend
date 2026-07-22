/**
 * Comissões de um Vendedor — Server Component.
 * Filtra as comissões pelo vendedorId extraído do URL.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, DollarSign, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comissaoService } from '@/server/services/comercial/index';
import { FilterComissaoSchema } from '@/lib/validations/vendas';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Skeleton } from '@/components/ui/skeleton';
import { ComissoesTable } from '../../../comissoes/_components/comissoes-table';

const FiltroUrlSchema = FilterComissaoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
});

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Aprovada', value: 'APROVADA' },
      { label: 'Paga', value: 'PAGA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

async function KpisVendedor({ vendedorId, tenantId, userId }: { vendedorId: string; tenantId: string; userId: string }) {
  const resultado = await runWithTenantContext({ tenantId, userId }, () =>
    comissaoService.listar({ vendedorId, take: 100, orderBy: 'createdAt', order: 'desc' }, { tenantId, userId })
  );

  const total = resultado.items.length;
  const pendentes = resultado.items.filter((c) => c.status === 'PENDENTE').length;
  const pagas = resultado.items.filter((c) => c.status === 'PAGA').length;
  const valorTotal = resultado.items.reduce((acc, c) => acc + parseFloat(c.valorComissao), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total" value={String(total)} icon={<DollarSign className="h-5 w-5" />} />
      <KpiCard title="Pendentes" value={String(pendentes)} icon={<Clock className="h-5 w-5" />} />
      <KpiCard title="Pagas" value={String(pagas)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard
        title="Valor Total"
        value={`MT ${valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

async function TabelaComissoes({ vendedorId, filtros, tenantId, userId }: { vendedorId: string; filtros: z.infer<typeof FiltroUrlSchema>; tenantId: string; userId: string }) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    comissaoService.listar(
      { vendedorId, cursor: filtros.cursor, take: filtros.take, status: filtros.status, orderBy: filtros.orderBy, order: filtros.order },
      { tenantId, userId }
    )
  );

  return (
    <ComissoesTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
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
          {[1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

export default async function VendedorComissoesPage({ params, searchParams }: PageProps) {
  const { id: vendedorId } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : { take: 25, orderBy: 'createdAt' as const, order: 'desc' as const };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Comissões do Vendedor"
        description={`Registo de comissões para o vendedor ${vendedorId.slice(-8)}`}
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Vendedores', href: '/vendas/vendedores' },
          { label: 'Comissões' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/comissoes/regras/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Regra
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <KpisVendedor vendedorId={vendedorId} tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar comissões…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <TabelaComissoes vendedorId={vendedorId} filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
