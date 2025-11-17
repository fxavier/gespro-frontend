
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjetoStorage } from '@/lib/storage/projeto-storage';
import { Projeto } from '@/types/projeto';
import { Calendar, TrendingUp } from 'lucide-react';

export default function CronogramaPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const data = ProjetoStorage.getProjetos();
    setProjetos(data.sort((a, b) => new Date(a.dataFimPrevista).getTime() - new Date(b.dataFimPrevista).getTime()));
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  const getProgressColor = (progresso: number) => {
    if (progresso < 25) return 'bg-red-500';
    if (progresso < 50) return 'bg-yellow-500';
    if (progresso < 75) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const hoje = new Date();
  const diasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim);
    const dias = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return dias;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Cronograma de Projetos</h1>
      </div>

      <div className="space-y-4">
        {projetos.map((projeto) => {
          const dias = diasRestantes(projeto.dataFimPrevista);
          const isAtrasado = dias < 0;
          const isProximo = dias >= 0 && dias <= 7;

          return (
            <Card key={projeto.id} className={isAtrasado ? 'border-red-500' : isProximo ? 'border-yellow-500' : ''}>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{projeto.nome}</h3>
                      <p className="text-sm text-muted-foreground">{projeto.codigo}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${isAtrasado ? 'text-red-600' : isProximo ? 'text-yellow-600' : 'text-green-600'}`}>
                        {isAtrasado ? `${Math.abs(dias)} dias atrasado` : `${dias} dias restantes`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Fim: {new Date(projeto.dataFimPrevista).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Progresso</span>
                      <span className="text-sm font-bold">{projeto.progresso}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${getProgressColor(projeto.progresso)}`}
                        style={{ width: `${projeto.progresso}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Início</p>
                      <p className="font-medium">{new Date(projeto.dataInicio).toLocaleDateString('pt-PT')}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Duração</p>
                      <p className="font-medium">
                        {Math.ceil((new Date(projeto.dataFimPrevista).getTime() - new Date(projeto.dataInicio).getTime()) / (1000 * 60 * 60 * 24))} dias
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Gerente</p>
                      <p className="font-medium">{projeto.gerenteNome}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
