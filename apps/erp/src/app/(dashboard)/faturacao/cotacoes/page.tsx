/**
 * Cotações Comerciais — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { FiltroCotacaoComercialSchema } from '@/lib/validations/faturacao';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { CotacoesTable, type CotacaoResumo } from './_components/cotacoes-table';

const FiltroUrlSchema = FiltroCotacaoComercialSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

async function CotacoesSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      faturacaoService.listarCotacoesComerciais(filtros as any, { tenantId, userId })
    );

    const items: CotacaoResumo[] = result.items.map((c: any) => ({
      id: c.id,
      numero: c.serie?.numero ?? c.id,
      clienteNome: c.cliente?.nome ?? '—',
      dataEmissao: c.dataEmissao,
      dataValidade: c.dataValidade,
      total: parseFloat(c.total?.toString() ?? '0').toFixed(2),
      status: c.status,
    }));

    return <CotacoesTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar cotações.
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
      { label: 'Enviada', value: 'ENVIADA' },
      { label: 'Aceite', value: 'ACEITE' },
      { label: 'Rejeitada', value: 'REJEITADA' },
      { label: 'Convertida', value: 'CONVERTIDA' },
      { label: 'Expirada', value: 'EXPIRADA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CotacoesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parseResult = FiltroUrlSchema.safeParse(flat);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cotações Comerciais"
        description="Propostas e orçamentos para clientes"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Cotações' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/faturacao/cotacoes/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Cotação
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por nº ou cliente…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={6} />}>
        <CotacoesSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
