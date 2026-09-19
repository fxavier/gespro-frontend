/**
 * Skeleton de carregamento da listagem de exercícios.
 * Usado como fallback do <Suspense> em ExerciciosPage.
 */

import { Skeleton } from '@/components/ui/skeleton';

export function ExerciciosTableSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
