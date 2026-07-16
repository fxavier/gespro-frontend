/**
 * Lista de Projectos — Server Component (NUNCA 'use client').
 * Padrão golden standard: searchParams → safeParse, Suspense por secção.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ProjetoService } from '@/server/services/pessoas-projetos/projetos.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, StatusBadge, DataTable, TableSkeleton } from '@/components/patterns';
import type { FilterConfig, TableColumn } from '@/components/patterns';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

interface ProjetoRow {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  prioridade: string;
  dataFimPrevista: Date | null;
  progresso: number;
}

const columns: TableColumn<ProjetoRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => (
      <span className="font-medium tabular-nums text-primary">{row.codigo}</span>
    ),
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    render: (row) => <StatusBadge status={row.prioridade} />,
    mobileHidden: true,
  },
  {
    key: 'progresso',
    label: 'Progresso',
    render: (row) => (
      <span className="tabular-nums">{row.progresso}%</span>
    ),
    mobileHidden: true,
  },
  {
    key: 'dataFimPrevista',
    label: 'Prazo',
    render: (row) =>
      row.dataFimPrevista
        ? new Date(row.dataFimPrevista).toLocaleDateString('pt-PT')
        : '—',
    mobileHidden: true,
  },
];

async function ProjetosTableSection({
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
    ProjetoService.listar(
      {
        search: filtros.search,
        status: filtros.status as never,
        prioridade: filtros.prioridade as never,
        tipo: filtros.tipo as never,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const data: ProjetoRow[] = result.items.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    status: p.status,
    prioridade: p.prioridade,
    dataFimPrevista: p.dataFimPrevista,
    progresso: p.progresso,
  }));

  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/projetos/lista/${row.id}`}
      nextCursor={result.nextCursor ?? undefined}
    />
  );
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Planeamento', value: 'PLANEAMENTO' },
      { label: 'Em Execução', value: 'EM_EXECUCAO' },
      { label: 'Em Pausa', value: 'EM_PAUSA' },
      { label: 'Concluído', value: 'CONCLUIDO' },
      { label: 'Cancelado', value: 'CANCELADO' },
      { label: 'Arquivado', value: 'ARQUIVADO' },
    ],
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    options: [
      { label: 'Baixa', value: 'BAIXA' },
      { label: 'Média', value: 'MEDIA' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Crítica', value: 'CRITICA' },
    ],
  },
];

export default async function ListaProjetosPage({
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
        title="Projectos"
        description="Gerir todos os projectos da organização"
        breadcrumbs={[{ label: 'Projectos' }]}
        actions={
          <Button size="sm" asChild>
            <Link href="/projetos/lista/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Novo Projecto
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <ProjetosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
