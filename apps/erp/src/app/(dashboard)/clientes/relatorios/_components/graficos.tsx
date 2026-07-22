'use client';

/**
 * Fronteira 'use client' para os gráficos do relatório de Clientes.
 * `dynamic({ ssr: false })` só é permitido dentro de um Client Component.
 */
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const ChartSkeleton = () => <Skeleton className="h-[300px] w-full rounded-lg" />;

const PorCategoriaLazy = dynamic(
  () => import('./relatorio-charts').then((m) => m.GraficoPorCategoria),
  { ssr: false, loading: ChartSkeleton },
);
const TopDividaLazy = dynamic(() => import('./relatorio-charts').then((m) => m.GraficoTopDivida), {
  ssr: false,
  loading: ChartSkeleton,
});

export function GraficoPorCategoriaWrapper(props: { dados: { categoria: string; total: number }[] }) {
  return <PorCategoriaLazy {...props} />;
}

export function GraficoTopDividaWrapper(props: { dados: { nome: string; divida: string }[] }) {
  return <TopDividaLazy {...props} />;
}
