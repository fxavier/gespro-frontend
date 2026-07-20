import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto de carregamento genérico para loading.tsx de segmento.
 * Evita CLS ao mostrar estrutura visual imediatamente durante streaming.
 * Uso: export default function Loading() { return <PageLoading />; }
 */
export function PageLoading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true" aria-label="A carregar...">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
