/**
 * Mão de Obra — Server Component (NUNCA 'use client').
 * Lista registos de assiduidade e alocação a ordens de produção.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Users, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import {
  PageHeader,
  FilterBar,
  TableSkeleton,
  KpiCard,
} from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { MaoObraTable } from './_components/mao-obra-table';
import type { AssiduidadeRow } from './_components/mao-obra-table';

const FiltroUrlSchema = z.object({
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function MaoObraKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const [presencasHoje, totalColaboradores] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.registoAssiduidade.count({
        where: { tenantId, data: { gte: hoje, lt: amanha } },
      }),
      prisma.colaborador.count({
        where: { tenantId, status: 'ACTIVO' },
      }),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <KpiCard title="Presenças Hoje" value={String(presencasHoje)} icon={<Clock className="h-4 w-4" />} />
      <KpiCard title="Colaboradores Activos" value={String(totalColaboradores)} icon={<Users className="h-4 w-4" />} />
    </div>
  );
}

async function MaoObraTableSection({
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
    prisma.registoAssiduidade.findMany({
      where: {
        tenantId,
        ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
      },
      select: {
        id: true,
        data: true,
        tipo: true,
        horasTrabalhadas: true,
        horasExtras: true,
        atrasos: true,
        colaborador: { select: { nome: true } },
      },
      orderBy: { data: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: AssiduidadeRow[] = rows.map((r) => ({
    id: r.id,
    colaboradorNome: r.colaborador.nome,
    data: r.data,
    tipo: r.tipo,
    horasTrabalhadas: Number(r.horasTrabalhadas).toFixed(1),
    horasExtras: Number(r.horasExtras).toFixed(1),
    atrasos: r.atrasos,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <MaoObraTable data={data} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    options: [
      { label: 'Normal', value: 'NORMAL' },
      { label: 'Feriado', value: 'FERIADO' },
      { label: 'Fim de Semana', value: 'FIM_SEMANA' },
      { label: 'Férias', value: 'FERIAS' },
      { label: 'Ausência', value: 'AUSENCIA' },
    ],
  },
];

export default async function MaoObraPage({
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
        title="Mão de Obra"
        description="Registos de assiduidade e presença dos colaboradores"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Mão de Obra' },
        ]}
        actions={
          <Link
            href="/rh/assiduidade/novo"
            className="text-sm underline text-primary"
          >
            Registar Assiduidade
          </Link>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>}>
        <MaoObraKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <MaoObraTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
