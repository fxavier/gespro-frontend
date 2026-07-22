/**
 * Listagem de Clientes — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard:
 * - Schema de filtros derivado de FilterClienteSchema
 * - safeParse com defaults (nunca .parse — evita 500 em URL inválido)
 * - Dados carregados directamente do serviço (nunca fetch à API própria)
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Users, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { FilterClienteSchema } from '@/lib/validations/clientes';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ClientesTable } from './_components/clientes-table';
import { TableSkeleton, KpiSkeleton } from './_components/table-skeletons';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroClienteUrlSchema = FilterClienteSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.enum(['nome', 'createdAt', 'categoria', 'creditoUtilizadoMT']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

type FiltroClienteUrl = z.infer<typeof FiltroClienteUrlSchema>;

const FILTROS_DEFAULT: FiltroClienteUrl = {
  take: 25,
  orderBy: 'createdAt',
  order: 'desc',
};

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function ClientesKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const resultado = await runWithTenantContext({ tenantId, userId }, () =>
    clienteService.listar({ take: 100, orderBy: 'createdAt', order: 'desc' }, { tenantId, userId })
  );

  // Contagens simples a partir dos primeiros 100 registos (proxy; substituir por contarPorStatus no futuro)
  const total = resultado.items.length;
  const ativos = resultado.items.filter((c) => c.status === 'ATIVO').length;
  const inativos = resultado.items.filter((c) => c.status !== 'ATIVO').length;
  const vips = resultado.items.filter((c) => c.categoria === 'VIP').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Clientes"
        value={String(total)}
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Clientes Activos"
        value={String(ativos)}
        icon={<UserCheck className="h-5 w-5" />}
      />
      <KpiCard
        title="Clientes Inactivos"
        value={String(inativos)}
        icon={<UserX className="h-5 w-5" />}
      />
      <KpiCard
        title="Clientes VIP"
        value={String(vips)}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

// ─── Tabela ────────────────────────────────────────────────────────────────────

async function ClientesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroClienteUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    clienteService.listar(
      {
        q: filtros.q,
        tipo: filtros.tipo,
        status: filtros.status,
        categoria: filtros.categoria,
        segmento: filtros.segmento,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      { tenantId, userId }
    )
  );

  return (
    <ClientesTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Pessoa Física', value: 'FISICA' },
      { label: 'Pessoa Jurídica', value: 'JURIDICA' },
      { label: 'Revendedor', value: 'REVENDEDOR' },
    ],
  },
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Activo', value: 'ATIVO' },
      { label: 'Inactivo', value: 'INATIVO' },
      { label: 'Suspenso', value: 'SUSPENSO' },
    ],
  },
  {
    key: 'categoria',
    label: 'Categoria',
    placeholder: 'Todas',
    options: [
      { label: 'VIP', value: 'VIP' },
      { label: 'Regular', value: 'REGULAR' },
      { label: 'Novo', value: 'NOVO' },
    ],
  },
];

// ─── Página ───────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroClienteUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Clientes"
        description="Gerencie os clientes da empresa com todos os detalhes comerciais"
        breadcrumbs={[{ label: 'Clientes' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/clientes/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ClientesKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por nome, NUIT, email ou código…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <ClientesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
