
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TarefaStorage } from '@/lib/storage/projeto-storage';
import { Tarefa } from '@/types/projeto';
import { Badge } from '@/components/ui/badge';

export default function KanbanPage() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const data = TarefaStorage.getTarefas();
    setTarefas(data);
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  const colunas = [
    { id: 'a_fazer', titulo: 'A Fazer', cor: 'bg-gray-100' },
    { id: 'em_progresso', titulo: 'Em Progresso', cor: 'bg-blue-100' },
    { id: 'em_revisao', titulo: 'Em Revisão', cor: 'bg-yellow-100' },
    { id: 'concluida', titulo: 'Concluída', cor: 'bg-green-100' },
  ];

  const getPrioridadeBadge = (prioridade: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      baixa: { variant: 'secondary', label: 'Baixa' },
      media: { variant: 'default', label: 'Média' },
      alta: { variant: 'destructive', label: 'Alta' },
      critica: { variant: 'destructive', label: 'Crítica' }
    };
    return badges[prioridade] || badges.media;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Quadro Kanban</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {colunas.map((coluna) => {
          const tarefasColuna = tarefas.filter(t => t.status === coluna.id);
          return (
            <div key={coluna.id} className={`${coluna.cor} rounded-lg p-4 min-h-96`}>
              <h2 className="font-bold text-lg mb-4">{coluna.titulo} ({tarefasColuna.length})</h2>
              <div className="space-y-3">
                {tarefasColuna.map((tarefa) => (
                  <Card key={tarefa.id} className="cursor-move hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <p className="font-medium text-sm">{tarefa.titulo}</p>
                        <p className="text-xs text-muted-foreground">{tarefa.codigo}</p>
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant={getPrioridadeBadge(tarefa.prioridade).variant as any} className="text-xs">
                            {getPrioridadeBadge(tarefa.prioridade).label}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {tarefa.tipo}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tarefa.dataFimPrevista).toLocaleDateString('pt-PT')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
