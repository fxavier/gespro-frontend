
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Receipt,
  FileText,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users,
  Calendar
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function FaturacaoDashboardPage() {
  const faturasPorStatus = [
    { status: 'Emitida', quantidade: 45, cor: '#0088FE' },
    { status: 'Paga', quantidade: 120, cor: '#00C49F' },
    { status: 'Vencida', quantidade: 8, cor: '#FF8042' },
    { status: 'Cancelada', quantidade: 3, cor: '#FFBB28' }
  ];

  const receitaMensal = [
    { mes: 'Jan', receita: 850000, faturas: 95 },
    { mes: 'Fev', receita: 920000, faturas: 102 },
    { mes: 'Mar', receita: 780000, faturas: 88 },
    { mes: 'Abr', receita: 1050000, faturas: 115 },
    { mes: 'Mai', receita: 980000, faturas: 108 },
    { mes: 'Jun', receita: 1120000, faturas: 125 }
  ];

  const clientesMaisFaturados = [
    { nome: 'Empresa ABC Lda', valor: 450000 },
    { nome: 'João Silva', valor: 320000 },
    { nome: 'Maria Costa', valor: 280000 },
    { nome: 'Empresa XYZ SA', valor: 250000 },
    { nome: 'Carlos Santos', valor: 180000 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const estatisticas = {
    faturasEmitidas: 176,
    faturasPagas: 120,
    faturasVencidas: 8,
    receitaMes: 1120000,
    receitaPendente: 450000,
    ticketMedio: 6363.64,
    tempoMedioPagamento: 18,
    taxaRecebimento: 92
  };

  const faturasRecentes = [
    {
      id: '1',
      numero: 'FT 2024/001',
      cliente: 'Empresa ABC Lda',
      valor: 125000,
      status: 'paga',
      dataEmissao: '2024-01-15',
      dataVencimento: '2024-02-15'
    },
    {
      id: '2',
      numero: 'FT 2024/002',
      cliente: 'João Silva',
      valor: 45000,
      status: 'emitida',
      dataEmissao: '2024-01-14',
      dataVencimento: '2024-02-14'
    },
    {
      id: '3',
      numero: 'FT 2024/003',
      cliente: 'Maria Costa',
      valor: 78000,
      status: 'vencida',
      dataEmissao: '2023-12-10',
      dataVencimento: '2024-01-10'
    }
  ];

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      emitida: { variant: 'default', label: 'Emitida' },
      paga: { variant: 'default', label: 'Paga' },
      vencida: { variant: 'destructive', label: 'Vencida' },
      cancelada: { variant: 'secondary', label: 'Cancelada' }
    };
    return badges[status] || badges.emitida;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Faturação</h1>
          <p className="text-muted-foreground">Visão geral das faturas e receitas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/faturacao/cotacoes">
              <FileText className="h-4 w-4 mr-2" />
              Cotações
            </Link>
          </Button>
          <Button asChild>
            <Link href="/faturacao/nova">
              <Receipt className="h-4 w-4 mr-2" />
              Nova Fatura
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Faturas Emitidas</p>
                <p className="text-3xl font-bold">{estatisticas.faturasEmitidas}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {estatisticas.faturasPagas} pagas
                </p>
              </div>
              <Receipt className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita do Mês</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.receitaMes / 1000000).toFixed(1)}M
                </p>
                <p className="text-xs text-green-600 mt-1">
                  MT {estatisticas.receitaMes.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Pendente</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.receitaPendente / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  {estatisticas.faturasVencidas} vencidas
                </p>
              </div>
              <Clock className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.ticketMedio / 1000).toFixed(1)}k
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  por fatura
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Faturas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                quantidade: {
                  label: 'Quantidade',
                  color: 'hsl(var(--chart-1))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={faturasPorStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ status, quantidade }) => `${status}: ${quantidade}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="quantidade"
                  >
                    {faturasPorStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.cor} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita Mensal (6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                receita: {
                  label: 'Receita (MT)',
                  color: 'hsl(var(--chart-1))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={receitaMensal}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="receita"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name="Receita (MT)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clientes Mais Faturados</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              valor: {
                label: 'Valor (MT)',
                color: 'hsl(var(--chart-1))',
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientesMaisFaturados} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="nome" type="category" width={150} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="valor" fill="#8884d8" name="Valor (MT)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Faturas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {faturasRecentes.map((fatura) => {
              const statusInfo = getStatusBadge(fatura.status);
              return (
                <div key={fatura.id} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{fatura.numero}</span>
                      <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{fatura.cliente}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        MT {fatura.valor.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Venc: {new Date(fatura.dataVencimento).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Ver</Button>
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="w-full mt-4" asChild>
            <Link href="/faturacao">Ver todas as faturas</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio Pagamento</p>
                <p className="text-2xl font-bold">{estatisticas.tempoMedioPagamento}</p>
                <p className="text-xs text-muted-foreground mt-1">dias</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Recebimento</p>
                <p className="text-2xl font-bold">{estatisticas.taxaRecebimento}%</p>
                <p className="text-xs text-green-600 mt-1">últimos 30 dias</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Faturas Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.faturasVencidas}</p>
                <p className="text-xs text-muted-foreground mt-1">requer atenção</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
