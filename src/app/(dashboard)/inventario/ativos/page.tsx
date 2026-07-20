/**
 * Listagem de Ativos — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard:
 * - Schema de filtros derivado de AtivoFilterSchema (lib/validations)
 * - safeParse com defaults (nunca .parse — evita 500 em URL inválido)
 * - Dados carregados directamente do serviço (nunca fetch à API própria)
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { AtivoFilterSchema } from '@/lib/validations/inventario-ativos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { AtivosTable } from './_components/ativos-table';
import { TableSkeleton } from './_components/table-skeletons';

// ─── Schema URL-safe ────────────────────────────────────────────────────────────

const FiltroAtivoUrlSchema = AtivoFilterSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroAtivoUrl = z.infer<typeof FiltroAtivoUrlSchema>;

const FILTROS_DEFAULT: FiltroAtivoUrl = {
  take: 25,
  orderBy: 'createdAt',
  orderDir: 'desc',
};

// ─── Tabela assíncrona ───────────────────────────────────────────────────────────

async function AtivosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroAtivoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const { search, categoriaId, localizacaoId, estado, cursor, take, orderBy, orderDir } = filtros;

  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ativosService.listarAtivos(
      { search, categoriaId, localizacaoId, estado, cursor, take, orderBy, orderDir },
      ctx
    )
  );

  return (
    <AtivosTable
      data={result.items}
      nextCursor={result.nextCursor}
      currentOrderBy={orderBy}
      currentOrderDir={orderDir}
    />
  );
}

// ─��─ Filtros ─────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'estado',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Novo', value: 'NOVO' },
      { label: 'Em Uso', value: 'EM_USO' },
      { label: 'Em Manutenção', value: 'EM_MANUTENCAO' },
      { label: 'Em Transferência', value: 'EM_TRANSFERENCIA' },
      { label: 'Obsoleto', value: 'OBSOLETO' },
      { label: 'Baixado', value: 'BAIXADO' },
    ],
  },
];

// ─── Página principal — Server Component ─────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AtivosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroAtivoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Gestão de Ativos"
        description="Gerencie todos os equipamentos e ativos da empresa"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Ativos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/ativos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Ativo
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por código, nome ou série…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={7} />}
      >
        <AtivosTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
