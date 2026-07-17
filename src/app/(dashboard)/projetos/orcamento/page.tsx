/**
 * Orçamentos de Projecto — Server Component (NUNCA 'use client').
 * Lista orçamentos dos projectos. Criação e edição em rotas dedicadas.
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
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { OrcamentosTable } from './_components/orcamentos-table';
import type { OrcamentoRow } from './_components/orcamentos-table';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function OrcamentosTableSection({
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
    prisma.orcamentoProjeto.findMany({
      where: {
        tenantId,
        ...(filtros.status ? { status: filtros.status as never } : {}),
      },
      include: {
        projeto: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filtros.take,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    })
  );

  const data: OrcamentoRow[] = rows.map((o) => ({
    id: o.id,
    projetoNome: o.projeto?.nome ?? '—',
    versao: o.versao,
    status: o.status,
    totalPlanejado: Number(o.totalPlanejado),
    totalUtilizado: Number(o.totalUtilizado),
  }));

  const nextCursor = data.length === filtros.take ? data[data.length - 1]?.id : undefined;

  return <OrcamentosTable data={data} nextCursor={nextCursor} />;
}

const FILTER_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Aprovado', value: 'APROVADO' },
      { label: 'Rejeitado', value: 'REJEITADO' },
      { label: 'Encerrado', value: 'ENCERRADO' },
    ],
  },
];

export default async function OrcamentoPage({
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
        title="Orçamentos"
        description="Gestão de orçamentos dos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Orçamentos' },
        ]}
        actions={
          <Button size="sm" asChild>
            <Link href="/projetos/orcamento/novo">
              <Plus className="h-4 w-4 mr-1.5" />
              Novo Orçamento
            </Link>
          </Button>
        }
      />

      <FilterBar filters={FILTER_CONFIG} />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={6} cols={5} />}
      >
        <OrcamentosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
