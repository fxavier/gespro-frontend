/**
 * Listagem de Contagens de Stock — Server Component (NUNCA 'use client').
 * Spec 05: contagem cíclica de existências (distinta do inventário físico de ativos).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ClipboardCheck, Clock, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contagemStockService } from '@/server/services/inventario/contagem-stock.service';
import { FilterContagemSchema } from '@/lib/validations/inventario-contagem';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { ContagensTable } from './_components/contagens-table';
import { TableSkeleton, KpiSkeleton } from './_components/table-skeletons';

// ─── Schema de filtros URL-safe ───────────────────────────────────────────────

const FiltroContagemUrlSchema = FilterContagemSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroContagemUrl = z.infer<typeof FiltroContagemUrlSchema>;

const FILTROS_DEFAULT: FiltroContagemUrl = { take: 25 };

// ─── KPIs ─────────────────────────────────────────────────────────────────────

async function ContagensKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  const ctx = { tenantId, userId };
  const [emContagem, reconciliadas, concluidas] = await Promise.all([
    runWithTenantContext({ tenantId, userId }, () =>
      contagemStockService.listar({ take: 1, status: 'EM_CONTAGEM' }, ctx)
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      contagemStockService.listar({ take: 1, status: 'RECONCILIADA' }, ctx)
    ),
    runWithTenantContext({ tenantId, userId }, () =>
      contagemStockService.listar({ take: 1, status: 'CONCLUIDA' }, ctx)
    ),
  ]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        title="Em Contagem"
        value={emContagem.items.length > 0 ? '1+' : '0'}
        icon={<Clock className="h-4 w-4" />}
        description="Contagens abertas"
      />
      <KpiCard
        title="Reconciliadas"
        value={reconciliadas.items.length > 0 ? '1+' : '0'}
        icon={<ClipboardCheck className="h-4 w-4" />}
        description="Aguardam conclusão"
      />
      <KpiCard
        title="Concluídas"
        value={concluidas.items.length > 0 ? '1+' : '0'}
        icon={<CheckCircle2 className="h-4 w-4" />}
        description="Contagens finalizadas"
      />
    </div>
  );
}

// ─── Tabela ───────────────────────────────────────────────────────────────────

async function ContagensTableSection({
  tenantId,
  userId,
  filtros,
}: {
  tenantId: string;
  userId: string;
  filtros: FiltroContagemUrl;
}) {
  const ctx = { tenantId, userId };
  const resultado = await runWithTenantContext({ tenantId, userId }, () =>
    contagemStockService.listar(filtros, ctx)
  );

  return (
    <ContagensTable data={resultado.items} nextCursor={resultado.nextCursor} />
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os estados' },
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'EM_CONTAGEM', label: 'Em Contagem' },
  { value: 'RECONCILIADA', label: 'Reconciliada' },
  { value: 'CONCLUIDA', label: 'Concluída' },
  { value: 'CANCELADA', label: 'Cancelada' },
];

const FILTROS_CONFIG: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    options: STATUS_OPTIONS,
  },
];

export default async function ContagensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const params = await searchParams;
  const filtros = FiltroContagemUrlSchema.safeParse(params).success
    ? FiltroContagemUrlSchema.parse(params)
    : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Contagens de Stock"
        description="Contagem cíclica de existências e reconciliação automática de stock"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Contagens de Stock' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/inventario/contagens/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Contagem
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ContagensKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar filters={FILTROS_CONFIG} />

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <ContagensTableSection
          tenantId={tenantId}
          userId={userId}
          filtros={filtros}
        />
      </Suspense>
    </div>
  );
}
