/**
 * Listagem de Contratos de Serviço — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { FilterContratoServicoSchema } from '@/lib/validations/servicos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ContratosTable } from './_components/contratos-table';
import { TableSkeleton } from '../_components/table-skeletons';
import { KpiSkeleton } from '../_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroContratoUrlSchema = FilterContratoServicoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroContratoUrl = z.infer<typeof FiltroContratoUrlSchema>;

const FILTROS_DEFAULT: FiltroContratoUrl = {
  take: 25,
  orderBy: 'dataFim',
  orderDir: 'asc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

async function ContratosKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [todos, ativos, pausados, expirandoBreve] = await Promise.all([
    runWithTenantContext(ctx, () =>
      servicoService.listarContratos({ take: 1000, orderBy: 'dataFim', orderDir: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      servicoService.listarContratos({ status: 'ATIVO', take: 1000, orderBy: 'dataFim', orderDir: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      servicoService.listarContratos({ status: 'PAUSADO', take: 1000, orderBy: 'dataFim', orderDir: 'asc' }, ctx)
    ),
    runWithTenantContext(ctx, () =>
      servicoService.listarContratos({ expirandoEm: 30, take: 1000, orderBy: 'dataFim', orderDir: 'asc' }, ctx)
    ),
  ]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de contratos"
        value={String(todos.items.length)}
        icon={<FileText className="h-5 w-5" />}
      />
      <KpiCard
        title="Activos"
        value={String(ativos.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Pausados"
        value={String(pausados.items.length)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="A expirar (30 dias)"
        value={String(expirandoBreve.items.length)}
        icon={<AlertCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function ContratosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroContratoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const { status, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext(ctx, () =>
    servicoService.listarContratos({ status, cursor, take, orderBy, orderDir }, ctx)
  );

  return (
    <ContratosTable
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
      { label: 'Activo', value: 'ATIVO' },
      { label: 'Pausado', value: 'PAUSADO' },
      { label: 'Encerrado', value: 'ENCERRADO' },
      { label: 'Cancelado', value: 'CANCELADO' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContratosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroContratoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Contratos de Serviço"
        description="Contratos de manutenção, suporte e serviços recorrentes"
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos/lista' },
          { label: 'Contratos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/servicos/contratos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Contrato
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ContratosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por código ou cliente…"
        searchKey="termo"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <ContratosTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
