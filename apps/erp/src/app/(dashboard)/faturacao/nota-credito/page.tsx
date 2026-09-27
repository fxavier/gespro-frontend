/**
 * Notas de Crédito — Server Component (listagem).
 * Emissão em /nota-credito/nova.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_NOTA_CREDITO } from '@/server/services/financas/faturacao.interface';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { FiltroNotaCreditoSchema } from '@/lib/validations/faturacao';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { NotasCreditoTable, type NotaCreditoResumo } from './_components/notas-credito-table';

const FiltroUrlSchema = FiltroNotaCreditoSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

interface Acesso {
  liquidar: boolean;
  cancelar: boolean;
}

async function NotasCreditoSection({
  filtros,
  tenantId,
  userId,
  acesso,
}: {
  filtros: FiltroUrl;
  tenantId: string;
  userId: string;
  acesso: Acesso;
}) {
  try {
    const ctx = { tenantId, userId };
    const result = await runWithTenantContext(ctx, () =>
      faturacaoService.listarNotasCredito(filtros as any, ctx)
    );

    // O cliente da nota é o da factura que ela corrige.
    const nomes = await runWithTenantContext(ctx, () =>
      clienteService.nomesPorIds(
        result.items.map((nc: any) => nc.faturaOriginal?.clienteId).filter(Boolean),
        ctx,
      )
    );

    const items: NotaCreditoResumo[] = result.items.map((nc: any) => ({
      id: nc.id,
      numero: nc.numero,
      clienteNome: nomes[nc.faturaOriginal?.clienteId]?.nome ?? '—',
      faturaOriginalNumero: nc.faturaOriginal?.numero ?? '—',
      dataEmissao: nc.dataEmissao,
      total: parseFloat(nc.total?.toString() ?? '0').toFixed(2),
      status: nc.status,
      // Mesma regra do detalhe: transição permitida E permissão.
      podeLiquidar: acesso.liquidar && (TRANSICOES_NOTA_CREDITO[nc.status as keyof typeof TRANSICOES_NOTA_CREDITO] ?? []).includes('LIQUIDADA'),
      podeCancelar: acesso.cancelar && (TRANSICOES_NOTA_CREDITO[nc.status as keyof typeof TRANSICOES_NOTA_CREDITO] ?? []).includes('CANCELADA'),
    }));

    return <NotasCreditoTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar notas de crédito.
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
      { label: 'Emitida', value: 'EMITIDA' },
      { label: 'Liquidada', value: 'LIQUIDADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NotaCreditoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const acesso: Acesso = {
    liquidar: permissions.includes('faturacao:nc:liquidar'),
    cancelar: permissions.includes('faturacao:nc:cancelar'),
  };

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parseResult = FiltroUrlSchema.safeParse(flat);
  const filtros = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Notas de Crédito"
        description="Documentos de crédito emitidos por devolução ou correcção"
        breadcrumbs={[
          { label: 'Faturação', href: '/faturacao' },
          { label: 'Notas de Crédito' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/faturacao/nota-credito/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Nota de Crédito
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
        <NotasCreditoSection filtros={filtros} tenantId={tenantId} userId={userId} acesso={acesso} />
      </Suspense>
    </div>
  );
}
