/**
 * Listagem de Requisições de Compra — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard:
 * - Schema de filtros derivado de FilterRequisicaoCompraSchema (lib/validations)
 * - safeParse com defaults (nunca .parse — evita 500 em URL inválido)
 * - Dados carregados directamente do serviço (nunca fetch à API própria)
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL (q, status, prioridade)
 * - DataTable cursor-paginada
 * - KPIs via contarRequisicoesPorStatus (contagens reais, não take:1)
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ClipboardList, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { FilterRequisicaoCompraSchema } from '@/lib/validations/compras';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { RequisicoesTable } from './_components/requisicoes-table';
import { TableSkeleton, KpiSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe: deriva de FilterRequisicaoCompraSchema, sobrepõe `take` com
// coerção de string→número e relaxa `cursor` (sem cuid check para segurança).
// Usar sempre safeParse — URL inválido não deve causar 500.
// ─────────────────────────────────────────────────────────────────────────────

const FiltroRequisicaoUrlSchema = FilterRequisicaoCompraSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroRequisicaoUrl = z.infer<typeof FiltroRequisicaoUrlSchema>;

const FILTROS_DEFAULT: FiltroRequisicaoUrl = {
  take: 25,
  orderBy: 'createdAt',
  orderDir: 'desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos — Suspense independente da tabela
// ─────────────────────────────────────────────────────────────────────────────

async function RequisicoesKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const contagens = await runWithTenantContext({ tenantId, userId }, () =>
    comprasService.contarRequisicoesPorStatus({ tenantId, userId })
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Requisições"
        value={String(contagens.total)}
        icon={<ClipboardList className="h-5 w-5" />}
      />
      <KpiCard
        title="Pendentes de Aprovação"
        value={String(contagens.pendentes)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Aprovadas"
        value={String(contagens.aprovadas)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Valor Total em Processo"
        value={`MT ${contagens.valorTotalProcesso.toLocaleString('pt-MZ', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona — Suspense com key nos filtros (re-suspende ao filtrar)
// ─────────────────────────────────────────────────────────────────────────────

async function RequisicoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroRequisicaoUrl;
  tenantId: string;
  userId: string;
}) {
  const { status, prioridade, q, departamento, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext({ tenantId, userId }, () =>
    comprasService.listarRequisicoes(
      { status, prioridade, q, departamento, cursor, take, orderBy, orderDir },
      { tenantId, userId }
    )
  );

  return (
    <RequisicoesTable
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
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Em Aprovação', value: 'EM_APROVACAO' },
      { label: 'Aprovada', value: 'APROVADA' },
      { label: 'Rejeitada', value: 'REJEITADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
      { label: 'Convertida', value: 'CONVERTIDA' },
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
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RequisicoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  // Aplanar searchParams (array de valores → primeiro valor) e fazer safeParse
  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  // safeParse: URL inválido usa defaults em vez de lançar 500
  const parseResult = FiltroRequisicaoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Requisições de Compra"
        description="Faça a gestão das solicitações de compra da empresa"
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Requisições' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/compras/requisicoes/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Requisição
            </Link>
          </Button>
        }
      />

      {/* KPIs — Suspense independente: não bloqueia a tabela */}
      <Suspense fallback={<KpiSkeleton />}>
        <RequisicoesKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* FilterBar — sincronizada com URL; pesquisa por número/solicitante/departamento */}
      <FilterBar
        searchPlaceholder="Pesquisar por número, solicitante ou departamento…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      {/* Tabela — re-suspende quando filtros mudam (key = JSON dos filtros activos) */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={8} />}
      >
        <RequisicoesTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
