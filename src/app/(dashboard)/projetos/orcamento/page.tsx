
import { Suspense } from 'react';
import OrcamentoContent from './components/orcamento-content';

export const metadata = {
  title: 'Gestão de Orçamento | Projetos',
  description: 'Gestão de orçamento dos projetos',
};

function OrcamentoSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="h-10 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded animate-pulse" />
        ))}
      </div>
      <div className="h-96 bg-muted rounded animate-pulse" />
    </div>
  );
}

export default function OrcamentoPage() {
  return (
    <Suspense fallback={<OrcamentoSkeleton />}>
      <OrcamentoContent />
    </Suspense>
  );
}
