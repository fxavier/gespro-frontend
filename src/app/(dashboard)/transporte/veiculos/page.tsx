/**
 * Listagem de Viaturas — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard:
 * - FilterBar sincronizada com URL (q, estado, tipoViatura)
 * - DataTable cursor-paginada
 * - KPIs via contagens reais
 * - Suspense por secção
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Truck, CheckCircle, Activity, Wrench } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { viaturaService } from '@/server/services/operacoes/viatura.service';
import { FiltrarViaturasSchema } from '@/lib/validations/transporte';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ViaturasTable } from './_components/viaturas-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroViaturaUrlSchema = FiltrarViaturasSchema.extend({
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroViaturaUrl = z.infer<typeof FiltroViaturaUrlSchema>;

const FILTROS_DEFAULT: FiltroViaturaUrl = {
  take: 25,
  orderBy: 'createdAt',
  order: 'desc',
};

// ─── KPIs ──────────��──────────────────────────────────────────────────────────

async function ViaturasKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    viaturaService.listarViaturas({ take: 200, orderBy: 'createdAt', order: 'desc' }, ctx)
  );

  const items = result.items;
  const total = items.length;
  const disponiveis = items.filter((v) => v.estado === 'DISPONIVEL').length;
  const emActividade = items.filter((v) => v.estado === 'EM_ACTIVIDADE').length;
  const emManutencao = items.filter((v) => v.estado === 'EM_MANUTENCAO').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total de Viaturas" value={String(total)} icon={<Truck className="h-5 w-5" />} />
      <KpiCard title="Disponíveis" value={String(disponiveis)} icon={<CheckCircle className="h-5 w-5" />} />
      <KpiCard title="Em Actividade" value={String(emActividade)} icon={<Activity className="h-5 w-5" />} />
      <KpiCard title="Em Manutenção" value={String(emManutencao)} icon={<Wrench className="h-5 w-5" />} />
    </div>
  );
}

// ─── Tabela ─────────────��──────────────────────────────────────────────────────

async function ViaturasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroViaturaUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    viaturaService.listarViaturas(
      {
        estado: filtros.estado,
        tipoViatura: filtros.tipoViatura,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  return (
    <ViaturasTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

// ─── Configuração FilterBar ───────────────��────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'estado',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Disponível', value: 'DISPONIVEL' },
      { label: 'Em Actividade', value: 'EM_ACTIVIDADE' },
      { label: 'Em Manutenção', value: 'EM_MANUTENCAO' },
      { label: 'Inactiva', value: 'INACTIVA' },
      { label: 'Abatida', value: 'ABATIDA' },
    ],
  },
  {
    key: 'tipoViatura',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Lig. Passageiros', value: 'LIGEIRO_PASSAGEIROS' },
      { label: 'Lig. Mercadorias', value: 'LIGEIRO_MERCADORIAS' },
      { label: 'Pes. Mercadorias', value: 'PESADO_MERCADORIAS' },
      { label: 'Pes. Passageiros', value: 'PESADO_PASSAGEIROS' },
      { label: 'Motociclo', value: 'MOTOCICLO' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

// ─── Página principal — Server Component ──────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ViaturasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroViaturaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Gestão de Viaturas"
        description="Cadastro e controlo da frota de viaturas"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Viaturas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/veiculos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Viatura
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <ViaturasKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por matrícula, marca ou modelo…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <ViaturasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
