'use client';

/**
 * KanbanBoard — Client Component com HTML5 native drag-and-drop persistente.
 * Ao largar uma tarefa chama reordenarTarefaAction com a nova posição fraccional.
 */

import { useRef, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { reordenarTarefaAction } from '@/server/actions/projetos.actions';

// ponytail: midpoint duplicado do service (pure math, sem deps de servidor)
function calcularMidpoint(a: string, b: string): string {
  const aNum = a === '' ? 0 : parseFloat(a);
  const bNum = b === '' ? 1 : parseFloat(b);
  const mid = (aNum + bNum) / 2;
  return mid.toFixed(8).replace(/\.?0+$/, '') || '0.5';
}

export interface TarefaKanban {
  id: string;
  codigo: string;
  titulo: string;
  status: string;
  prioridade: string;
  posicao: string;
  dataFimPrevista: Date | null;
  tags: string[];
}

interface Props {
  colunas: Record<string, TarefaKanban[]>;
  projetoId: string;
}

const COLUNAS_ORDEM: { key: string; label: string }[] = [
  { key: 'A_FAZER', label: 'A Fazer' },
  { key: 'EM_PROGRESSO', label: 'Em Progresso' },
  { key: 'EM_REVISAO', label: 'Em Revisão' },
  { key: 'BLOQUEADA', label: 'Bloqueada' },
  { key: 'CONCLUIDA', label: 'Concluída' },
];

const PRIORIDADE_CLASSES: Record<string, string> = {
  BAIXA: 'border-l-2 border-l-muted-foreground',
  MEDIA: 'border-l-2 border-l-warning',
  ALTA: 'border-l-2 border-l-destructive',
  CRITICA: 'border-l-2 border-l-destructive',
};

export function KanbanBoard({ colunas, projetoId: _projetoId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Referências para tracking do drag
  const dragTarefaId = useRef<string | null>(null);
  const dragSourceStatus = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, tarefaId: string, status: string) => {
      dragTarefaId.current = tarefaId;
      dragSourceStatus.current = status;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tarefaId);
    },
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (
      e: React.DragEvent,
      targetStatus: string,
      targetTarefas: TarefaKanban[],
      insertBeforeId?: string,
    ) => {
      e.preventDefault();
      const tarefaId = dragTarefaId.current;
      if (!tarefaId) return;

      // Calcular nova posição fraccional
      let novaPosicao: string;
      if (insertBeforeId) {
        const idx = targetTarefas.findIndex((t) => t.id === insertBeforeId);
        const antes = idx > 0 ? targetTarefas[idx - 1].posicao : '0';
        const depois = targetTarefas[idx].posicao;
        try {
          novaPosicao = calcularMidpoint(antes, depois);
        } catch {
          novaPosicao = String(parseFloat(antes) + 0.5);
        }
      } else {
        // Inserir no fim da coluna
        const ultima = targetTarefas[targetTarefas.length - 1];
        novaPosicao = ultima
          ? String(parseFloat(ultima.posicao) + 1)
          : '1';
      }

      type StatusTarefa = 'A_FAZER' | 'EM_PROGRESSO' | 'EM_REVISAO' | 'BLOQUEADA' | 'CONCLUIDA' | 'CANCELADA';
      const novoStatus: StatusTarefa | undefined =
        targetStatus !== dragSourceStatus.current ? (targetStatus as StatusTarefa) : undefined;

      startTransition(async () => {
        const result = await reordenarTarefaAction({
          tarefaId,
          novaPosicao,
          novoStatus,
        });

        if (!result.ok) {
          toast.error(result.error.message ?? 'Erro ao mover a tarefa.');
        } else {
          router.refresh();
        }
      });

      dragTarefaId.current = null;
      dragSourceStatus.current = null;
    },
    [router],
  );

  return (
    <div className={`flex gap-4 overflow-x-auto pb-4 ${isPending ? 'opacity-70 pointer-events-none' : ''}`}>
      {COLUNAS_ORDEM.map(({ key, label }) => {
        const tarefas = colunas[key] ?? [];
        return (
          <div
            key={key}
            className="flex-none w-72"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, key, tarefas)}
          >
            {/* Cabeçalho da coluna */}
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold">{label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({tarefas.length})
              </span>
            </div>

            {/* Área droppable */}
            <div className="min-h-24 space-y-2 rounded-lg border border-dashed border-muted p-2 bg-muted/20">
              {tarefas.map((tarefa) => (
                <div
                  key={tarefa.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, tarefa.id, key)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDrop(e, key, tarefas, tarefa.id);
                  }}
                  className={`rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing select-none hover:shadow-md transition-shadow ${PRIORIDADE_CLASSES[tarefa.prioridade] ?? ''}`}
                >
                  <p className="text-xs text-muted-foreground tabular-nums mb-1">
                    {tarefa.codigo}
                  </p>
                  <p className="text-sm font-medium leading-snug line-clamp-2">
                    {tarefa.titulo}
                  </p>
                  {tarefa.dataFimPrevista && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(tarefa.dataFimPrevista).toLocaleDateString('pt-PT')}
                    </p>
                  )}
                  {tarefa.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tarefa.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs rounded-full border px-1.5 py-0.5 text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {tarefas.length === 0 && (
                <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
                  Sem tarefas
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
