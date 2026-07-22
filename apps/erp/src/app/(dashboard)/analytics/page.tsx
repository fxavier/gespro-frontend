/**
 * Analytics — Server Component.
 *
 * Padrão: KPIs reais via kpi* do dashboardService; Suspense por domínio;
 * gráficos carregados com dynamic() para evitar SSR do recharts.
 * Zero mocks; zero cores hardcoded; zero Dialog.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import {
  TrendingUp,
  Package,
  ShoppingCart,
  DollarSign,
  Users,
  Ticket,
  Download,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { dashboardService } from '@/server/services/plataforma/analytics.service';
import { PageHeader, KpiCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GraficoVendasWrapper as GraficoVendas,
  GraficoOperacoesWrapper as GraficoOperacoes,
  GraficoFinancasWrapper as GraficoFinancas,
} from './_components/graficos';

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────────────────────────

function KpiSkeleton4() {
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

function KpiSkeleton3() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

function KpiSkeleton2() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[1, 2].map((i) => (
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
// Secções assíncronas por domínio
// ─────────────────────────────────────────────────────────────────────────────

async function KpisVendas({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpi = await dashboardService.kpiVendas({ tenantId, userId });
  const variacao = parseFloat(kpi.variacaoPercent);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Vendas do Mês"
          value={`MT ${parseFloat(kpi.totalVendasMes).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          delta={isNaN(variacao) ? undefined : variacao}
          deltaLabel="vs. ano anterior"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Nº de Vendas"
          value={String(kpi.quantidadeVendas)}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Ticket Médio"
          value={`MT ${parseFloat(kpi.ticketMedio).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <KpiCard
          title="Clientes Activos (90d)"
          value={String(kpi.clientesAtivos)}
          description={`Comissões a pagar: MT ${parseFloat(kpi.comissoesDevidas).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          icon={<Users className="h-5 w-5" />}
        />
      </div>
      <GraficoVendas
        totalVendasMes={kpi.totalVendasMes}
        totalVendasAnoAnterior={kpi.totalVendasAnoAnterior}
        quantidadeVendas={kpi.quantidadeVendas}
      />
    </div>
  );
}

async function KpisStock({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpi = await dashboardService.kpiStock({ tenantId, userId });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Valor Total em Stock"
        value={`MT ${parseFloat(kpi.valorTotalStock).toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<Package className="h-5 w-5" />}
      />
      <KpiCard
        title="Produtos Abaixo Mínimo"
        value={String(kpi.produtosAbaixoMinimo)}
        icon={<Package className="h-5 w-5" />}
      />
      <KpiCard
        title="Rotatividade (30d)"
        value={`${parseFloat(kpi.rotatividade30d).toFixed(1)}%`}
        icon={<Package className="h-5 w-5" />}
      />
      <KpiCard
        title="Sem Movimento (90d)"
        value={String(kpi.produtosSemMovimento90d)}
        icon={<Package className="h-5 w-5" />}
      />
    </div>
  );
}

async function KpisCompras({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpi = await dashboardService.kpiCompras({ tenantId, userId });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Compras do Mês"
        value={`MT ${parseFloat(kpi.totalComprasMes).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <KpiCard
        title="Pedidos Pendentes"
        value={String(kpi.pedidosPendentes)}
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <KpiCard
        title="Contas a Pagar Vencidas"
        value={`MT ${parseFloat(kpi.contasAPagarVencidas).toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}`}
        icon={<ShoppingCart className="h-5 w-5" />}
      />
      <KpiCard
        title="Aging Médio"
        value={`${kpi.agingMediaDias} dias`}
        description="Média de dias em atraso"
        icon={<ShoppingCart className="h-5 w-5" />}
      />
    </div>
  );
}

async function KpisFinancas({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpi = await dashboardService.kpiFinancas({ tenantId, userId });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Saldo de Caixa"
          value={`MT ${parseFloat(kpi.saldoCaixaAtual).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Receita do Mês"
          value={`MT ${parseFloat(kpi.receitaMes).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Despesa do Mês"
          value={`MT ${parseFloat(kpi.despesaMes).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KpiCard
          title="Resultado Líquido"
          value={`MT ${parseFloat(kpi.resultadoLiquido).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`}
          description={`Reconciliação: ${kpi.reconciliacaoRatio}`}
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>
      <GraficoFinancas
        receitaMes={kpi.receitaMes}
        despesaMes={kpi.despesaMes}
        resultadoLiquido={kpi.resultadoLiquido}
      />
    </div>
  );
}

async function KpisRH({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpi = await dashboardService.kpiRH({ tenantId, userId });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        title="Colaboradores Activos"
        value={String(kpi.colaboradoresAtivos)}
        description={`${kpi.ausenciasHoje} ausências hoje`}
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Férias Pendentes"
        value={String(kpi.feriasPendentesAprovacao)}
        description="Aguardam aprovação"
        icon={<Users className="h-5 w-5" />}
      />
      <KpiCard
        title="Projectos em Curso"
        value={String(kpi.projetosEmCurso)}
        description={`${parseFloat(kpi.timesheetHorasMes).toFixed(0)}h registadas no mês`}
        icon={<Users className="h-5 w-5" />}
      />
    </div>
  );
}

async function KpisOperacoes({ tenantId, userId }: { tenantId: string; userId: string }) {
  const kpi = await dashboardService.kpiOperacoes({ tenantId, userId });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Tickets Abertos"
          value={String(kpi.ticketsAbertos)}
          icon={<Ticket className="h-5 w-5" />}
        />
        <KpiCard
          title="Dentro de SLA"
          value={String(kpi.ticketsDentroSLA)}
          icon={<Ticket className="h-5 w-5" />}
        />
        <KpiCard
          title="Fora de SLA"
          value={String(kpi.ticketsForaSLA)}
          icon={<Ticket className="h-5 w-5" />}
        />
        <KpiCard
          title="Actividades Hoje"
          value={String(kpi.atividadesHoje)}
          description={`${kpi.viaturaDisponiveis} viaturas disponíveis`}
          icon={<Ticket className="h-5 w-5" />}
        />
      </div>
      <GraficoOperacoes
        ticketsAbertos={kpi.ticketsAbertos}
        ticketsDentroSLA={kpi.ticketsDentroSLA}
        ticketsForaSLA={kpi.ticketsForaSLA}
        viaturaDisponiveis={kpi.viaturaDisponiveis}
        viaturaEmMissao={kpi.viaturaEmMissao}
        viaturaEmManutencao={kpi.viaturaEmManutencao}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal — Server Component
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage(_props: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Analytics"
        description="Indicadores de desempenho de todos os domínios do sistema"
        breadcrumbs={[{ label: 'Analytics' }]}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar Relatório
          </Button>
        }
      />

      {/* Vendas */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
          Vendas &amp; Comercial
        </h2>
        <Suspense fallback={<KpiSkeleton4 />}>
          <KpisVendas tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>

      {/* Stock */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
          Inventário &amp; Stock
        </h2>
        <Suspense fallback={<KpiSkeleton4 />}>
          <KpisStock tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>

      {/* Compras */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
          Compras &amp; Fornecedores
        </h2>
        <Suspense fallback={<KpiSkeleton4 />}>
          <KpisCompras tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>

      {/* Finanças */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
          Finanças &amp; Caixa
        </h2>
        <Suspense fallback={<KpiSkeleton4 />}>
          <KpisFinancas tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>

      {/* RH */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
          Recursos Humanos
        </h2>
        <Suspense fallback={<KpiSkeleton3 />}>
          <KpisRH tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>

      {/* Operações */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
          Operações &amp; Transporte
        </h2>
        <Suspense fallback={<KpiSkeleton4 />}>
          <KpisOperacoes tenantId={tenantId} userId={userId} />
        </Suspense>
      </section>
    </div>
  );
}
