/**
 * Listagem de Lançamentos Contabilísticos — Server Component.
 *
 * Padrão golden standard: SC puro, Suspense, FilterBar, DataTable client.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { FiltroLancamentoSchema } from '@/lib/validations/contabilidade';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { LancamentosTable, type LancamentoResumo } from './_components/lancamentos-table';

const FiltroUrlSchema = FiltroLancamentoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.string().optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

async function LancamentosSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
}) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.listarLancamentos(filtros, { tenantId, userId })
    );

    const items: LancamentoResumo[] = result.items.map((l: any) => ({
      id: l.id,
      numero: l.numero ?? l.id.slice(0, 8).toUpperCase(),
      data: l.data.toISOString(),
      historico: l.historico,
      status: l.status,
      origem: l.origem,
      totalDebito: (l.partidas ?? [])
        .filter((p: any) => p.tipo === 'DEBITO')
        .reduce((acc: number, p: any) => acc + parseFloat(p.valor.toString()), 0)
        .toFixed(2),
      diarioNome: l.diario?.nome ?? '—',
    }));

    return (
      <LancamentosTable
        data={items}
        nextCursor={result.nextCursor}
        currentOrderBy={filtros.orderBy}
        currentOrderDir={filtros.orderDir}
      />
    );
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar lançamentos. Verifique a configuração da base de dados.
      </div>
    );
  }
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Lançado', value: 'LANCADO' },
      { label: 'Estornado', value: 'ESTORNADO' },
    ],
  },
  {
    key: 'origem',
    label: 'Origem',
    placeholder: 'Todas',
    options: [
      { label: 'Manual', value: 'MANUAL' },
      { label: 'Venda', value: 'VENDA' },
      { label: 'Compra', value: 'COMPRA' },
      { label: 'Pagamento', value: 'PAGAMENTO' },
      { label: 'Caixa', value: 'CAIXA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LancamentosPage({ searchParams }: PageProps) {
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
        title="Lançamentos Contabilísticos"
        description="Registar e gerir lançamentos com partidas dobradas"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Lançamentos' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/lancamentos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por histórico ou número…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={6} />}>
        <LancamentosSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
