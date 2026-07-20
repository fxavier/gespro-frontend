/**
 * Centros de Custo — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { FiltroCentroCustoSchema } from '@/lib/validations/contabilidade';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { CentrosTable, type CentroCustoResumo } from './_components/centros-table';

const FiltroUrlSchema = FiltroCentroCustoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

async function CentrosSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.listarCentrosCusto(filtros, { tenantId, userId })
    );

    const items: CentroCustoResumo[] = result.items.map((c: any) => ({
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
      tipo: c.tipo,
      ativo: c.ativo,
      orcamento: c.orcamento ? c.orcamento.toString() : null,
    }));

    return <CentrosTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar centros de custo.
      </div>
    );
  }
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos',
    options: [
      { label: 'Departamento', value: 'DEPARTAMENTO' },
      { label: 'Projecto', value: 'PROJETO' },
      { label: 'Filial', value: 'FILIAL' },
      { label: 'Outro', value: 'OUTRO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CentrosCustoPage({ searchParams }: PageProps) {
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
        title="Centros de Custo"
        description="Dimensão analítica cruzada com partidas contabilísticas"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Centros de Custo' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/centros-custo/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Centro
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por código ou nome…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={5} />}>
        <CentrosSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
