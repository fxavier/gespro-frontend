/**
 * Listagem de Colaboradores — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard:
 * - searchParams → safeParse com FilterColaboradorSchema
 * - Dados carregados directamente do serviço
 * - Suspense por secção (KPIs + tabela)
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Users, UserCheck, UserX, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';
import { FilterColaboradorSchema } from '@/lib/validations/rh';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ColaboradoresTable } from './_components/colaboradores-table';
import { KpiSkeleton, TableSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe: deriva de FilterColaboradorSchema com coerção de strings
// ─────────────────────────────────────────────────────────────────────────────

const FiltroColaboradorUrlSchema = FilterColaboradorSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  search: z.string().optional(),
});

type FiltroColaboradorUrl = z.infer<typeof FiltroColaboradorUrlSchema>;

const FILTROS_DEFAULT: FiltroColaboradorUrl = {
  take: 25,
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function ColaboradoresKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  // Contar por status em paralelo
  const [total, activos, inactivos, periodoExp] = await runWithTenantContext(ctx, async () => {
    const [all, act, inact, exp] = await Promise.all([
      ColaboradorService.listar({ take: 1 }, ctx),
      ColaboradorService.listar({ take: 1, status: 'ACTIVO' }, ctx),
      ColaboradorService.listar({ take: 1, status: 'INACTIVO' }, ctx),
      ColaboradorService.listar({ take: 1, status: 'PERIODO_EXPERIMENTAL' }, ctx),
    ]);
    return [all, act, inact, exp];
  });

  // Usar total de registos a partir do count — aqui apenas mostramos os items carregados
  // (paginação cursor-based não tem count total; mostramos contagens por status)
  void total;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Colaboradores Activos"
        value={String(activos.items.length)}
        icon={<UserCheck className="h-5 w-5" />}
        description="Estado activo"
      />
      <KpiCard
        title="Inactivos"
        value={String(inactivos.items.length)}
        icon={<UserX className="h-5 w-5" />}
      />
      <KpiCard
        title="Período Experimental"
        value={String(periodoExp.items.length)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Total Carregado"
        value={String(activos.items.length + inactivos.items.length + periodoExp.items.length)}
        icon={<Users className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function ColaboradoresTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroColaboradorUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const result = await runWithTenantContext(ctx, () =>
    ColaboradorService.listar(
      {
        search: filtros.search,
        status: filtros.status,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx
    )
  );

  return (
    <ColaboradoresTable
      data={result.items}
      nextCursor={result.nextCursor}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuração FilterBar
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Activo', value: 'ACTIVO' },
      { label: 'Inactivo', value: 'INACTIVO' },
      { label: 'Férias', value: 'FERIAS' },
      { label: 'Afastado', value: 'AFASTADO' },
      { label: 'Período Experimental', value: 'PERIODO_EXPERIMENTAL' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ColaboradoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroColaboradorUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Colaboradores"
        description="Gerir os colaboradores da empresa"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Colaboradores' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/rh/colaboradores/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Colaborador
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ColaboradoresKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por nome ou código…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={5} />}
      >
        <ColaboradoresTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
