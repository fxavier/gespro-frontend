import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton para o detalhe de uma requisição.
 */
export default function RequisicaoDetalheLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* PageHeader skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-56" />
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <Skeleton className="h-px w-full" />
      </div>

      {/* DetailShell skeleton */}
      <div className="flex gap-6">
        {/* Tabs */}
        <div className="flex-1 space-y-4">
          <div className="flex gap-4 border-b">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
          {/* Table skeleton */}
          <div className="rounded-lg border overflow-hidden">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center h-10 px-4 gap-4 border-b last:border-0">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* Metadata sidebar */}
        <div className="w-72 rounded-lg border p-5 space-y-3 self-start">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
