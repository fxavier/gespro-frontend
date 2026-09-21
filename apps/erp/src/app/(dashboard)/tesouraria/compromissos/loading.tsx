import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/patterns';

/** Skeleton de navegação para /tesouraria/compromissos. */
export default function CompromissosLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-px w-full" />
      </div>

      <Skeleton className="h-9 w-full" />
      <TableSkeleton rows={10} cols={7} />
    </div>
  );
}
