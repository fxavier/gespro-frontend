'use client';

/**
 * Wrappers client para os gráficos do Analytics.
 *
 * `dynamic({ ssr: false })` só é permitido dentro de uma fronteira 'use client'.
 * Este ficheiro é a fronteira — a page.tsx (Server Component) importa daqui.
 * Os dados chegam por props; o fetch é feito pelo Server Component pai.
 */

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ChartSkeleton = () => <Skeleton className="h-[260px] w-full rounded-lg" />;

// Dynamic imports com ssr:false — válido dentro de 'use client'
const GraficoVendasLazy = dynamic(
  () => import('./kpi-charts').then((m) => m.GraficoVendas),
  { ssr: false, loading: ChartSkeleton }
);

const GraficoOperacoesLazy = dynamic(
  () => import('./kpi-charts').then((m) => m.GraficoOperacoes),
  { ssr: false, loading: ChartSkeleton }
);

const GraficoFinancasLazy = dynamic(
  () => import('./kpi-charts').then((m) => m.GraficoFinancas),
  { ssr: false, loading: ChartSkeleton }
);

// Props espelham as dos componentes originais em kpi-charts.tsx

interface GraficoVendasWrapperProps {
  totalVendasMes: string;
  totalVendasAnoAnterior: string;
  quantidadeVendas: number;
}

export function GraficoVendasWrapper(props: GraficoVendasWrapperProps) {
  return <GraficoVendasLazy {...props} />;
}

interface GraficoOperacoesWrapperProps {
  ticketsAbertos: number;
  ticketsDentroSLA: number;
  ticketsForaSLA: number;
  viaturaDisponiveis: number;
  viaturaEmMissao: number;
  viaturaEmManutencao: number;
}

export function GraficoOperacoesWrapper(props: GraficoOperacoesWrapperProps) {
  return <GraficoOperacoesLazy {...props} />;
}

interface GraficoFinancasWrapperProps {
  receitaMes: string;
  despesaMes: string;
  resultadoLiquido: string;
}

export function GraficoFinancasWrapper(props: GraficoFinancasWrapperProps) {
  return <GraficoFinancasLazy {...props} />;
}
