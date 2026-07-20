/**
 * Ordens de Produção — Server Component (NUNCA 'use client').
 * Lista ordens com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { OrdemProducaoService } from '@/server/services/pessoas-projetos/producao.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { OrdensTable } from './_components/ordens-table';
import type { OrdemRow } from './_components/ordens-table';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function OrdensTableSection({
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
    OrdemProducaoService.listar(
      {
        status: filtros.status as never,
        prioridade: filtros.prioridade as never,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const data: OrdemRow[] = result.items.map((o) => ({
    id: o.id,
    numero: o.numero,
    nomeProduto: o.nomeProduto,
    status: o.status,
    prioridade: o.prioridade,
    progresso: o.progresso,
    dataPrevisaoFim: o.dataPrevisaoFim,
  }));

  return <OrdensTable data={data} nextCursor={result.nextCursor ?? undefined} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Planeada', value: 'PLANEADA' },
      { label: 'Liberada', value: 'LIBERADA' },
      { label: 'Em Produção', value: 'EM_PRODUCAO' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Pausada', value: 'PAUSADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    options: [
      { label: 'Baixa', value: 'BAIXA' },
      { label: 'Média', value: 'MEDIA' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Urgente', value: 'URGENTE' },
    ],
  },
];

export default async function OrdensPage({
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
        title="Ordens de Produção"
        description="Controlo e gestão das ordens de fabrico"
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Ordens de Produção' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/producao/ordens/nova">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Ordem
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <OrdensTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
