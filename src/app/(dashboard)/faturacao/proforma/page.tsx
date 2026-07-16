/**
 * Faturas Proforma — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { FiltroProformaSchema } from '@/lib/validations/faturacao';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ProformasTable, type ProformaResumo } from './_components/proformas-table';

const FiltroUrlSchema = FiltroProformaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

async function ProformasSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      faturacaoService.listarProformas(filtros as any, { tenantId, userId })
    );

    const items: ProformaResumo[] = result.items.map((p: any) => ({
      id: p.id,
      numero: p.serie?.numero ?? p.id,
      clienteNome: p.cliente?.nome ?? '—',
      dataEmissao: p.dataEmissao,
      dataValidade: p.dataValidade,
      total: parseFloat(p.total?.toString() ?? '0').toFixed(2),
      status: p.status,
    }));

    return <ProformasTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar proformas.
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
      { label: 'Convertida', value: 'CONVERTIDA' },
      { label: 'Expirada', value: 'EXPIRADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProformaPage({ searchParams }: PageProps) {
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
        title="Faturas Proforma"
        description="Gestão de proformas e documentos preliminares"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Proforma' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/faturacao/proforma/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Proforma
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
        <ProformasSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
