/**
 * Qualidade de Projectos — Server Component.
 * Lista não-conformidades, inspecções e auditorias.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { QualidadeService } from '@/server/services/pessoas-projetos/qualidade.service';
import { FilterQualidadeSchema } from '@/lib/validations/projetos';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QualidadeTable } from './_components/qualidade-table';

const FiltroUrlSchema = FilterQualidadeSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});
type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Aberta', value: 'ABERTA' },
      { label: 'Em Análise', value: 'EM_ANALISE' },
      { label: 'Resolvida', value: 'RESOLVIDA' },
      { label: 'Fechada', value: 'FECHADA' },
    ],
  },
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos',
    options: [
      { label: 'Não Conformidade', value: 'NAO_CONFORMIDADE' },
      { label: 'Inspeção', value: 'INSPECAO' },
      { label: 'Auditoria', value: 'AUDITORIA' },
      { label: 'Revisão', value: 'REVISAO' },
    ],
  },
];

async function QualidadeKpisSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpis = await runWithTenantContext({ tenantId, userId }, () =>
    QualidadeService.kpis({ tenantId, userId })
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard title="Total de Registos" value={kpis.total} icon={<ShieldCheck className="h-5 w-5" />} />
      <KpiCard title="Abertas" value={kpis.abertas} icon={<ShieldCheck className="h-5 w-5" />} />
      <KpiCard title="Em Análise" value={kpis.emAnalise} icon={<ShieldCheck className="h-5 w-5" />} />
      <KpiCard title="Resolvidas" value={kpis.resolvidas} icon={<ShieldCheck className="h-5 w-5" />} />
    </div>
  );
}

async function QualidadeTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    QualidadeService.listar(filtros, { tenantId, userId })
  );
  const data = result.items.map((r) => ({
    id: (r as { id: string }).id,
    tipo: (r as { tipo: string }).tipo as string,
    descricao: (r as { descricao: string }).descricao,
    status: (r as { status: string }).status as string,
    projetoId: (r as { projetoId: string }).projetoId,
    createdAt: new Date((r as { createdAt: Date }).createdAt),
  }));
  return <QualidadeTable data={data} nextCursor={result.nextCursor} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QualidadeProjetosPage({ searchParams }: PageProps) {
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
        title="Qualidade"
        description="Não-conformidades, inspecções e auditorias de projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Qualidade' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/projetos/qualidade/novo">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Novo Registo
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>}>
        <QualidadeKpisSection tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchKey="search"
        searchPlaceholder="Pesquisar registos de qualidade…"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<Skeleton className="h-64 w-full" />}>
        <QualidadeTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
