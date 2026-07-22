'use client';

/**
 * MatrizRiscoWrapper — carrega MatrizRisco via dynamic() + skeleton.
 * Regra: dynamic({ ssr: false }) apenas em Client Components.
 */

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

function MatrizSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="A carregar matriz de risco">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-1">
          <Skeleton className="w-20 h-16" />
          {[1, 2, 3, 4].map((j) => (
            <Skeleton key={j} className="flex-1 h-16" />
          ))}
        </div>
      ))}
    </div>
  );
}

const MatrizRisco = dynamic(
  () => import('./matriz-risco').then((m) => ({ default: m.MatrizRisco })),
  { ssr: false, loading: () => <MatrizSkeleton /> },
);

type RiscoMatriz = {
  id: string;
  titulo: string;
  probabilidade: string;
  impacto: string;
  severidade: number;
  status: string;
};

interface MatrizRiscoWrapperProps {
  riscos: RiscoMatriz[];
}

export function MatrizRiscoWrapper({ riscos }: MatrizRiscoWrapperProps) {
  return <MatrizRisco riscos={riscos} />;
}
