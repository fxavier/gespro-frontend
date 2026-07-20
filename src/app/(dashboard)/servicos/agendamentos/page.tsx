/**
 * Listagem de Agendamentos de Serviço — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard (replica requisicoes):
 * - Schema de filtros via FilterAgendamentoServicoSchema (lib/validations)
 * - safeParse com defaults
 * - Dados carregados directamente do serviço
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Calendar, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { FilterAgendamentoServicoSchema } from '@/lib/validations/servicos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { AgendamentosTable } from '../_components/agendamentos-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroAgendamentoUrlSchema = FilterAgendamentoServicoSchema.omit({
  dataInicio: true,
  dataFim: true,
}).extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroAgendamentoUrl = z.infer<typeof FiltroAgendamentoUrlSchema>;

const FILTROS_DEFAULT: FiltroAgendamentoUrl = {
  take: 25,
  orderBy: 'dataAgendamento',
  orderDir: 'asc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function AgendamentosKpis({
  tenantId,
  userId,
}: {
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const [todos, pendentes, confirmados, concluidos] = await Promise.all([
    runWithTenantContext(ctx, () =>
      servicoService.listarAgendamentos(
        { take: 1000, orderBy: 'dataAgendamento', orderDir: 'asc' },
        ctx,
      )
    ),
    runWithTenantContext(ctx, () =>
      servicoService.listarAgendamentos(
        { status: 'PENDENTE', take: 1000, orderBy: 'dataAgendamento', orderDir: 'asc' },
        ctx,
      )
    ),
    runWithTenantContext(ctx, () =>
      servicoService.listarAgendamentos(
        { status: 'CONFIRMADO', take: 1000, orderBy: 'dataAgendamento', orderDir: 'asc' },
        ctx,
      )
    ),
    runWithTenantContext(ctx, () =>
      servicoService.listarAgendamentos(
        { status: 'CONCLUIDO', take: 1000, orderBy: 'dataAgendamento', orderDir: 'asc' },
        ctx,
      )
    ),
  ]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Agendamentos"
        value={String(todos.items.length)}
        icon={<Calendar className="h-5 w-5" />}
      />
      <KpiCard
        title="Pendentes"
        value={String(pendentes.items.length)}
        icon={<AlertCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Confirmados"
        value={String(confirmados.items.length)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Concluídos"
        value={String(concluidos.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function AgendamentosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroAgendamentoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const { status, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext(ctx, () =>
    servicoService.listarAgendamentos(
      { status, cursor, take, orderBy, orderDir },
      ctx,
    )
  );

  return (
    <AgendamentosTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={orderBy}
      currentOrderDir={orderDir}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuração da FilterBar
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Confirmado', value: 'CONFIRMADO' },
      { label: 'Em Andamento', value: 'EM_ANDAMENTO' },
      { label: 'Concluído', value: 'CONCLUIDO' },
      { label: 'Cancelado', value: 'CANCELADO' },
      { label: 'Não Compareceu', value: 'NAO_COMPARECEU' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgendamentosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroAgendamentoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Agendamentos"
        description="Gestão de agendamentos e compromissos de serviços"
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos/lista' },
          { label: 'Agendamentos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/servicos/agendamentos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Agendamento
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <Suspense fallback={<KpiSkeleton />}>
        <AgendamentosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* FilterBar */}
      <FilterBar
        searchPlaceholder="Pesquisar por serviço, cliente ou código…"
        searchKey="termo"
        filters={FILTER_CONFIGS}
      />

      {/* Tabela */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <AgendamentosTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
