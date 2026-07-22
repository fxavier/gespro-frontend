'use client';

/**
 * Fronteira 'use client' para os gráficos do relatório de Produção.
 * `dynamic({ ssr: false })` só é permitido dentro de um Client Component.
 */
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ChartSkeleton = () => <Skeleton className="h-[300px] w-full rounded-lg" />;

const OrdensPorStatusLazy = dynamic(
  () => import('./relatorio-charts').then((m) => m.GraficoOrdensPorStatus),
  { ssr: false, loading: ChartSkeleton },
);
const CustosLazy = dynamic(() => import('./relatorio-charts').then((m) => m.GraficoCustos), {
  ssr: false,
  loading: ChartSkeleton,
});

export function GraficoOrdensPorStatusWrapper(props: { dados: { status: string; total: number }[] }) {
  return <OrdensPorStatusLazy {...props} />;
}

export function GraficoCustosWrapper(props: { estimado: string; realizado: string }) {
  return <CustosLazy {...props} />;
}
