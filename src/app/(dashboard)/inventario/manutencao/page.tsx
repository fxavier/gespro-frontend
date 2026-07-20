/**
 * Listagem de Manutenções — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { manutencaoService } from '@/server/services/inventario/manutencao.service';
import { ManutencaoAtivoFilterSchema } from '@/lib/validations/inventario-ativos';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ManutencaoTable } from './_components/manutencao-table';
import { TableSkeleton } from '../ativos/_components/table-skeletons';

const FiltroManutencaoUrlSchema = ManutencaoAtivoFilterSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroManutencaoUrl = z.infer<typeof FiltroManutencaoUrlSchema>;

const FILTROS_DEFAULT: FiltroManutencaoUrl = { take: 25 };

async function ManutencaoTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroManutencaoUrl;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    manutencaoService.listarManutencoes(
      {
        ativoId: filtros.ativoId,
        tipo: filtros.tipo,
        status: filtros.status,
        prioridade: filtros.prioridade,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx
    )
  );
  return <ManutencaoTable data={result.items} nextCursor={result.nextCursor} />;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Agendada', value: 'AGENDADA' },
      { label: 'Em Andamento', value: 'EM_ANDAMENTO' },
      { label: 'Orçamento', value: 'ORCAMENTO' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Preventiva', value: 'PREVENTIVA' },
      { label: 'Corretiva', value: 'CORRETIVA' },
      { label: 'Inspecção', value: 'INSPECAO' },
      { label: 'Calibração', value: 'CALIBRACAO' },
    ],
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    placeholder: 'Todas',
    options: [
      { label: 'Crítica', value: 'CRITICA' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Média', value: 'MEDIA' },
      { label: 'Baixa', value: 'BAIXA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ManutencaoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroManutencaoUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Manutenção de Ativos"
        description="Gestão de manutenções preventivas e corretivas dos ativos"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Manutenção' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/manutencao/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Manutenção
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por título ou ativo…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={5} />}>
        <ManutencaoTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
