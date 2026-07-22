/**
 * Listagem de Atividades — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard: filtros em searchParams, DataTable paginada, KPIs.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Activity, Clock, CheckCircle, XCircle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { atividadeService } from '@/server/services/operacoes/atividade.service';
import { FiltrarAtividadesSchema } from '@/lib/validations/transporte';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { AtividadesTable } from './_components/atividades-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─── Schema URL ───────────────────────────────────────────────────────────────

const FiltroAtividadeUrlSchema = FiltrarAtividadesSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroAtividadeUrl = z.infer<typeof FiltroAtividadeUrlSchema>;

const FILTROS_DEFAULT: FiltroAtividadeUrl = {
  take: 25,
  orderBy: 'dataInicioPrevista',
  order: 'desc',
};

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function AtividadesKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    atividadeService.listarAtividades({ take: 200, orderBy: 'createdAt', order: 'desc' }, ctx)
  );

  const items = result.items;
  const total = items.length;
  const planeadas = items.filter((a) => a.estado === 'PLANEADA').length;
  const emCurso = items.filter((a) => a.estado === 'EM_CURSO').length;
  const concluidas = items.filter((a) => a.estado === 'CONCLUIDA').length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard title="Total de Atividades" value={String(total)} icon={<Activity className="h-5 w-5" />} />
      <KpiCard title="Planeadas" value={String(planeadas)} icon={<Clock className="h-5 w-5" />} />
      <KpiCard title="Em Curso" value={String(emCurso)} icon={<Activity className="h-5 w-5" />} />
      <KpiCard title="Concluídas" value={String(concluidas)} icon={<CheckCircle className="h-5 w-5" />} />
    </div>
  );
}

// ─── Tabela ───────────────────────────────────────────────────────────────────

async function AtividadesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroAtividadeUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext(ctx, () =>
    atividadeService.listarAtividades(
      {
        estado: filtros.estado,
        tipoActividade: filtros.tipoActividade,
        prioridade: filtros.prioridade,
        cursor: filtros.cursor,
        take: filtros.take,
        orderBy: filtros.orderBy,
        order: filtros.order,
      },
      ctx
    )
  );

  return (
    <AtividadesTable
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
    key: 'estado',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Planeada', value: 'PLANEADA' },
      { label: 'Em Curso', value: 'EM_CURSO' },
      { label: 'Suspensa', value: 'SUSPENSA' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    placeholder: 'Todas',
    options: [
      { label: 'Baixa', value: 'BAIXA' },
      { label: 'Média', value: 'MEDIA' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Urgente', value: 'URGENTE' },
    ],
  },
  {
    key: 'tipoActividade',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Deslocação', value: 'DESLOCACAO' },
      { label: 'Missão de Serviço', value: 'MISSAO_SERVICO' },
      { label: 'Transporte de Mercadorias', value: 'TRANSPORTE_MERCADORIAS' },
      { label: 'Transporte de Pessoal', value: 'TRANSPORTE_PESSOAL' },
      { label: 'Manutenção em Campo', value: 'MANUTENCAO_CAMPO' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

// ─── Página principal — Server Component ──────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AtividadesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroAtividadeUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Atividades de Transporte"
        description="Gestão de atividades de transporte e logística"
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Atividades' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/transporte/atividades/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Atividade
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton count={4} />}>
        <AtividadesKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por título ou código…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={8} />}
      >
        <AtividadesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
