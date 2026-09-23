import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton de navegação para /tesouraria. */
export default function TesourariaLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-px w-full" />
      </div>

      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full max-w-lg" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border p-6 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
