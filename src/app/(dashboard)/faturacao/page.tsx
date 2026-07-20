/**
 * Faturação — Server Component (listagem).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus, TrendingUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { FiltroFaturaSchema } from '@/lib/validations/faturacao';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { FaturasTable, type FaturaResumo } from './_components/faturas-table';

const FiltroUrlSchema = FiltroFaturaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });
const n = (v: any) => parseFloat(v?.toString() ?? '0');

async function KpisSection({ tenantId, userId }: { tenantId: string; userId: string }) {
  try {
    const [todasResult, pagasResult, pendenteResult] = await Promise.all([
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ take: 1000 } as any, { tenantId, userId })
      ),
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ status: 'PAGA', take: 1000 } as any, { tenantId, userId })
      ),
      runWithTenantContext({ tenantId, userId }, () =>
        faturacaoService.listarFaturas({ status: 'EMITIDA', take: 1000 } as any, { tenantId, userId })
      ),
    ]);

    const totalFaturado = todasResult.items.reduce((s: number, f: any) => s + n(f.total), 0);
    const totalPago = pagasResult.items.reduce((s: number, f: any) => s + n(f.total), 0);
    const totalPendente = pendenteResult.items.reduce((s: number, f: any) => s + n(f.total), 0);
    const nVencidas = todasResult.items.filter((f: any) => f.status === 'VENCIDA').length;

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Faturado" value={fmtMZN.format(totalFaturado)} icon={<TrendingUp className="h-5 w-5" />} />
        <KpiCard title="Recebido" value={fmtMZN.format(totalPago)} icon={<CheckCircle className="h-5 w-5" />} />
        <KpiCard title="Pendente" value={fmtMZN.format(totalPendente)} icon={<Clock className="h-5 w-5" />} />
        <KpiCard title="Faturas Vencidas" value={String(nVencidas)} icon={<XCircle className="h-5 w-5" />} />
      </div>
    );
  } catch {
    return null;
  }
}

async function FaturasSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      faturacaoService.listarFaturas(filtros as any, { tenantId, userId })
    );

    const items: FaturaResumo[] = result.items.map((f: any) => ({
      id: f.id,
      numero: f.serie?.numero ?? f.id,
      clienteNome: f.cliente?.nome ?? '—',
      dataEmissao: f.dataEmissao,
      dataVencimento: f.dataVencimento,
      subtotal: n(f.subtotal).toFixed(2),
      ivaTotal: n(f.ivaTotal).toFixed(2),
      total: n(f.total).toFixed(2),
      statusFatura: f.status,
    }));

    return <FaturasTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar faturas.
      </div>
    );
  }
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'statusFatura',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Emitida', value: 'EMITIDA' },
      { label: 'Paga', value: 'PAGA' },
      { label: 'Vencida', value: 'VENCIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FaturacaoPage({ searchParams }: PageProps) {
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
        title="Faturação"
        description="Emissão e gestão de documentos fiscais"
        breadcrumbs={[{ label: 'Faturação' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/faturacao/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Fatura
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">{Array.from({length:4}).map((_,i)=><div key={i} className="h-24 rounded-lg bg-muted"/>)}</div>}>
        <KpisSection tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por nº de fatura…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={7} />}>
        <FaturasSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
