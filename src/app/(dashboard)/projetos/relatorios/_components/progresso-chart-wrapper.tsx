'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

function ChartSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

const ProgressoChart = dynamic(
  () => import('./progresso-chart').then((m) => ({ default: m.ProgressoChart })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

type ProjetoProgresso = {
  id: string;
  nome: string;
  codigo: string;
  status: string;
  progresso: number;
  dataFimPrevista: Date;
};

interface ProgressoChartWrapperProps {
  projetos: ProjetoProgresso[];
}

export function ProgressoChartWrapper({ projetos }: ProgressoChartWrapperProps) {
  return <ProgressoChart projetos={projetos} />;
}
