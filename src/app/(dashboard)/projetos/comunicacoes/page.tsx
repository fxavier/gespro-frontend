/**
 * Comunicações de Projecto — Server Component.
 * Registo de reuniões, atas, decisões e anúncios.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, MessageSquare } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ComunicacaoService } from '@/server/services/pessoas-projetos/comunicacao.service';
import { FilterComunicacaoSchema } from '@/lib/validations/projetos';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ComunicacoesTable } from './_components/comunicacoes-table';

const FiltroUrlSchema = FilterComunicacaoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});
type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos',
    options: [
      { label: 'Reunião', value: 'REUNIAO' },
      { label: 'Ata', value: 'ATA' },
      { label: 'Decisão', value: 'DECISAO' },
      { label: 'Anúncio', value: 'ANUNCIO' },
      { label: 'Relatório', value: 'RELATORIO' },
    ],
  },
];

async function ComunicacoesKpisSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpis = await runWithTenantContext({ tenantId, userId }, () =>
    ComunicacaoService.kpis({ tenantId, userId })
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <KpiCard title="Total" value={kpis.total} icon={<MessageSquare className="h-5 w-5" />} />
      <KpiCard title="Reuniões" value={kpis.reunioes} icon={<MessageSquare className="h-5 w-5" />} />
      <KpiCard title="Atas" value={kpis.atas} icon={<MessageSquare className="h-5 w-5" />} />
    </div>
  );
}

async function ComunicacoesTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    ComunicacaoService.listar(filtros, { tenantId, userId })
  );
  const data = result.items.map((r) => ({
    id: (r as { id: string }).id,
    tipo: (r as { tipo: string }).tipo as string,
    data: new Date((r as { data: Date }).data),
    participantes: (r as { participantes: string[] }).participantes,
    resumo: (r as { resumo: string }).resumo,
    projetoId: (r as { projetoId: string }).projetoId,
    createdAt: new Date((r as { createdAt: Date }).createdAt),
  }));
  return <ComunicacoesTable data={data} nextCursor={result.nextCursor} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ComunicacoesPage({ searchParams }: PageProps) {
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
        title="Comunicações"
        description="Reuniões, atas, decisões e anúncios de projecto"
        breadcrumbs={[
          { label: 'Projectos', href: '/projetos/lista' },
          { label: 'Comunicações' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/projetos/comunicacoes/novo">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Nova Comunicação
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>}>
        <ComunicacoesKpisSection tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchKey="search"
        searchPlaceholder="Pesquisar comunicações…"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<Skeleton className="h-64 w-full" />}>
        <ComunicacoesTableSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
