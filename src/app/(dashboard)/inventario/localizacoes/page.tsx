/**
 * Listagem de Localizações — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { stockService } from '@/server/services/inventario/stock.service';
import { LocalizacaoFilterSchema } from '@/lib/validations/stock';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { LocalizacoesTable } from './_components/localizacoes-table';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const FiltroLocalizacaoUrlSchema = LocalizacaoFilterSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroLocalizacaoUrl = z.infer<typeof FiltroLocalizacaoUrlSchema>;
const FILTROS_DEFAULT: FiltroLocalizacaoUrl = { take: 25 };

async function LocalizacoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroLocalizacaoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    stockService.listarLocalizacoes(
      { search: filtros.search, tipo: filtros.tipo, cursor: filtros.cursor, take: filtros.take },
      ctx
    )
  );
  return <LocalizacoesTable data={result.items} nextCursor={result.nextCursor} />;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Armazém', value: 'ARMAZEM' },
      { label: 'Escritório', value: 'ESCRITORIO' },
      { label: 'Departamento', value: 'DEPARTAMENTO' },
      { label: 'Filial', value: 'FILIAL' },
      { label: 'Prateleira', value: 'PRATELEIRA' },
      { label: 'Sala', value: 'SALA' },
      { label: 'Andar', value: 'ANDAR' },
      { label: 'Área Técnica', value: 'AREA_TECNICA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LocalizacoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroLocalizacaoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Localizações"
        description="Gerencie armazéns, escritórios e outras localizações"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Localizações' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/localizacoes/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Localização
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por código ou nome…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={5} />}>
        <LocalizacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
