/**
 * Dashboard Inicial — Server Component.
 *
 * Padrão: KPIs reais via dashboardService.dashboardGeral(); Suspense por secção.
 * Remove mocks hardcoded da versão anterior (Dashboard.tsx).
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  TrendingUp,
  Package,
  ShoppingCart,
  DollarSign,
  Users,
  Ticket,
  AlertCircle,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { dashboardService } from '@/server/services/plataforma/analytics.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function SecondaryKpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secção: KPIs Principais (vendas + stock + compras + finanças)
// ─────────────────────────────────────────────────────────────────────────────

async function KpisPrincipais({ tenantId, userId }: { tenantId: string; userId: string }) {
  const dados = await dashboardService.dashboardGeral({ tenantId, userId });

  const variacaoVendas = parseFloat(dados.vendas.variacaoPercent);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Vendas do Mês"
        value={`MT ${parseFloat(dados.vendas.totalVendasMes).toLocaleString('pt-MZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        delta={isNaN(variacaoVendas) ? undefined : variacaoVendas}
        deltaLabel="vs. mês anterior"
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <KpiCard
        title="Valor em Stock"
        value={`MT ${parseFloat(dados.stock.valorTotalStock).toLocaleString('pt-MZ', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}`}
        description={`${dados.stock.produtosAbaixoMinimo} produtos abaixo do mínimo`}
        icon={<Package className="h-5 w-5" />}
      />
      <KpiCard
        title="Pedidos de Compra"
        value={String(dados.compras.pedidosPendentes)}
        description={`MT ${parseFloat(dados.compras.contasAPagarVencidas).toLocaleString('pt-MZ', { minimumFractionDigits: 0 })} em contas vencidas`}
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <KpiCard
        title="Resultado Líquido"
        value={`MT ${parseFloat(dados.financas.resultadoLiquido).toLocaleString('pt-MZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
        description={`Saldo de caixa: MT ${parseFloat(dados.financas.saldoCaixaAtual).toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<DollarSign className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secção: KPIs Secundários (RH + operações)
// ─────────────────────────────────────────────────────────────────────────────

async function KpisSecundarios({ tenantId, userId }: { tenantId: string; userId: string }) {
  const dados = await dashboardService.dashboardGeral({ tenantId, userId });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <KpiCard
        title="Colaboradores Activos"
        value={String(dados.rh.colaboradoresAtivos)}
        description={`${dados.rh.ausenciasHoje} ausências hoje`}
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Tickets em Aberto"
        value={String(dados.operacoes.ticketsAbertos)}
        description={`${dados.operacoes.ticketsDentroSLA} dentro de SLA`}
        icon={<Ticket className="h-5 w-5" />}
      />
      <KpiCard
        title="Tickets Fora de SLA"
        value={String(dados.operacoes.ticketsForaSLA)}
        icon={<AlertCircle className="h-5 w-5" />}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Accões rápidas
// ─────────────────────────────────────────────────────────────────────────────

const ACCOES_RAPIDAS = [
  { titulo: 'Nova Venda', href: '/vendas/faturas/nova', descricao: 'Registar uma nova venda' },
  { titulo: 'Requisição de Compra', href: '/compras/requisicoes/novo', descricao: 'Criar solicitação de compra' },
  { titulo: 'Novo Ticket', href: '/tickets/novo', descricao: 'Abrir chamado de suporte' },
  { titulo: 'Registo de Assiduidade', href: '/rh/assiduidade/novo', descricao: 'Registar assiduidade' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral das operações da empresa"
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      {/* KPIs Principais — Suspense independente */}
      <Suspense fallback={<KpiSkeleton />}>
        <KpisPrincipais tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* KPIs Secundários */}
      <Suspense fallback={<SecondaryKpiSkeleton />}>
        <KpisSecundarios tenantId={tenantId} userId={userId} />
      </Suspense>

      {/* Accões Rápidas */}
      <Card>
        <CardHeader>
          <CardTitle>Accões Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ACCOES_RAPIDAS.map((accao) => (
              <Button
                key={accao.href}
                variant="outline"
                className="h-auto py-3 flex flex-col items-start gap-1 text-left"
                asChild
              >
                <Link href={accao.href}>
                  <span className="font-medium">{accao.titulo}</span>
                  <span className="text-xs text-muted-foreground font-normal">{accao.descricao}</span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
