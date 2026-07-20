/**
 * Planeamento da Produção — Server Component (NUNCA 'use client').
 * Mostra ordens em planeamento e necessidades de materiais com dados reais.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, AlertTriangle, Factory, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  FilterBar,
  TableSkeleton,
  KpiCard,
} from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { PlaneamentoTable } from './_components/planeamento-table';
import type { OrdemRow } from './_components/planeamento-table';

const FiltroUrlSchema = z.object({
  status: z.string().optional(),
  prioridade: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function PlaneamentoKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [emPlaneamento, urgentes, atrasadas] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.ordemProducao.count({ where: { tenantId, status: 'PLANEADA' } }),
      prisma.ordemProducao.count({ where: { tenantId, prioridade: 'URGENTE', status: { notIn: ['CONCLUIDA', 'CANCELADA'] } } }),
      prisma.ordemProducao.count({
        where: {
          tenantId,
          status: { notIn: ['CONCLUIDA', 'CANCELADA'] },
          dataPrevisaoFim: { lt: new Date() },
        },
      }),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard title="Em Planeamento" value={String(emPlaneamento)} icon={<Clock className="h-4 w-4" />} />
      <KpiCard title="Urgentes" value={String(urgentes)} icon={<AlertTriangle className="h-4 w-4" />} />
      <KpiCard title="Atrasadas" value={String(atrasadas)} icon={<Factory className="h-4 w-4" />} />
    </div>
  );
}

async function PlaneamentoTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const rows = await runWithTenantContext(ctx, () =>
    prisma.ordemProducao.findMany({
      where: {
        tenantId,
        status: { in: ['PLANEADA', 'LIBERADA'] as const },
        ...(filtros.prioridade ? { prioridade: filtros.prioridade as never } : {}),
      },
      select: {
        id: true,
        numero: true,
        nomeProduto: true,
        quantidade: true,
        unidadeMedida: true,
        prioridade: true,
        status: true,
        dataPrevisaoInicio: true,
        dataPrevisaoFim: true,
      },
      orderBy: [{ prioridade: 'desc' }, { dataPrevisaoFim: 'asc' }],
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: OrdemRow[] = rows.map((o) => ({
    id: o.id,
    numero: o.numero,
    nomeProduto: o.nomeProduto,
    quantidade: Number(o.quantidade),
    unidadeMedida: o.unidadeMedida,
    prioridade: o.prioridade,
    status: o.status,
    dataPrevisaoInicio: o.dataPrevisaoInicio,
    dataPrevisaoFim: o.dataPrevisaoFim,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <PlaneamentoTable data={data} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'prioridade',
    label: 'Prioridade',
    options: [
      { label: 'Urgente', value: 'URGENTE' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Média', value: 'MEDIA' },
      { label: 'Baixa', value: 'BAIXA' },
    ],
  },
];

export default async function PlaneamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === 'string') flatParams[k] = v;
    else if (Array.isArray(v)) flatParams[k] = v[0] ?? '';
  }

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Planeamento da Produção"
        description="Ordens planeadas e aguardando materiais"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Planeamento' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/producao/ordens/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Ordem
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <PlaneamentoKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={7} />}
      >
        <PlaneamentoTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
