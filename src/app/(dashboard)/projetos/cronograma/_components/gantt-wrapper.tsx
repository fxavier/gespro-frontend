'use client';

/**
 * GanttWrapper — Client Component que carrega o GanttChart via dynamic().
 * Conforme a convenção: `dynamic(..., { ssr: false })` APENAS dentro de
 * Client Components (nunca em Server Components).
 */

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Skeleton enquanto o Gantt carrega
function GanttSkeleton() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2" aria-busy="true" aria-label="A carregar cronograma">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

const GanttChart = dynamic(
  () => import('./gantt-chart').then((m) => ({ default: m.GanttChart })),
  { ssr: false, loading: () => <GanttSkeleton /> },
);

type Tarefa = {
  id: string;
  codigo: string;
  titulo: string;
  status: string;
  prioridade: string;
  dataInicio: Date | null;
  dataFimPrevista: Date;
  dataFimReal: Date | null;
  progresso: number;
  dependencias: string[];
  responsavelId: string | null;
  tarefaPaiId: string | null;
};

type Marco = {
  id: string;
  nome: string;
  status: string;
  dataPrevista: Date;
  dataReal: Date | null;
  progresso: number;
};

type Projeto = {
  id: string;
  nome: string;
  dataInicio: Date;
  dataFimPrevista: Date;
  status: string;
};

interface GanttWrapperProps {
  projeto: Projeto;
  tarefas: Tarefa[];
  marcos: Marco[];
}

export function GanttWrapper({ projeto, tarefas, marcos }: GanttWrapperProps) {
  return <GanttChart projeto={projeto} tarefas={tarefas} marcos={marcos} />;
}
