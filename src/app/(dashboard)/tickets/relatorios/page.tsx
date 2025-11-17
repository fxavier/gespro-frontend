
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TicketStorage, CategoriaTicketStorage } from '@/lib/storage/ticket-storage';
import { Ticket } from '@/types/ticket';
import { FileSpreadsheet, Download, TrendingUp, Clock, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function RelatoriosTickets() {
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
    resolvidos: tickets.filter(t => ['resolvido', 'fechado'].includes(t.status)).length,
    emAtraso: tickets.filter(t => t.sla.emAtraso).length,
    avaliacaoMedia: tickets.filter(t => t.avaliacao).reduce((acc, t) => acc + (t.avaliacao?.nota || 0), 0) / 
                    tickets.filter(t => t.avaliacao).length || 0
  };

  const porCategoria = CategoriaTicketStorage.getCategorias().map(cat => ({
    name: cat.nome,
    value: tickets.filter(t => t.categoria === cat.nome).length
  }));

  const porMes = [
    { mes: 'Jan', tickets: 45 },
    { mes: 'Fev', tickets: 52 },
    { mes: 'Mar', tickets: 48 },
    { mes: 'Abr', tickets: 61 },
    { mes: 'Mai', tickets: 55 },
    { mes: 'Jun', tickets: 67 }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-8 w-8" />
            Relatórios de Tickets
          </h1>
          <p className="text-muted-foreground">Análises e métricas de desempenho</p>
        </div>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          Exportar Relatório
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Tickets</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Todos os períodos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Resolução</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.total > 0 ? ((stats.resolvidos / stats.total) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.resolvidos} resolvidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cumprimento SLA</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.total > 0 ? (((stats.total - stats.emAtraso) / stats.total) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.emAtraso} em atraso
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Satisfação Média</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avaliacaoMedia.toFixed(1)}/5</div>
            <p className="text-xs text-muted-foreground">
              Baseado em avaliações
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tickets por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={porMes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={porCategoria}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {porCategoria.map((entry, index) => (
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
          <CardTitle>Resumo Executivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h3 className="font-semibold">Desempenho Geral</h3>
              <p className="text-sm text-muted-foreground">
                O sistema processou {stats.total} tickets com uma taxa de resolução de{' '}
                {stats.total > 0 ? ((stats.resolvidos / stats.total) * 100).toFixed(1) : 0}%.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Qualidade do Atendimento</h3>
              <p className="text-sm text-muted-foreground">
                A satisfação média dos clientes é de {stats.avaliacaoMedia.toFixed(1)}/5,
                indicando um bom nível de qualidade no atendimento.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Cumprimento de SLA</h3>
              <p className="text-sm text-muted-foreground">
                {stats.total > 0 ? (((stats.total - stats.emAtraso) / stats.total) * 100).toFixed(1) : 0}%
                dos tickets foram resolvidos dentro do prazo estabelecido.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
