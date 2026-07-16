import { Skeleton } from '@/components/ui/skeleton';

export function TableSkeleton({ rows = 10, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center h-10 px-4 gap-4 border-b bg-muted/30">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center h-11 px-4 gap-4 border-b last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" style={{ maxWidth: `${60 + (j * 15) % 80}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
