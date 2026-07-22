/**
 * Listagem de Devoluções — Server Component (NUNCA 'use client').
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, RotateCcw } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { devolucaoService } from '@/server/services/comercial/index';
import { FilterDevolucaoSchema } from '@/lib/validations/vendas';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { DevolucaoTable } from './_components/devolucao-table';

const FiltroUrlSchema = FilterDevolucaoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;

const FILTROS_DEFAULT: FiltroUrl = { take: 25, orderBy: 'createdAt', order: 'desc' };

async function DevolucaoTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    devolucaoService.listar(filtros, { tenantId, userId })
  );
  return <DevolucaoTable data={result.items} nextCursor={result.nextCursor} />;
}

function TableSkeleton() {
  return (
    <div className="rounded-md border animate-pulse">
      <div className="h-12 bg-muted" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 border-t bg-muted/30" />
      ))}
    </div>
  );
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Pendente', value: 'PENDENTE' },
      { label: 'Aprovada', value: 'APROVADA' },
      { label: 'Processada', value: 'PROCESSADA' },
      { label: 'Rejeitada', value: 'REJEITADA' },
    ],
  },
  {
    key: 'motivo',
    label: 'Motivo',
    placeholder: 'Todos',
    options: [
      { label: 'Defeito', value: 'DEFEITO' },
      { label: 'Produto Errado', value: 'PRODUTO_ERRADO' },
      { label: 'Insatisfação', value: 'INSATISFACAO' },
      { label: 'Excesso de Pedido', value: 'EXCESSO_PEDIDO' },
      { label: 'Avaria no Transporte', value: 'AVARIA_TRANSPORTE' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DevolucaoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Devoluções"
        description="Gestão de devoluções e reembolsos"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Devoluções' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/devolucoes/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Devolução
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por número de devolução…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton />}>
        <DevolucaoTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
