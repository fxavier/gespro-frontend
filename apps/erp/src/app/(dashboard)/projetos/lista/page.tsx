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
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import type { PrioridadeProjeto, StatusProjeto } from '@prisma/client';
import { opcoesDeEnum } from '@/lib/opcoes-enum';
import { ProjetosTable } from './_components/projetos-table';
import type { ProjetoRow } from './_components/projetos-table';

const FiltroUrlSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  prioridade: z.string().optional(),
  tipo: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

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
        search: filtros.q,
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
    <ProjetosTable data={data} nextCursor={result.nextCursor ?? undefined} />
  );
}

const ROTULOS_STATUS: Record<StatusProjeto, string> = {
  PLANEAMENTO: 'Planeamento',
  EM_ANDAMENTO: 'Em Andamento',
  PAUSADO: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  ARQUIVADO: 'Arquivado',
};

const ROTULOS_PRIORIDADE: Record<PrioridadeProjeto, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

const FILTER_CONFIG: FilterConfig[] = [
  { key: 'status', label: 'Estado', options: opcoesDeEnum(ROTULOS_STATUS) },
  { key: 'prioridade', label: 'Prioridade', options: opcoesDeEnum(ROTULOS_PRIORIDADE) },
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
