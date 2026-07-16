/**
 * Listagem de Utilizadores — Server Component (NUNCA 'use client').
 *
 * Padrão golden standard:
 * - Dados directamente do serviço (sem fetch à API própria)
 * - Suspense com skeleton; FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Users } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { userAdminService } from '@/server/services/plataforma/user-admin.service';
import { FilterUserSchema } from '@/lib/validations/plataforma';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { UtilizadoresTable } from './_components/utilizadores-table';
import { TableSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroUtilizadorUrlSchema = FilterUserSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  ativo: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

type FiltroUtilizadorUrl = z.infer<typeof FiltroUtilizadorUrlSchema>;

const FILTROS_DEFAULT: FiltroUtilizadorUrl = { take: 25 };

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function UtilizadoresTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUtilizadorUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await userAdminService.listarUtilizadores(
    {
      search: filtros.search,
      ativo: filtros.ativo,
      cursor: filtros.cursor,
      take: filtros.take,
    },
    ctx
  );

  return (
    <UtilizadoresTable
      data={result.items}
      nextCursor={result.nextCursor}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar config
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'ativo',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Activo', value: 'true' },
      { label: 'Inactivo', value: 'false' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UtilizadoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroUtilizadorUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Utilizadores"
        description="Gestão de utilizadores e acessos do tenant"
        breadcrumbs={[
          { label: 'Administração', href: '/core-tenancy' },
          { label: 'Utilizadores' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/core-tenancy/utilizadores/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Utilizador
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por nome ou email…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={6} />}
      >
        <UtilizadoresTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
