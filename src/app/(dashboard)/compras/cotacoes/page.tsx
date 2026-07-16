/**
 * Listagem de Cotações de Compra — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Plus, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { FilterCotacaoSchema } from '@/lib/validations/compras';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { CotacoesTable } from './_components/cotacoes-table';
import { TableSkeleton, KpiSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroCotacaoUrlSchema = FilterCotacaoSchema.omit({
  dataInicio: true,
  dataFim: true,
}).extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroCotacaoUrl = z.infer<typeof FiltroCotacaoUrlSchema>;

const FILTROS_DEFAULT: FiltroCotacaoUrl = {
  take: 25,
  orderBy: 'createdAt',
  orderDir: 'desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

async function CotacoesKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [todas, emAberto, respondidas, adjudicadas] = await Promise.all([
    runWithTenantContext(ctx, () =>
      comprasService.listarCotacoes({ take: 1000, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      comprasService.listarCotacoes({ status: 'ENVIADA', take: 1000, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      comprasService.listarCotacoes({ status: 'RESPONDIDA', take: 1000, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      comprasService.listarCotacoes({ status: 'ADJUDICADA', take: 1000, orderBy: 'createdAt', orderDir: 'desc' }, ctx)
    ),
  ]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de cotações"
        value={String(todas.items.length)}
        icon={<FileText className="h-5 w-5" />}
      />
      <KpiCard
        title="Em aberto"
        value={String(emAberto.items.length)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Com resposta"
        value={String(respondidas.items.length)}
        icon={<AlertCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Adjudicadas"
        value={String(adjudicadas.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function CotacoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroCotacaoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const { status, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext(ctx, () =>
    comprasService.listarCotacoes({ status, cursor, take, orderBy, orderDir }, ctx)
  );

  return (
    <CotacoesTable
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
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Enviada', value: 'ENVIADA' },
      { label: 'Com resposta', value: 'RESPONDIDA' },
      { label: 'Vencida', value: 'VENCIDA' },
      { label: 'Adjudicada', value: 'ADJUDICADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
      { label: 'Expirada', value: 'EXPIRADA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CotacoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroCotacaoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cotações"
        description="Gestão de pedidos de cotação a fornecedores"
        breadcrumbs={[
          { label: 'Compras', href: '/compras' },
          { label: 'Cotações' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/compras/cotacoes/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Cotação
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <CotacoesKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número…"
        searchKey="termo"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={6} />}
      >
        <CotacoesTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
