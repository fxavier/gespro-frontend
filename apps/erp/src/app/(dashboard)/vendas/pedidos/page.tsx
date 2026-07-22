/**
 * Listagem de Encomendas de Venda (Pedidos) — Server Component (NUNCA 'use client').
 *
 * Segue o golden standard compras/requisicoes/page.tsx:
 * - Filtros via searchParams (safeParse)
 * - Dados carregados directamente do serviço (nunca fetch)
 * - Suspense por secção com skeleton
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, ShoppingBag } from 'lucide-react';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { encomendaService } from '@/server/services/comercial/index';
import { FilterEncomendaSchema } from '@/lib/validations/vendas';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { EncomendasTable } from './_components/encomendas-table';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroEncomendaUrlSchema = FilterEncomendaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroEncomendaUrl = z.infer<typeof FiltroEncomendaUrlSchema>;

const FILTROS_DEFAULT: FiltroEncomendaUrl = {
  take: 25,
  orderBy: 'createdAt',
  order: 'desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// Tabela assíncrona
// ─────────────────────────────────────────────────────────────────────────────

async function EncomendasTableSection({
  filtros,
  tenantId,
  userId,
}: {
  filtros: FiltroEncomendaUrl;
  tenantId: string;
  userId: string;
}) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    encomendaService.listar(filtros, { tenantId, userId })
  );

  return (
    <EncomendasTable
      data={result.items}
      nextCursor={result.nextCursor}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-md border animate-pulse">
      <div className="h-12 bg-muted" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 border-t bg-muted/30" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos os estados',
    options: [
      { label: 'Rascunho', value: 'RASCUNHO' },
      { label: 'Confirmada', value: 'CONFIRMADA' },
      { label: 'Parcialmente Entregue', value: 'PARCIALMENTE_ENTREGUE' },
      { label: 'Concluída', value: 'CONCLUIDA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PedidosVendaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flatParams = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );

  const parseResult = FiltroEncomendaUrlSchema.safeParse(flatParams);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Encomendas de Venda"
        description="Gestão de pedidos e encomendas de clientes"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Encomendas' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/vendas/pedidos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Encomenda
            </Link>
          </Button>
        }
      />

      <FilterBar
        searchPlaceholder="Pesquisar por número de encomenda…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense
        key={JSON.stringify(filtros)}
        fallback={<TableSkeleton />}
      >
        <EncomendasTableSection
          filtros={filtros}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
