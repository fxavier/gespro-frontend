
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ClipboardList,
  FileText,
  FileCheck,
  Truck,
  UserCheck,
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle
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

export default function ProcurementDashboardPage() {
  const requisicoesStatus = [
    { status: 'Pendente', quantidade: 12, cor: '#FFBB28' },
    { status: 'Em Aprovação', quantidade: 8, cor: '#0088FE' },
    { status: 'Aprovada', quantidade: 25, cor: '#00C49F' },
    { status: 'Rejeitada', quantidade: 3, cor: '#FF8042' }
  ];

  const requisicoesValor = [
    { mes: 'Jan', valor: 450000 },
    { mes: 'Fev', valor: 520000 },
    { mes: 'Mar', valor: 480000 },
    { mes: 'Abr', valor: 610000 },
    { mes: 'Mai', valor: 580000 },
    { mes: 'Jun', valor: 650000 }
  ];

  const departamentos = [
    { nome: 'TI', requisicoes: 45 },
    { nome: 'Operações', requisicoes: 38 },
    { nome: 'Vendas', requisicoes: 32 },
    { nome: 'Administrativo', requisicoes: 28 },
    { nome: 'RH', requisicoes: 15 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const estatisticas = {
    requisicoesAbertas: 48,
    aguardandoAprovacao: 12,
    pedidosEmAndamento: 23,
    valorTotalMes: 650000,
    tempoMedioAprovacao: 2.5,
    taxaAprovacao: 89,
    fornecedoresAtivos: 45,
    cotacoesAbertas: 8
  };

  const requisicoesRecentes = [
    {
      id: '1',
      numero: 'REQ-2024-001',
      departamento: 'TI',
      solicitante: 'João Silva',
      valor: 45000,
      status: 'em_aprovacao',
      data: '2024-01-15'
    },
    {
      id: '2',
      numero: 'REQ-2024-002',
      departamento: 'Operações',
      solicitante: 'Maria Costa',
      valor: 32000,
      status: 'aprovada',
      data: '2024-01-14'
    },
    {
      id: '3',
      numero: 'REQ-2024-003',
      departamento: 'Vendas',
      solicitante: 'Carlos Santos',
      valor: 18000,
      status: 'pendente',
      data: '2024-01-13'
    }
  ];

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      pendente: { variant: 'secondary', label: 'Pendente' },
      em_aprovacao: { variant: 'default', label: 'Em Aprovação' },
      aprovada: { variant: 'default', label: 'Aprovada' },
      rejeitada: { variant: 'destructive', label: 'Rejeitada' }
    };
    return badges[status] || badges.pendente;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Procurement</h1>
          <p className="text-muted-foreground">Visão geral das requisições e processos de compra</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/procurement/cotacoes">
              <FileText className="h-4 w-4 mr-2" />
              Cotações
            </Link>
          </Button>
          <Button asChild>
            <Link href="/procurement/requisicoes/nova">
              <ClipboardList className="h-4 w-4 mr-2" />
              Nova Requisição
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Requisições Abertas</p>
                <p className="text-3xl font-bold">{estatisticas.requisicoesAbertas}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {estatisticas.aguardandoAprovacao} aguardando aprovação
                </p>
              </div>
              <ClipboardList className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total (Mês)</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.valorTotalMes / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-green-600 mt-1">
                  MT {estatisticas.valorTotalMes.toLocaleString()}
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
                <p className="text-sm text-muted-foreground">Tempo Médio Aprovação</p>
                <p className="text-3xl font-bold">{estatisticas.tempoMedioAprovacao}</p>
                <p className="text-xs text-muted-foreground mt-1">dias</p>
              </div>
              <Clock className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Aprovação</p>
                <p className="text-3xl font-bold">{estatisticas.taxaAprovacao}%</p>
                <p className="text-xs text-muted-foreground mt-1">
                  últimos 30 dias
                </p>
              </div>
              <CheckCircle className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Requisições por Status</CardTitle>
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
                    data={requisicoesStatus}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ status, quantidade }) => `${status}: ${quantidade}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="quantidade"
                  >
                    {requisicoesStatus.map((entry, index) => (
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
            <CardTitle>Valor de Requisições (6 meses)</CardTitle>
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
                <LineChart data={requisicoesValor}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="Valor (MT)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requisições por Departamento</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              requisicoes: {
                label: 'Requisições',
                color: 'hsl(var(--chart-1))',
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departamentos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="requisicoes" fill="#8884d8" name="Requisições" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Requisições Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {requisicoesRecentes.map((req) => {
              const statusInfo = getStatusBadge(req.status);
              return (
                <div key={req.id} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{req.numero}</span>
                      <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{req.departamento} - {req.solicitante}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        MT {req.valor.toLocaleString()}
                      </span>
                      <span>{new Date(req.data).toLocaleDateString('pt-PT')}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/procurement/requisicoes/${req.id}`}>Ver</Link>
                  </Button>
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="w-full mt-4" asChild>
            <Link href="/procurement/requisicoes">Ver todas as requisições</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link href="/procurement/requisicoes" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <ClipboardList className="h-8 w-8 text-blue-600 mb-2" />
                <p className="font-medium">Requisições</p>
                <p className="text-2xl font-bold">{estatisticas.requisicoesAbertas}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/procurement/cotacoes" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <FileText className="h-8 w-8 text-green-600 mb-2" />
                <p className="font-medium">Cotações</p>
                <p className="text-2xl font-bold">{estatisticas.cotacoesAbertas}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/procurement/pedidos" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <FileCheck className="h-8 w-8 text-purple-600 mb-2" />
                <p className="font-medium">Pedidos</p>
                <p className="text-2xl font-bold">{estatisticas.pedidosEmAndamento}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/procurement/recebimentos" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Truck className="h-8 w-8 text-orange-600 mb-2" />
                <p className="font-medium">Recebimentos</p>
                <p className="text-2xl font-bold">15</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/procurement/aprovacoes" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <UserCheck className="h-8 w-8 text-red-600 mb-2" />
                <p className="font-medium">Aprovações</p>
                <p className="text-2xl font-bold">{estatisticas.aguardandoAprovacao}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
