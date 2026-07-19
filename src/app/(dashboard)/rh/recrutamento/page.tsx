/**
 * Dashboard de Recrutamento — Server Component (NUNCA 'use client').
 * Substitui o EmptyState anterior conforme spec 07.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Briefcase, Users, CheckCircle, Clock } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { VagaService } from '@/server/services/pessoas-projetos/recrutamento.service';
import { FilterVagaSchema } from '@/lib/validations/recrutamento';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { VagasTable } from './_components/vagas-table';
import { TableSkeleton, KpiSkeleton } from './_components/skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroVagaUrlSchema = FilterVagaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroVagaUrl = z.infer<typeof FiltroVagaUrlSchema>;

const FILTROS_DEFAULT: FiltroVagaUrl = {
  take: 25,
  orderBy: 'createdAt',
  orderDir: 'desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// KPIs assíncronos
// ─────────────────────────────────────────────────────────────────────────────

async function RecrutamentoKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const contagens = await runWithTenantContext({ tenantId, userId }, () =>
    VagaService.contarPorStatus({ tenantId, userId })
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Total de Vagas"
        value={String(contagens.total)}
        icon={<Briefcase className="h-5 w-5" />}
      />
      <KpiCard
        title="Vagas Abertas"
        value={String(contagens.abertas)}
        icon={<Clock className="h-5 w-5" />}
      />
      <KpiCard
        title="Em Triagem"
        value={String(contagens.emTriagem)}
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Fechadas"
        value={String(contagens.fechadas)}
        icon={<CheckCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function VagasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroVagaUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    VagaService.listar(filtros, { tenantId, userId })
  );

  return (
    <VagasTable
      data={result.items}
      nextCursor={result.nextCursor}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuração FilterBar
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Aberta', value: 'ABERTA' },
      { label: 'Em Triagem', value: 'EM_TRIAGEM' },
      { label: 'Fechada', value: 'FECHADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RecrutamentoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroVagaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Recrutamento"
        description="Gestão de vagas e processos de selecção"
        breadcrumbs={[
          { label: 'RH', href: '/rh' },
          { label: 'Recrutamento' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/rh/recrutamento/vagas/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Vaga
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <RecrutamentoKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por título ou código…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton rows={10} cols={6} />}
      >
        <VagasTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
