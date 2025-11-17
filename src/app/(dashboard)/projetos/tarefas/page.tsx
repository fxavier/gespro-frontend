
import { Suspense } from 'react';
import TarefasContent from './tarefas-content';

export const metadata = {
  title: 'Tarefas | Projetos',
  description: 'Gestão de tarefas dos projetos',
};

function TarefasSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="h-10 bg-muted rounded animate-pulse" />
      <div className="h-24 bg-muted rounded animate-pulse" />
      <div className="h-96 bg-muted rounded animate-pulse" />
    </div>
  );
}

export default function TarefasPage() {
  return (
    <Suspense fallback={<TarefasSkeleton />}>
      <TarefasContent />
    </Suspense>
  );
}
