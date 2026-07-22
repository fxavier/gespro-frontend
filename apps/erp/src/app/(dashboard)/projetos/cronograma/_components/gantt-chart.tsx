'use client';

/**
 * Gantt Chart — Client Component.
 * Componente pesado: carregado via dynamic() com skeleton.
 * Renderiza tarefas e marcos de um projecto numa vista de linha do tempo.
 * Tokens CSS: usa apenas variáveis @theme (sem cores hardcoded).
 * Acessível: aria-labels, contraste AA.
 */

import { useMemo } from 'react';
import { StatusBadge } from '@/components/patterns/status-badge';

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

interface GanttChartProps {
  projeto: Projeto;
  tarefas: Tarefa[];
  marcos: Marco[];
}

const PRIORIDADE_COR: Record<string, string> = {
  BAIXA: 'bg-muted-foreground/30',
  MEDIA: 'bg-info/60',
  ALTA: 'bg-warning/60',
  CRITICA: 'bg-destructive/70',
};

const STATUS_OPACITY: Record<string, string> = {
  CONCLUIDA: 'opacity-60',
  CANCELADA: 'opacity-40',
};

function calcularLargura(inicio: Date, fim: Date, minDate: Date, totalDias: number): { left: number; width: number } {
  const total = totalDias * 24 * 60 * 60 * 1000;
  const offset = Math.max(0, inicio.getTime() - minDate.getTime());
  const duracao = Math.max(1, fim.getTime() - inicio.getTime()) + 24 * 60 * 60 * 1000;
  const left = (offset / total) * 100;
  const width = Math.min((duracao / total) * 100, 100 - left);
  return { left, width };
}

export function GanttChart({ projeto, tarefas, marcos }: GanttChartProps) {
  const { minDate, totalDias, colunasData } = useMemo(() => {
    const min = new Date(projeto.dataInicio);
    const max = new Date(projeto.dataFimPrevista);
    const totalMs = max.getTime() - min.getTime();
    const total = Math.ceil(totalMs / (1000 * 60 * 60 * 24)) + 7;

    // Gerar colunas de semanas
    const colunas: Date[] = [];
    const cur = new Date(min);
    while (cur <= max) {
      colunas.push(new Date(cur));
      cur.setDate(cur.getDate() + 7);
    }

    return { minDate: min, totalDias: total, colunasData: colunas };
  }, [projeto]);

  // Posição da linha "hoje" — `new Date()` dentro do useMemo para evitar re-render desnecessário
  const hojeOffset = useMemo(() => {
    const hoje = new Date();
    const offset = hoje.getTime() - minDate.getTime();
    const total = totalDias * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.min(100, (offset / total) * 100));
  }, [minDate, totalDias]);

  const tarefasComDatas = tarefas.filter((t) => t.dataInicio || t.dataFimPrevista);

  return (
    <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="Cronograma de Gantt">
      {/* Cabeçalho com escala de semanas */}
      <div className="min-w-[800px]">
        <div className="flex border-b border-border bg-muted/30">
          {/* Coluna de nomes */}
          <div className="w-64 flex-shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">
            Tarefa / Marco
          </div>
          {/* Escala de tempo */}
          <div className="flex-1 relative flex">
            {colunasData.map((d) => (
              <div
                key={d.toISOString()}
                className="flex-1 border-r border-border/50 px-1 py-2 text-xs text-muted-foreground text-center"
                style={{ minWidth: '60px' }}
                aria-label={d.toLocaleDateString('pt-MZ')}
              >
                {d.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short' })}
              </div>
            ))}
          </div>
        </div>

        {/* Linha de hoje */}
        <div className="relative">

          {/* Tarefas */}
          {tarefasComDatas.map((tarefa) => {
            const inicio = tarefa.dataInicio ? new Date(tarefa.dataInicio) : new Date(projeto.dataInicio);
            const fim = tarefa.dataFimReal ? new Date(tarefa.dataFimReal) : new Date(tarefa.dataFimPrevista);
            const { left, width } = calcularLargura(inicio, fim, minDate, totalDias);
            const corPrioridade = PRIORIDADE_COR[tarefa.prioridade] ?? 'bg-primary/50';
            const opacidade = STATUS_OPACITY[tarefa.status] ?? '';

            return (
              <div key={tarefa.id} className="flex border-b border-border/50 hover:bg-muted/20 transition-colors">
                {/* Nome da tarefa */}
                <div className="w-64 flex-shrink-0 px-3 py-2 border-r border-border flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">{tarefa.codigo}</span>
                  <span className="text-sm truncate" title={tarefa.titulo}>{tarefa.titulo}</span>
                </div>
                {/* Barra de Gantt */}
                <div className="flex-1 relative py-1.5" style={{ minHeight: '36px' }}>
                  {/* Linha de hoje (posicionada relativamente) */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10"
                    style={{ left: `${hojeOffset}%` }}
                    aria-hidden="true"
                  />
                  {/* Barra da tarefa */}
                  <div
                    className={`absolute top-1.5 h-5 rounded ${corPrioridade} ${opacidade} flex items-center px-1 overflow-hidden`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                    role="graphics-object"
                    aria-label={`${tarefa.titulo}: ${inicio.toLocaleDateString('pt-MZ')} — ${fim.toLocaleDateString('pt-MZ')} (${tarefa.progresso}%)`}
                  >
                    {/* Progresso interno */}
                    <div
                      className="absolute inset-y-0 left-0 bg-primary-foreground/20 rounded"
                      style={{ width: `${tarefa.progresso}%` }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium text-primary-foreground relative z-10 truncate">
                      {tarefa.progresso > 0 ? `${tarefa.progresso}%` : ''}
                    </span>
                  </div>
                </div>
                {/* Status */}
                <div className="w-28 flex-shrink-0 px-2 py-2 flex items-center">
                  <StatusBadge status={tarefa.status} />
                </div>
              </div>
            );
          })}

          {/* Marcos */}
          {marcos.map((marco) => {
            const data = marco.dataReal ? new Date(marco.dataReal) : new Date(marco.dataPrevista);
            const offset = ((data.getTime() - minDate.getTime()) / (totalDias * 24 * 60 * 60 * 1000)) * 100;

            return (
              <div key={marco.id} className="flex border-b border-border/50 hover:bg-muted/20 transition-colors">
                <div className="w-64 flex-shrink-0 px-3 py-2 border-r border-border flex items-center gap-2">
                  <span className="text-xs text-warning font-bold" aria-hidden="true">◆</span>
                  <span className="text-sm truncate font-medium" title={marco.nome}>{marco.nome}</span>
                </div>
                <div className="flex-1 relative py-1.5" style={{ minHeight: '36px' }}>
                  <div
                    className="absolute top-0 bottom-0 w-px bg-destructive/60 z-10"
                    style={{ left: `${hojeOffset}%` }}
                    aria-hidden="true"
                  />
                  {/* Diamante de marco */}
                  <div
                    className="absolute top-1 w-4 h-4 rotate-45 bg-warning rounded-sm z-10"
                    style={{ left: `calc(${Math.max(0, Math.min(offset, 98))}% - 8px)` }}
                    role="graphics-object"
                    aria-label={`Marco: ${marco.nome} — ${data.toLocaleDateString('pt-MZ')}`}
                  />
                </div>
                <div className="w-28 flex-shrink-0 px-2 py-2 flex items-center">
                  <StatusBadge status={marco.status} />
                </div>
              </div>
            );
          })}

          {tarefasComDatas.length === 0 && marcos.length === 0 && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Nenhuma tarefa com datas definidas neste projecto.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
