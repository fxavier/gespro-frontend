/**
 * Listagem de Serviços — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard (replica requisicoes):
 * - Schema de filtros via FilterServicoSchema (lib/validations)
 * - safeParse com defaults
 * - Dados carregados directamente do serviço
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Wrench, CheckCircle, TrendingUp, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { FilterServicoSchema } from '@/lib/validations/servicos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ServicosTable } from '../_components/servicos-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroServicoUrlSchema = FilterServicoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroServicoUrl = z.infer<typeof FiltroServicoUrlSchema>;

const FILTROS_DEFAULT: FiltroServicoUrl = {
  take: 25,
  orderBy: 'nome',
  orderDir: 'asc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function ServicosKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [todos, ativos, disponiveis] = await Promise.all([
    runWithTenantContext({ tenantId, userId }, () =>
      servicoService.listarServicos({ take: 1000, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      servicoService.listarServicos({ ativo: true, take: 1000, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      servicoService.listarServicos({ disponivel: true, take: 1000, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
    ),
  ]);

  const totalVendas = todos.items.reduce((sum, s) => sum + s.totalVendas, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Serviços"
        value={String(todos.items.length)}
        icon={<Wrench className="h-5 w-5" />}
      />
      <KpiCard
        title="Serviços Activos"
        value={String(ativos.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Disponíveis"
        value={String(disponiveis.items.length)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Total de Vendas"
        value={String(totalVendas)}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function ServicosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroServicoUrl;
  tenantId: string;
  userId: string;
}) {
  const { tipoServico, ativo, disponivel, termo, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext({ tenantId, userId }, () =>
    servicoService.listarServicos(
      { tipoServico, ativo, disponivel, termo, cursor, take, orderBy, orderDir },
      { tenantId, userId }
    )
  );

  return (
    <ServicosTable
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
    key: 'tipoServico',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Instalação', value: 'INSTALACAO' },
      { label: 'Manutenção', value: 'MANUTENCAO' },
      { label: 'Reparação', value: 'REPARACAO' },
      { label: 'Consultoria', value: 'CONSULTORIA' },
      { label: 'Limpeza', value: 'LIMPEZA' },
      { label: 'Transporte', value: 'TRANSPORTE' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServicosListaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroServicoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Serviços"
        description="Gestão do catálogo de serviços e agendamentos"
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos/lista' },
          { label: 'Lista' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/servicos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Serviço
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <Suspense fallback={<KpiSkeleton />}>
        <ServicosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* FilterBar */}
      <FilterBar
        searchPlaceholder="Pesquisar por nome, código ou descrição…"
        searchKey="termo"
        filters={FILTER_CONFIGS}
      />

      {/* Tabela */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <ServicosTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
