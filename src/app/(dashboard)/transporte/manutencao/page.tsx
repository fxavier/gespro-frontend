/**
 * Listagem de Manutenções — Server Component (NUNCA 'use client').
 *
 * Não existe listarManutencoes no serviço — usamos prismaBase directamente
 * (sem RLS, mas com where tenantId para isolamento).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Wrench, Calendar, DollarSign, AlertTriangle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prismaBase } from '@/server/db/client';
import { TipoManutencaoViatura } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ManutencaoTable } from './_components/manutencao-table';
import type { ManutencaoComViatura } from './_components/manutencao-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

const FiltroManutencaoUrlSchema = z.object({
  tipo: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.enum(['data', 'createdAt']).default('data'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

type FiltroManutencaoUrl = z.infer<typeof FiltroManutencaoUrlSchema>;

const FILTROS_DEFAULT: FiltroManutencaoUrl = {
  take: 25,
  orderBy: 'data',
  order: 'desc',
};

async function ManutencaoKpis({ tenantId }: { tenantId: string }) {
  const manutencoes = await prismaBase.manutencaoViatura.findMany({
    where: { tenantId },
    select: {
      id: true,
      tipo: true,
      custo: true,
      proximaManutencaoData: true,
    },
    orderBy: { data: 'desc' },
    take: 500,
  });

  const total = manutencoes.length;
  const preventivas = manutencoes.filter((m) => m.tipo === TipoManutencaoViatura.PREVENTIVA).length;
  const corretivas = manutencoes.filter((m) => m.tipo === TipoManutencaoViatura.CORRECTIVA).length;
  const custoTotal = manutencoes.reduce(
    (sum, m) => sum + (m.custo ? parseFloat(m.custo.toString()) : 0),
    0
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total de Intervenções" value={String(total)} icon={<Wrench className="h-5 w-5" />} />
      <KpiCard title="Preventivas" value={String(preventivas)} icon={<Calendar className="h-5 w-5" />} />
      <KpiCard title="Correctivas" value={String(corretivas)} icon={<AlertTriangle className="h-5 w-5" />} />
      <KpiCard
        title="Custo Total"
        value={`MZN ${custoTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
        icon={<DollarSign className="h-5 w-5" />}
      />
    </div>
  );
}

async function ManutencaoTableSection({
  filtros,
  tenantId,
}: {
  filtros: FiltroManutencaoUrl;
  tenantId: string;
}) {
  const tipoFiltro = filtros.tipo as TipoManutencaoViatura | undefined;

  const take = filtros.take + 1;
  const cursor = filtros.cursor ? { id: filtros.cursor } : undefined;

  const rows = await prismaBase.manutencaoViatura.findMany({
    where: {
      tenantId,
      ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
    },
    select: {
      id: true,
      viaturaId: true,
      tipo: true,
      data: true,
      quilometragem: true,
      descricao: true,
      custo: true,
      proximaManutencaoData: true,
      viatura: { select: { matricula: true } },
    },
    orderBy: { [filtros.orderBy]: filtros.order },
    take,
    ...(cursor ? { skip: 1, cursor } : {}),
  });

  const hasMore = rows.length > filtros.take;
  const items = hasMore ? rows.slice(0, filtros.take) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  const data: ManutencaoComViatura[] = items.map((m) => ({
    id: m.id,
    viaturaId: m.viaturaId,
    viaturaMatricula: m.viatura.matricula,
    tipo: m.tipo,
    data: m.data,
    quilometragem: m.quilometragem,
    descricao: m.descricao,
    custo: m.custo ? m.custo.toString() : null,
    proximaManutencaoData: m.proximaManutencaoData,
  }));

  return (
    <ManutencaoTable
      data={data}
      nextCursor={nextCursor}
      currentOrderBy={filtros.orderBy}
      currentOrderDir={filtros.order}
    />
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Preventiva', value: 'PREVENTIVA' },
      { label: 'Correctiva', value: 'CORRECTIVA' },
      { label: 'Revisão', value: 'REVISAO' },
      { label: 'Inspecção', value: 'INSPECAO' },
      { label: 'Pneus', value: 'PNEUS' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ManutencaoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroManutencaoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Manutenção de Viaturas"
        description="Registo e controlo de intervenções de manutenção"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Manutenção' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/veiculos">
              <Plus className="h-4 w-4 mr-2" />
              Seleccionar Viatura
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <ManutencaoKpis tenantId={tenantId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por viatura ou descrição…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <ManutencaoTableSection filtros={filtros} tenantId={tenantId} />
      </Suspense>
    </div>
  );
}
