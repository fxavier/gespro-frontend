
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjetoStorage, TarefaStorage, TimesheetStorage } from '@/lib/storage/projeto-storage';
import { Projeto, Tarefa, RegistroTempo } from '@/types/projeto';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, CheckCircle, AlertTriangle } from 'lucide-react';

export default function RelatoriosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [registros, setRegistros] = useState<RegistroTempo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProjetos(ProjetoStorage.getProjetos());
    setTarefas(TarefaStorage.getTarefas());
    setRegistros(TimesheetStorage.getRegistros());
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  const totalProjetos = projetos.length;
  const projetosAtivos = projetos.filter(p => p.status === 'em_andamento').length;
  const projetosConcluidos = projetos.filter(p => p.status === 'concluido').length;
  const projetosAtrasados = projetos.filter(p => {
    const dias = Math.ceil((new Date(p.dataFimPrevista).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return dias < 0 && p.status !== 'concluido';
  }).length;

  const totalTarefas = tarefas.length;
  const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida').length;
  const tarefasEmProgresso = tarefas.filter(t => t.status === 'em_progresso').length;
  const tarefasBloqueadas = tarefas.filter(t => t.status === 'bloqueada').length;

  const totalHoras = registros.reduce((acc, r) => acc + r.duracaoHoras, 0);
  const horasFaturadas = registros.filter(r => r.faturavel).reduce((acc, r) => acc + r.duracaoHoras, 0);

  const orcamentoTotal = projetos.reduce((acc, p) => acc + p.orcamento.planejado, 0);
  const orcamentoUtilizado = projetos.reduce((acc, p) => acc + p.orcamento.utilizado, 0);

  const statusData = [
    { name: 'Planejamento', value: projetos.filter(p => p.status === 'planejamento').length },
    { name: 'Em Andamento', value: projetosAtivos },
    { name: 'Concluído', value: projetosConcluidos },
    { name: 'Pausado', value: projetos.filter(p => p.status === 'pausado').length },
    { name: 'Cancelado', value: projetos.filter(p => p.status === 'cancelado').length },
  ];

  const tarefasData = [
    { name: 'A Fazer', value: tarefas.filter(t => t.status === 'a_fazer').length },
    { name: 'Em Progresso', value: tarefasEmProgresso },
    { name: 'Em Revisão', value: tarefas.filter(t => t.status === 'em_revisao').length },
    { name: 'Concluída', value: tarefasConcluidas },
    { name: 'Bloqueada', value: tarefasBloqueadas },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const projetosPorProgresso = projetos.map(p => ({
    nome: p.nome.substring(0, 10),
    progresso: p.progresso,
  }));

  const orcamentoData = [
    { name: 'Planejado', value: orcamentoTotal },
    { name: 'Utilizado', value: orcamentoUtilizado },
    { name: 'Restante', value: orcamentoTotal - orcamentoUtilizado },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Relatórios e Análises</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total de Projetos
              </p>
              <p className="text-3xl font-bold">{totalProjetos}</p>
              <p className="text-xs text-muted-foreground">{projetosAtivos} ativos</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Tarefas Concluídas
              </p>
              <p className="text-3xl font-bold">{tarefasConcluidas}</p>
              <p className="text-xs text-muted-foreground">de {totalTarefas} tarefas</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Projetos Atrasados
              </p>
              <p className="text-3xl font-bold">{projetosAtrasados}</p>
              <p className="text-xs text-muted-foreground">requerem atenção</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Horas Trabalhadas
              </p>
              <p className="text-3xl font-bold">{totalHoras.toFixed(0)}h</p>
              <p className="text-xs text-muted-foreground">{horasFaturadas.toFixed(0)}h faturadas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status dos Projetos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status das Tarefas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tarefasData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tarefasData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progresso dos Projetos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={projetosPorProgresso}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="progresso" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Análise de Orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={orcamentoData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => `MT ${(Number(value) / 1000).toFixed(0)}k`} />
              <Bar dataKey="value" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Orçamento Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Planejado</p>
                <p className="text-2xl font-bold">MT {(orcamentoTotal / 1000).toFixed(0)}k</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Utilizado</p>
                <p className="text-2xl font-bold">MT {(orcamentoUtilizado / 1000).toFixed(0)}k</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Restante</p>
                <p className="text-2xl font-bold">MT {((orcamentoTotal - orcamentoUtilizado) / 1000).toFixed(0)}k</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taxa de Conclusão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Projetos</p>
                <p className="text-2xl font-bold">{((projetosConcluidos / totalProjetos) * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tarefas</p>
                <p className="text-2xl font-bold">{((tarefasConcluidas / totalTarefas) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtividade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Horas Totais</p>
                <p className="text-2xl font-bold">{totalHoras.toFixed(0)}h</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxa Faturação</p>
                <p className="text-2xl font-bold">{((horasFaturadas / totalHoras) * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
