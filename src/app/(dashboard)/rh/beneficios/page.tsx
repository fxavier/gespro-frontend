/**
 * Catálogo de Benefícios — Server Component (NUNCA 'use client').
 * Lista de benefícios com DataTable + FilterBar.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Heart, TrendingUp, Users } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { BeneficioService } from '@/server/services/pessoas-projetos/beneficios.service';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { BeneficiosTable } from './_components/beneficios-table';
import type { BeneficioRow } from './_components/beneficios-table';

const FiltroUrlSchema = z.object({
  search: z.string().optional(),
  tipo: z.string().optional(),
  ativo: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
});

type Filtro = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: Filtro = { take: 25 };

async function BeneficiosKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };

  const [todos, activos] = await runWithTenantContext(ctx, async () =>
    Promise.all([
      BeneficioService.listar({ take: 100 }, ctx),
      BeneficioService.listar({ take: 100, ativo: true }, ctx),
    ])
  );

  const totalAtribuicoes = activos.items.reduce(
    (sum, b) => sum + ((b as { _count: { atribuicoes: number } })._count.atribuicoes ?? 0),
    0,
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        title="Total de Benefícios"
        value={String(todos.items.length)}
        icon={<Heart className="h-5 w-5" />}
        description="Catálogo completo"
      />
      <KpiCard
        title="Benefícios Activos"
        value={String(activos.items.length)}
        icon={<TrendingUp className="h-5 w-5" />}
        description="Disponíveis para atribuição"
      />
      <KpiCard
        title="Atribuições Activas"
        value={String(totalAtribuicoes)}
        icon={<Users className="h-5 w-5" />}
        description="Colaboradores com benefícios"
      />
    </div>
  );
}

async function BeneficiosTableSection({
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
    BeneficioService.listar(
      {
        search: filtros.search,
        tipo: filtros.tipo as never,
        ativo: filtros.ativo,
        cursor: filtros.cursor,
        take: filtros.take,
      },
      ctx,
    )
  );

  const data: BeneficioRow[] = result.items.map((b) => {
    const item = b as {
      id: string;
      nome: string;
      tipo: string;
      fornecedor: string | null;
      custoTotal: { toString(): string };
      comparticipacaoEmpresa: { toString(): string };
      periodicidade: string;
      tributavel: boolean;
      ativo: boolean;
      _count: { atribuicoes: number };
    };
    return {
      id: item.id,
      nome: item.nome,
      tipo: item.tipo,
      fornecedor: item.fornecedor,
      custoTotal: item.custoTotal.toString(),
      comparticipacaoEmpresa: item.comparticipacaoEmpresa.toString(),
      periodicidade: item.periodicidade,
      tributavel: item.tributavel,
      ativo: item.ativo,
      atribuicoesActivas: item._count.atribuicoes,
    };
  });

  return <BeneficiosTable data={data} nextCursor={result.nextCursor} />;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos os tipos',
    options: [
      { label: 'Seguro de Saúde', value: 'SEGURO_SAUDE' },
      { label: 'Seguro de Vida', value: 'SEGURO_VIDA' },
      { label: 'Subsídio Alimentação', value: 'SUBSIDIO_ALIMENTACAO' },
      { label: 'Subsídio Transporte', value: 'SUBSIDIO_TRANSPORTE' },
      { label: 'Subsídio Habitação', value: 'SUBSIDIO_HABITACAO' },
      { label: 'Subsídio Comunicações', value: 'SUBSIDIO_COMUNICACOES' },
      { label: 'Plano de Pensões', value: 'PLANO_PENSOES' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BeneficiosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );

  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Benefícios"
        description="Catálogo de benefícios e regalias dos colaboradores"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Benefícios' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/rh/beneficios/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Benefício
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse"><div className="h-24 bg-muted rounded-lg" /><div className="h-24 bg-muted rounded-lg" /><div className="h-24 bg-muted rounded-lg" /></div>}>
        <BeneficiosKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por nome ou fornecedor…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={8} cols={6} />}
      >
        <BeneficiosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
