/**
 * Riscos de Projecto — Server Component.
 * Lista todos os riscos + matriz de risco.
 * Sem EmptyState: dados reais do serviço.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { RiscoService } from '@/server/services/pessoas-projetos/risco.service';
import { FilterRiscoSchema } from '@/lib/validations/projetos';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RiscosTable } from './_components/riscos-table';
import { MatrizRiscoWrapper } from './_components/matriz-risco-wrapper';

const FiltroUrlSchema = FilterRiscoSchema.extend({
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
      { label: 'Identificado', value: 'IDENTIFICADO' },
      { label: 'Em Mitigação', value: 'EM_MITIGACAO' },
      { label: 'Fechado', value: 'FECHADO' },
      { label: 'Materializado', value: 'MATERIALIZADO' },
    ],
  },
  {
    key: 'probabilidade',
    label: 'Probabilidade',
    placeholder: 'Todas',
    options: [
      { label: 'Baixa', value: 'BAIXA' },
      { label: 'Média', value: 'MEDIA' },
      { label: 'Alta', value: 'ALTA' },
      { label: 'Muito Alta', value: 'MUITO_ALTA' },
    ],
  },
  {
    key: 'impacto',
    label: 'Impacto',
    placeholder: 'Todos',
    options: [
      { label: 'Baixo', value: 'BAIXO' },
      { label: 'Médio', value: 'MEDIO' },
      { label: 'Alto', value: 'ALTO' },
      { label: 'Muito Alto', value: 'MUITO_ALTO' },
    ],
  },
];

async function RiscosKpisSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpis = await runWithTenantContext({ tenantId, userId }, () =>
    RiscoService.kpis({ tenantId, userId })
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <KpiCard title="Total de Riscos" value={kpis.total} icon={<ShieldAlert className="h-5 w-5" />} />
      <KpiCard title="Riscos Abertos" value={kpis.abertos} icon={<ShieldAlert className="h-5 w-5" />} />
      <KpiCard title="Materializados" value={kpis.materializados} icon={<ShieldAlert className="h-5 w-5" />} />
      <KpiCard title="Críticos" value={kpis.criticos} icon={<ShieldAlert className="h-5 w-5" />} />
    </div>
  );
}

async function MatrizSection({ tenantId, userId, projetoId }: { tenantId: string; userId: string; projetoId?: string }) {
  if (!projetoId) return null;
  const riscos = await runWithTenantContext({ tenantId, userId }, () =>
    RiscoService.matrizRisco(projetoId, { tenantId, userId })
  );
  const riscosSer = riscos.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    probabilidade: r.probabilidade as string,
    impacto: r.impacto as string,
    severidade: r.severidade,
    status: r.status as string,
  }));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Matriz de Risco</CardTitle>
      </CardHeader>
      <CardContent>
        <MatrizRiscoWrapper riscos={riscosSer} />
      </CardContent>
    </Card>
  );
}

async function RiscosTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    RiscoService.listar(filtros, { tenantId, userId })
  );
  const data = result.items.map((r) => ({
    id: (r as { id: string }).id,
    titulo: (r as { titulo: string }).titulo,
    probabilidade: (r as { probabilidade: string }).probabilidade as string,
    impacto: (r as { impacto: string }).impacto as string,
    severidade: (r as { severidade: number }).severidade,
    estrategiaResposta: (r as { estrategiaResposta: string }).estrategiaResposta as string,
    status: (r as { status: string }).status as string,
    projetoId: (r as { projetoId: string }).projetoId,
    createdAt: new Date((r as { createdAt: Date }).createdAt),
  }));
  return <RiscosTable data={data} nextCursor={result.nextCursor} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RiscosProjetosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parseResult = FiltroUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;
  const projetoId = typeof rawParams.projetoId === 'string' ? rawParams.projetoId : undefined;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Riscos"
        description="Identificação, avaliação e monitorização de riscos nos projectos"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Riscos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/projetos/riscos/novo">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Novo Risco
            </Link>
          </Button>
        }
      />

      <Suspense
        fallback={
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        }
      >
        <RiscosKpisSection tenantId={tenantId} userId={userId} />
      </Suspense>

      {projetoId && (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <MatrizSection tenantId={tenantId} userId={userId} projetoId={projetoId} />
        </Suspense>
      )}

      <FilterBar
        searchPlaceholder="Pesquisar por título…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<Skeleton className="h-64 w-full" />}
      >
        <RiscosTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
