/**
 * Assiduidade — Server Component (NUNCA 'use client').
 * Lista registos de assiduidade com DataTable + FilterBar.
 * Leitura via AssiduidadeService (sem prisma cru).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { AssiduidadeService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  FilterBar,
  TableSkeleton,
  KpiCard,
} from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { AssiduidadeTable } from './_components/assiduidade-table';
import type { AssiduidadeRow } from './_components/assiduidade-table';

const FiltroUrlSchema = z.object({
  colaboradorId: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function AssiduidadeKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const hoje = new Date();
  const inicioPeriodo = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [totalMes, normais, ausencias] = await runWithTenantContext(ctx, () =>
    Promise.all([
      prisma.registoAssiduidade.count({
        where: { tenantId, data: { gte: inicioPeriodo } },
      }),
      prisma.registoAssiduidade.count({
        where: { tenantId, tipo: 'NORMAL', data: { gte: inicioPeriodo } },
      }),
      prisma.registoAssiduidade.count({
        where: { tenantId, tipo: 'AUSENCIA', data: { gte: inicioPeriodo } },
      }),
    ])
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard title="Registos este mês" value={String(totalMes)} icon={<Clock className="h-4 w-4" />} />
      <KpiCard title="Presenças" value={String(normais)} icon={<Clock className="h-4 w-4" />} />
      <KpiCard title="Ausências" value={String(ausencias)} icon={<Clock className="h-4 w-4" />} />
    </div>
  );
}

async function AssiduidadeTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const result = await runWithTenantContext(ctx, () =>
    AssiduidadeService.listar(
      {
        colaboradorId: filtros.colaboradorId,
        tipo: filtros.tipo as never,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const fmt = (d: Date) => d.toLocaleDateString('pt-PT');
  const fmtTime = (d: Date) => d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  const data: AssiduidadeRow[] = result.items.map((r) => ({
    id: r.id,
    colaboradorNome: r.colaborador.nome,
    data: fmt(r.data),
    entrada: fmtTime(r.entrada),
    saida: fmtTime(r.saida),
    horasTrabalhadas: Number(r.horasTrabalhadas).toFixed(1),
    horasExtras: Number(r.horasExtras).toFixed(1),
    tipo: r.tipo,
  }));

  return <AssiduidadeTable data={data} nextCursor={result.nextCursor ?? undefined} />;
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

export default async function AssiduidadePage({
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
        title="Assiduidade"
        description="Controlo de presenças e horários dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Assiduidade' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/rh/assiduidade/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Registar
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">{Array.from({length:3}).map((_,i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>}>
        <AssiduidadeKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={7} />}
      >
        <AssiduidadeTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
