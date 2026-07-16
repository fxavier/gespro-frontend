/**
 * Plano de Contas PGC-NIRF — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { FiltroContaPGCSchema } from '@/lib/validations/contabilidade';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ContasTable, type ContaPGCResumo } from './_components/contas-table';

const FiltroUrlSchema = FiltroContaPGCSchema.extend({
  take: z.coerce.number().int().positive().max(200).default(100),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 100 };

async function ContasSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.listarContas(filtros, { tenantId, userId })
    );

    const items: ContaPGCResumo[] = result.items.map((c: any) => ({
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
      classe: c.classe,
      tipo: c.tipo,
      natureza: c.natureza,
      nivel: c.nivel,
      aceitaLancamento: c.aceitaLancamento,
      ativo: c.ativo,
    }));

    return <ContasTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar plano de contas. Verifique a configuração da base de dados.
      </div>
    );
  }
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'classe',
    label: 'Classe',
    placeholder: 'Todas',
    options: Array.from({ length: 8 }, (_, i) => ({
      label: `Classe ${i + 1}`,
      value: `CLASSE_${i + 1}`,
    })),
  },
  {
    key: 'tipo',
    label: 'Tipo',
    placeholder: 'Todos',
    options: [
      { label: 'Activo', value: 'ATIVO' },
      { label: 'Passivo', value: 'PASSIVO' },
      { label: 'Capital Próprio', value: 'CAPITAL_PROPRIO' },
      { label: 'Rendimento', value: 'RENDIMENTO' },
      { label: 'Gasto', value: 'GASTO' },
      { label: 'Resultado', value: 'RESULTADO' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlanoContasPage({ searchParams }: PageProps) {
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
        title="Plano de Contas PGC-NIRF"
        description="Plano geral de contas segundo o Decreto 70/2009 (PGC-NIRF)"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Plano de Contas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/plano-contas/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Conta
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por código ou nome da conta…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={15} cols={6} />}>
        <ContasSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
