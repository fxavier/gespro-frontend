/**
 * Listagem de Motoristas — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard: filtros em searchParams, DataTable paginada, KPIs.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, User, UserCheck, UserX } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { motoristaService } from '@/server/services/operacoes/motorista.service';
import { FiltrarMotoristasSchema } from '@/lib/validations/transporte';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { MotoristasTable } from './_components/motoristas-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroMotoristaUrlSchema = FiltrarMotoristasSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroMotoristaUrl = z.infer<typeof FiltroMotoristaUrlSchema>;

const FILTROS_DEFAULT: FiltroMotoristaUrl = {
  take: 25,
  orderBy: 'nomeCompleto',
  order: 'asc',
};

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function MotoristasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    motoristaService.listarMotoristas({ take: 200, orderBy: 'nomeCompleto', order: 'asc' }, ctx)
  );

  const items = result.items;
  const total = items.length;
  const activos = items.filter((m) => m.estadoOperacional === 'ACTIVO').length;
  const inactivos = items.filter((m) => m.estadoOperacional === 'INACTIVO').length;
  const suspensos = items.filter((m) => m.estadoOperacional === 'SUSPENSO').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total de Motoristas" value={String(total)} icon={<User className="h-5 w-5" />} />
      <KpiCard title="Activos" value={String(activos)} icon={<UserCheck className="h-5 w-5" />} />
      <KpiCard title="Inactivos" value={String(inactivos)} icon={<UserX className="h-5 w-5" />} />
      <KpiCard title="Suspensos" value={String(suspensos)} icon={<UserX className="h-5 w-5" />} />
    </div>
  );
}

// ─── Tabela ───────────────────────────────────────────────────────────────────

async function MotoristasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroMotoristaUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    motoristaService.listarMotoristas(
      {
        estadoOperacional: filtros.estadoOperacional,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  return (
    <MotoristasTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

// ─── Configuração FilterBar ───────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'estadoOperacional',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Activo', value: 'ACTIVO' },
      { label: 'Inactivo', value: 'INACTIVO' },
      { label: 'Suspenso', value: 'SUSPENSO' },
    ],
  },
];

// ─── Página principal — Server Component ──────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MotoristasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroMotoristaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Gestão de Motoristas"
        description="Cadastro e gestão da equipa de motoristas"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Motoristas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/motoristas/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Motorista
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <MotoristasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por nome ou número de carta…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={6} />}
      >
        <MotoristasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
