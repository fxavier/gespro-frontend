
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Archive,
  Package,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  BarChart3,
  ArrowRightLeft,
  Minus,
  RefreshCw
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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

export default function InventarioDashboardPage() {
  // Dados simulados para ativos empresariais
  const movimentacoesPorTipo = [
    { tipo: 'Entrada', quantidade: 45, cor: '#00C49F' },
    { tipo: 'Transferência', quantidade: 120, cor: '#8884d8' },
    { tipo: 'Empréstimo', quantidade: 38, cor: '#FFBB28' },
    { tipo: 'Baixa', quantidade: 12, cor: '#FF8042' }
  ];

  const valorInventarioPorCategoria = [
    { categoria: 'Informática', valor: 6800000 },
    { categoria: 'Transporte', valor: 4200000 },
    { categoria: 'Mobiliário', valor: 2100000 },
    { categoria: 'Equipamento Médico', valor: 1850000 },
    { categoria: 'Ferramentas', valor: 800000 }
  ];

  const movimentacoesMensais = [
    { mes: 'Jan', entradas: 23, transferencias: 45 },
    { mes: 'Fev', entradas: 34, transferencias: 38 },
    { mes: 'Mar', entradas: 28, transferencias: 52 },
    { mes: 'Abr', entradas: 41, transferencias: 41 },
    { mes: 'Mai', entradas: 35, transferencias: 47 },
    { mes: 'Jun', entradas: 29, transferencias: 44 }
  ];

  const COLORS = ['#00C49F', '#8884d8', '#FFBB28', '#FF8042'];

  const estatisticas = {
    totalItens: 1247,
    valorTotal: 15750000,
    itensCriticos: 23,
    itensSemStock: 0,
    entradasMes: 29,
    saidasMes: 16,
    transferencias: 44,
    abates: 5,
    acuracidadeInventario: 98.2
  };

  const ativosCriticos = [
    { nome: 'Computador Dell OptiPlex', responsavel: 'TI', manutencaoVencida: true, percentual: 15 },
    { nome: 'Impressora HP LaserJet', responsavel: 'Administração', manutencaoVencida: true, percentual: 30 },
    { nome: 'Toyota Hilux 2020', responsavel: 'Logística', manutencaoVencida: false, percentual: 75 },
    { nome: 'Servidor Dell PowerEdge', responsavel: 'TI', manutencaoVencida: true, percentual: 10 }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Inventário</h1>
          <p className="text-muted-foreground">Visão geral do inventário e movimentações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/inventario/transferencias">
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transferências
            </Link>
          </Button>
          <Button asChild>
            <Link href="/inventario/reconciliacao">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reconciliação
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Itens</p>
                <p className="text-3xl font-bold">{estatisticas.totalItens}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  em inventário
                </p>
              </div>
              <Archive className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.valorTotal / 1000000).toFixed(1)}M
                </p>
                <p className="text-xs text-green-600 mt-1">
                  MT {estatisticas.valorTotal.toLocaleString()}
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
                <p className="text-sm text-muted-foreground">Itens Críticos</p>
                <p className="text-3xl font-bold text-orange-600">{estatisticas.itensCriticos}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {estatisticas.itensSemStock} sem stock
                </p>
              </div>
              <AlertTriangle className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Acurácia</p>
                <p className="text-3xl font-bold">{estatisticas.acuracidadeInventario}%</p>
                <p className="text-xs text-green-600 mt-1">
                  inventário
                </p>
              </div>
              <BarChart3 className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Movimentações por Tipo</CardTitle>
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
                    data={movimentacoesPorTipo}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ tipo, quantidade }) => `${tipo}: ${quantidade}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="quantidade"
                  >
                    {movimentacoesPorTipo.map((entry, index) => (
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
            <CardTitle>Movimentações Mensais</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                entradas: {
                  label: 'Entradas',
                  color: 'hsl(var(--chart-1))',
                },
                transferencias: {
                  label: 'Transferências',
                  color: 'hsl(var(--chart-2))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={movimentacoesMensais}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name="Entradas"
                  />
                  <Line
                    type="monotone"
                    dataKey="transferencias"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="Transferências"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valor de Inventário por Categoria</CardTitle>
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
              <BarChart data={valorInventarioPorCategoria}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="categoria" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="valor" fill="#8884d8" name="Valor (MT)" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Ativos Críticos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ativosCriticos.map((ativo, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{ativo.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      Responsável: {ativo.responsavel}
                      {ativo.manutencaoVencida && ' • Manutenção Vencida'}
                    </p>
                  </div>
                  <Badge variant={ativo.percentual < 30 ? 'destructive' : 'secondary'}>
                    {ativo.percentual}%
                  </Badge>
                </div>
                <Progress value={ativo.percentual} className="h-2" />
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full mt-4" asChild>
            <Link href="/inventario/ativos">Ver Todos os Ativos</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entradas (Mês)</p>
                <p className="text-2xl font-bold">{estatisticas.entradasMes}</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-600">movimentações</span>
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saídas (Mês)</p>
                <p className="text-2xl font-bold">{estatisticas.saidasMes}</p>
                <div className="flex items-center gap-1 mt-1">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-xs text-red-600">movimentações</span>
                </div>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Transferências</p>
                <p className="text-2xl font-bold">{estatisticas.transferencias}</p>
                <p className="text-xs text-muted-foreground mt-1">este mês</p>
              </div>
              <ArrowRightLeft className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Abates</p>
                <p className="text-2xl font-bold">{estatisticas.abates}</p>
                <p className="text-xs text-muted-foreground mt-1">este mês</p>
              </div>
              <Minus className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
