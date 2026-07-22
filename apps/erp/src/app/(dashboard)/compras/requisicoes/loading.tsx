import { Skeleton } from '@/components/ui/skeleton';
import { KpiSkeleton, TableSkeleton } from './_components/table-skeletons';

/**
 * Loading skeleton para a listagem de requisições.
 * Renderizado pelo Next.js durante a navegação para esta rota.
 */
export default function RequisicoesLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* PageHeader skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="h-px w-full" />
      </div>

      {/* KPIs skeleton */}
      <KpiSkeleton />

      {/* FilterBar skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Table skeleton */}
      <TableSkeleton rows={10} cols={8} />
    </div>
  );
}
