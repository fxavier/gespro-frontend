
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TicketStorage, CategoriaTicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { 
  Ticket as TicketIcon, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Users,
  Timer,
  Star
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

const COLORS = {
  baixa: '#10b981',
  normal: '#3b82f6',
  alta: '#f59e0b',
  urgente: '#ef4444'
};

export default function TicketsDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    const ticketsData = TicketStorage.getTickets();
    setTickets(ticketsData);
    setLoading(false);
  };

  const stats = {
    total: tickets.length,
    abertos: tickets.filter(t => t.status === 'aberto').length,
    emProgresso: tickets.filter(t => t.status === 'em_progresso').length,
    resolvidos: tickets.filter(t => t.status === 'resolvido').length,
    fechados: tickets.filter(t => t.status === 'fechado').length,
    emAtraso: tickets.filter(t => t.sla.emAtraso && !['resolvido', 'fechado'].includes(t.status)).length
  };

  const porPrioridade = [
    { name: 'Baixa', value: tickets.filter(t => t.prioridade === 'baixa').length, color: COLORS.baixa },
    { name: 'Normal', value: tickets.filter(t => t.prioridade === 'normal').length, color: COLORS.normal },
    { name: 'Alta', value: tickets.filter(t => t.prioridade === 'alta').length, color: COLORS.alta },
    { name: 'Urgente', value: tickets.filter(t => t.prioridade === 'urgente').length, color: COLORS.urgente }
  ];

  const porStatus = [
    { name: 'Aberto', value: stats.abertos },
    { name: 'Em Progresso', value: stats.emProgresso },
    { name: 'Resolvido', value: stats.resolvidos },
    { name: 'Fechado', value: stats.fechados }
  ];

  const categorias = CategoriaTicketStorage.getCategorias();
  const porCategoria = categorias.map(cat => ({
    name: cat.nome,
    value: tickets.filter(t => t.categoria === cat.nome).length
  }));

  const ticketsRecentes = tickets
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
    .slice(0, 5);

  const tempoMedioResolucao = tickets
    .filter(t => t.tempos.tempoResolucao)
    .reduce((acc, t) => acc + (t.tempos.tempoResolucao || 0), 0) / 
    tickets.filter(t => t.tempos.tempoResolucao).length || 0;

  const avaliacaoMedia = tickets
    .filter(t => t.avaliacao)
    .reduce((acc, t) => acc + (t.avaliacao?.nota || 0), 0) / 
    tickets.filter(t => t.avaliacao).length || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Tickets</h1>
          <p className="text-muted-foreground">Visão geral do sistema de suporte</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tickets</CardTitle>
            <TicketIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.abertos} abertos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Progresso</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.emProgresso}</div>
            <p className="text-xs text-muted-foreground">
              Sendo atendidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolvidos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.resolvidos}</div>
            <p className="text-xs text-muted-foreground">
              Aguardando fechamento
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Atraso</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.emAtraso}</div>
            <p className="text-xs text-muted-foreground">
              Fora do SLA
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porStatus}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets por Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={porPrioridade}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {porPrioridade.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porCategoria} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Métricas de Desempenho</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Tempo Médio de Resolução</span>
              </div>
              <span className="font-bold">
                {tempoMedioResolucao.toFixed(1)}h
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">Avaliação Média</span>
              </div>
              <span className="font-bold">
                {avaliacaoMedia.toFixed(1)}/5
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm">Taxa de Resolução</span>
              </div>
              <span className="font-bold">
                {stats.total > 0 ? ((stats.resolvidos + stats.fechados) / stats.total * 100).toFixed(1) : 0}%
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Cumprimento de SLA</span>
              </div>
              <span className="font-bold">
                {stats.total > 0 ? ((stats.total - stats.emAtraso) / stats.total * 100).toFixed(1) : 0}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tickets Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ticketsRecentes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum ticket encontrado
              </p>
            ) : (
              ticketsRecentes.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ticket.numero}</span>
                      <Badge variant={
                        ticket.prioridade === 'urgente' ? 'destructive' :
                        ticket.prioridade === 'alta' ? 'default' :
                        'secondary'
                      }>
                        {ticket.prioridade}
                      </Badge>
                      {ticket.sla.emAtraso && (
                        <Badge variant="destructive">Em Atraso</Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1">{ticket.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {ticket.solicitanteNome} • {ticket.categoria}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {ticket.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
