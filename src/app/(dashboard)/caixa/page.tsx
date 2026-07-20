/**
 * Listagem de Sessões de Caixa — Server Component.
 *
 * Padrão golden standard:
 * - searchParams via Zod safeParse com defaults
 * - Dados carregados do serviço directamente (nunca fetch à API)
 * - Suspense por secção com skeleton
 * - FilterBar sincronizada com URL
 * - DataTable cursor-paginada
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { Plus, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as caixaService from '@/server/services/financas/caixa.service';
import { FiltroSessaoCaixaSchema } from '@/lib/validations/caixa';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, KpiCard } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { SessoesTable, type SessaoCaixaResumo } from './_components/sessoes-table';
import { KpiSkeleton, TableSkeleton } from './_components/table-skeletons';

// ─────────────────────────────────────────────────────────────────────────────
// Schema URL-safe
// ─────────────────────────────────────────────────────────────────────────────

const FiltroUrlSchema = FiltroSessaoCaixaSchema.extend({
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 25 };

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

async function CaixaKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  try {
    const [sessaoAtual, historico] = await runWithTenantContext({ tenantId, userId }, () =>
      Promise.all([
        caixaService.obterSessaoAtual({ tenantId, userId }),
        caixaService.listarSessoes({ take: 25 }, { tenantId, userId }),
      ])
    );

    const totalSessoes = historico.items.length;
    const sessoesAbertas = historico.items.filter((s) => s.status === 'ABERTA').length;
    const sessoesFechadas = historico.items.filter((s) => s.status === 'FECHADA').length;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Estado Actual do Caixa"
          value={sessaoAtual ? 'Aberto' : 'Fechado'}
          icon={<DollarSign className="h-5 w-5" />}
          description={sessaoAtual ? `Sessão ${sessaoAtual.numero}` : 'Sem sessão activa'}
        />
        <KpiCard
          title="Sessões Abertas"
          value={String(sessoesAbertas)}
          icon={<Clock className="h-5 w-5" />}
        />
        <KpiCard
          title="Sessões Fechadas"
          value={String(sessoesFechadas)}
          icon={<CheckCircle className="h-5 w-5" />}
          description={`de ${totalSessoes} no total`}
        />
      </div>
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela
// ─────────────────────────────────────────────────────────────────────────────

async function SessoesSection({
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
      caixaService.listarSessoes(filtros, { tenantId, userId })
    );

    // Serializar para plain objects (Prisma.Decimal → string)
    const items: SessaoCaixaResumo[] = result.items.map((s) => ({
      id: s.id,
      numero: s.numero,
      dataAbertura: s.dataAbertura.toISOString(),
      dataFechamento: s.dataFechamento ? s.dataFechamento.toISOString() : null,
      fundoInicial: s.fundoInicial.toString(),
      fundoFinal: s.fundoFinal ? s.fundoFinal.toString() : null,
      totalEntradas: s.totalEntradas.toString(),
      totalSaidas: s.totalSaidas.toString(),
      diferenca: s.diferenca ? s.diferenca.toString() : null,
      status: s.status,
    }));

    return <SessoesTable data={items} nextCursor={result.nextCursor} />;
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar sessões de caixa. Verifique a configuração da base de dados.
      </div>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar config
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'status',
    label: 'Estado',
    placeholder: 'Todos',
    options: [
      { label: 'Aberta', value: 'ABERTA' },
      { label: 'Fechada', value: 'FECHADA' },
      { label: 'Cancelada', value: 'CANCELADA' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CaixaPage({ searchParams }: PageProps) {
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
        title="Gestão de Caixa"
        description="Abertura, fecho e movimentações de caixa"
        breadcrumbs={[{ label: 'Caixa' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/caixa/abertura">
              <Plus className="h-4 w-4 mr-2" />
              Abrir Caixa
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <CaixaKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <FilterBar
        searchPlaceholder="Pesquisar por número de sessão…"
        searchKey="q"
        filters={FILTER_CONFIGS}
      />

      <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={8} cols={6} />}>
        <SessoesSection filtros={filtros} tenantId={tenantId} userId={userId} />
      </Suspense>
    </div>
  );
}
