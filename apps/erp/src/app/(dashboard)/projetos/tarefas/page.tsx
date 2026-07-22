/**
 * Tarefas (global) — Server Component (NUNCA 'use client').
 * Lista todas as tarefas com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  FilterBar,
  TableSkeleton,
} from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { TarefasTable } from './_components/tarefas-table';
import type { TarefaRow } from './_components/tarefas-table';

const FiltroUrlSchema = z.object({
  status: z.string().optional(),
  prioridade: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function TarefasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: Filtro;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const rows = await runWithTenantContext(ctx, () =>
    prisma.tarefaProjeto.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
        ...(filtros.prioridade ? { prioridade: filtros.prioridade as never } : {}),
      },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        status: true,
        prioridade: true,
        dataFimPrevista: true,
        projeto: { select: { nome: true } },
      },
      orderBy: [{ status: 'asc' }, { posicao: 'asc' }],
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: TarefaRow[] = rows.map((t) => ({
    id: t.id,
    codigo: t.codigo,
    titulo: t.titulo,
    projetoNome: t.projeto.nome,
    status: t.status,
    prioridade: t.prioridade,
    dataFimPrevista: t.dataFimPrevista,
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <TarefasTable data={data} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'A Fazer', value: 'A_FAZER' },
      { label: 'Em Progresso', value: 'EM_PROGRESSO' },
      { label: 'Em Revisão', value: 'EM_REVISAO' },
      { label: 'Bloqueada', value: 'BLOQUEADA' },
      { label: 'Concluída', value: 'CONCLUIDA' },
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
      { label: 'Crítica', value: 'CRITICA' },
    ],
  },
];

export default async function TarefasPage({
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
        title="Tarefas"
        description="Todas as tarefas de todos os projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Tarefas' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/projetos/lista">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Tarefa
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <TarefasTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
