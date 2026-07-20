/**
 * Dashboard de Contabilidade — Server Component.
 *
 * KPIs reais com Suspense por secção; acesso rápido aos módulos.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BookOpen,
  BookMarked,
  FileText,
  TrendingUp,
  Scale,
  Plus,
  BarChart3,
  CreditCard,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader, KpiCard } from '@/components/patterns';

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

async function ContabilidadeKpis({ tenantId, userId }: { tenantId: string; userId: string }) {
  try {
    const [lancamentos, contas, diarios] = await runWithTenantContext({ tenantId, userId }, () =>
      Promise.all([
        contabilidadeService.listarLancamentos({ take: 100 }, { tenantId, userId }),
        contabilidadeService.listarContas({ take: 100 }, { tenantId, userId }),
        contabilidadeService.listarDiarios({ tenantId, userId }),
      ])
    );

    const pendentes = lancamentos.items.filter((l) => l.status === 'RASCUNHO').length;
    const lancados = lancamentos.items.filter((l) => l.status === 'LANCADO').length;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Lançamentos Pendentes"
          value={String(pendentes)}
          icon={<BookMarked className="h-5 w-5" />}
          description="em rascunho"
        />
        <KpiCard
          title="Lançamentos Efectuados"
          value={String(lancados)}
          icon={<FileText className="h-5 w-5" />}
        />
        <KpiCard
          title="Contas no Plano"
          value={String(contas.items.length)}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <KpiCard
          title="Diários Activos"
          value={String(diarios.length)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>
    );
  } catch {
    return null;
  }
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6 animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-8 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulos rápidos
// ─────────────────────────────────────────────────────────────────────────────

const MODULOS = [
  {
    title: 'Lançamentos',
    description: 'Registar e gerir lançamentos contabilísticos com partidas dobradas',
    href: '/contabilidade/lancamentos',
    icon: FileText,
    action: { label: 'Novo Lançamento', href: '/contabilidade/lancamentos/novo' },
  },
  {
    title: 'Plano de Contas',
    description: 'Plano geral de contas PGC-NIRF (Decreto 70/2009)',
    href: '/contabilidade/plano-contas',
    icon: BookOpen,
    action: { label: 'Nova Conta', href: '/contabilidade/plano-contas/novo' },
  },
  {
    title: 'Diários',
    description: 'Diários contabilísticos por natureza (vendas, compras, caixa…)',
    href: '/contabilidade/diarios',
    icon: BookMarked,
    action: { label: 'Novo Diário', href: '/contabilidade/diarios/novo' },
  },
  {
    title: 'Centros de Custo',
    description: 'Dimensão analítica cruzada com partidas contabilísticas',
    href: '/contabilidade/centros-custo',
    icon: Scale,
    action: { label: 'Novo Centro', href: '/contabilidade/centros-custo/novo' },
  },
  {
    title: 'Balancete',
    description: 'Balancete de verificação por período e classe de contas',
    href: '/contabilidade/balancete',
    icon: BarChart3,
  },
  {
    title: 'DRE',
    description: 'Demonstração de Resultados por Exercício (DRE)',
    href: '/contabilidade/dre',
    icon: TrendingUp,
  },
  {
    title: 'Razão Geral',
    description: 'Movimentos por conta com drill-down até ao lançamento original',
    href: '/contabilidade/razao-geral',
    icon: BookOpen,
  },
  {
    title: 'Reconciliação Bancária',
    description: 'Reconciliar extracto bancário com o razão contabilístico',
    href: '/contabilidade/reconciliacao',
    icon: CreditCard,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────────────────

export default async function ContabilidadePage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Contabilidade"
        description="Plano de contas PGC-NIRF, lançamentos, relatórios e análise financeira"
        breadcrumbs={[{ label: 'Contabilidade' }]}
        actions={
          <Button asChild size="sm">
            <Link href="/contabilidade/lancamentos/novo">
              <Plus className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<KpiSkeleton />}>
        <ContabilidadeKpis tenantId={tenantId} userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {MODULOS.map((m) => (
          <Card key={m.href} className="group hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <m.icon className="h-5 w-5" />
                </div>
              </div>
              <CardTitle className="text-sm font-semibold mt-3">{m.title}</CardTitle>
              <CardDescription className="text-xs">{m.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 flex flex-col gap-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={m.href}>Abrir</Link>
              </Button>
              {m.action && (
                <Button asChild size="sm" className="w-full">
                  <Link href={m.action.href}>
                    <Plus className="h-3 w-3 mr-1" />
                    {m.action.label}
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
