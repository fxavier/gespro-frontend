/**
 * Listagem de Fornecedores — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard (replica requisicoes):
 * - Schema de filtros via FilterFornecedorSchema (lib/validations)
 * - safeParse com defaults (nunca .parse — evita 500 em URL inválido)
 * - Dados carregados directamente do serviço (nunca fetch à API própria)
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL (termo, status, classificacao, tipo)
 * - DataTable cursor-paginada
 * - KPIs via contagem de registos reais
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Building, CheckCircle, Users, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { FilterFornecedorSchema } from '@/lib/validations/fornecedores';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { FornecedoresTable } from '../_components/fornecedores-table';
import { TableSkeleton, KpiSkeleton } from '../_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroFornecedorUrlSchema = FilterFornecedorSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroFornecedorUrl = z.infer<typeof FiltroFornecedorUrlSchema>;

const FILTROS_DEFAULT: FiltroFornecedorUrl = {
  take: 25,
  orderBy: 'nome',
  orderDir: 'asc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function FornecedoresKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [todos, ativos, inativos] = await Promise.all([
    runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.listar({ take: 1, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.listar({ status: 'ATIVO', take: 1, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.listar({ status: 'INATIVO', take: 1, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
    ),
  ]);

  // Para contar correctamente, fazemos take: 1000 (ou usamos a paginação sem cursor)
  // Simplificado: usar items retornados para estimar (pode ser implementado com countQuery no service)
  const totalResult = await runWithTenantContext({ tenantId, userId }, () =>
    fornecedorService.listar({ take: 1000, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
  );
  const ativosResult = await runWithTenantContext({ tenantId, userId }, () =>
    fornecedorService.listar({ status: 'ATIVO', take: 1000, orderBy: 'nome', orderDir: 'asc' }, { tenantId, userId })
  );

  const totalCompras = totalResult.items.reduce((sum, f) => sum + f.totalCompras, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Fornecedores"
        value={String(totalResult.items.length)}
        icon={<Building className="h-5 w-5" />}
      />
      <KpiCard
        title="Fornecedores Activos"
        value={String(ativosResult.items.length)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
      <KpiCard
        title="Fornecedores Preferenciais"
        value={String(totalResult.items.filter(f => f.classificacao === 'PREFERENCIAL').length)}
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Total em Compras"
        value={`MT ${totalCompras.toLocaleString('pt-MZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function FornecedoresTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroFornecedorUrl;
  tenantId: string;
  userId: string;
}) {
  const { status, classificacao, tipo, termo, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext({ tenantId, userId }, () =>
    fornecedorService.listar(
      { status, classificacao, tipo, termo, cursor, take, orderBy, orderDir },
      { tenantId, userId }
    )
  );

  return (
    <FornecedoresTable
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
      { label: 'Activo', value: 'ATIVO' },
      { label: 'Inactivo', value: 'INATIVO' },
      { label: 'Suspenso', value: 'SUSPENSO' },
    ],
  },
  {
    key: 'classificacao',
    label: 'Classificação',
    placeholder: 'Todas',
    options: [
      { label: 'Preferencial', value: 'PREFERENCIAL' },
      { label: 'Regular', value: 'REGULAR' },
      { label: 'Novo', value: 'NOVO' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos',
    options: [
      { label: 'Pessoa Física', value: 'PESSOA_FISICA' },
      { label: 'Pessoa Jurídica', value: 'PESSOA_JURIDICA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FornecedoresListaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroFornecedorUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Fornecedores"
        description="Gestão completa de fornecedores e parceiros comerciais"
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: 'Lista' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/fornecedores/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Fornecedor
            </Link>
          </Button>
        }
      />

      {/* KPIs — Suspense independente: não bloqueia a tabela */}
      <Suspense fallback={<KpiSkeleton />}>
        <FornecedoresKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* FilterBar — sincronizada com URL */}
      <FilterBar
        searchPlaceholder="Pesquisar por nome, NUIT ou código…"
        searchKey="termo"
        filters={FILTER_CONFIGS}
      />

      {/* Tabela — re-suspende quando filtros mudam */}
      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <FornecedoresTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
