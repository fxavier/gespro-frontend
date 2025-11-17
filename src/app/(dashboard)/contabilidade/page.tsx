
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  BookOpen,
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  BarChart3,
  Landmark,
  AlertCircle
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
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function ContabilidadeDashboardPage() {
  const receitasDespesas = [
    { mes: 'Jan', receitas: 850000, despesas: 620000 },
    { mes: 'Fev', receitas: 920000, despesas: 680000 },
    { mes: 'Mar', receitas: 780000, despesas: 590000 },
    { mes: 'Abr', receitas: 1050000, despesas: 750000 },
    { mes: 'Mai', receitas: 980000, despesas: 710000 },
    { mes: 'Jun', receitas: 1120000, despesas: 820000 }
  ];

  const despesasPorCategoria = [
    { categoria: 'Pessoal', valor: 450000, cor: '#0088FE' },
    { categoria: 'Operacional', valor: 280000, cor: '#00C49F' },
    { categoria: 'Marketing', valor: 120000, cor: '#FFBB28' },
    { categoria: 'Administrativa', valor: 180000, cor: '#FF8042' }
  ];

  const fluxoCaixa = [
    { mes: 'Jan', entradas: 850000, saidas: 620000, saldo: 230000 },
    { mes: 'Fev', entradas: 920000, saidas: 680000, saldo: 240000 },
    { mes: 'Mar', entradas: 780000, saidas: 590000, saldo: 190000 },
    { mes: 'Abr', entradas: 1050000, saidas: 750000, saldo: 300000 },
    { mes: 'Mai', entradas: 980000, saidas: 710000, saldo: 270000 },
    { mes: 'Jun', entradas: 1120000, saidas: 820000, saldo: 300000 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const estatisticas = {
    receitaMes: 1120000,
    despesaMes: 820000,
    lucroMes: 300000,
    margemLucro: 26.8,
    contasReceber: 450000,
    contasPagar: 280000,
    saldoCaixa: 520000,
    lancamentosPendentes: 8
  };

  const contasPendentes = [
    {
      tipo: 'receber',
      descricao: 'Fatura FT 2024/001 - Empresa ABC',
      valor: 125000,
      vencimento: '2024-02-15',
      dias: 5
    },
    {
      tipo: 'pagar',
      descricao: 'Fornecedor XYZ - Compra #456',
      valor: 78000,
      vencimento: '2024-02-10',
      dias: 0
    },
    {
      tipo: 'receber',
      descricao: 'Fatura FT 2024/003 - Cliente João',
      valor: 45000,
      vencimento: '2024-02-20',
      dias: 10
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Contabilidade</h1>
          <p className="text-muted-foreground">Visão geral financeira e contábil</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/contabilidade/dre">
              <BarChart3 className="h-4 w-4 mr-2" />
              DRE
            </Link>
          </Button>
          <Button asChild>
            <Link href="/contabilidade/lancamentos">
              <FileText className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <TrendingUp className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Despesa do Mês</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.despesaMes / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-red-600 mt-1">
                  MT {estatisticas.despesaMes.toLocaleString()}
                </p>
              </div>
              <TrendingDown className="h-10 w-10 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lucro do Mês</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.lucroMes / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Margem: {estatisticas.margemLucro}%
                </p>
              </div>
              <DollarSign className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo em Caixa</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.saldoCaixa / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  disponível
                </p>
              </div>
              <Landmark className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Receitas vs Despesas (6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                receitas: {
                  label: 'Receitas',
                  color: 'hsl(var(--chart-1))',
                },
                despesas: {
                  label: 'Despesas',
                  color: 'hsl(var(--chart-2))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={receitasDespesas}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="receitas" fill="#82ca9d" name="Receitas" />
                  <Bar dataKey="despesas" fill="#8884d8" name="Despesas" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                valor: {
                  label: 'Valor',
                  color: 'hsl(var(--chart-1))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={despesasPorCategoria}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ categoria, valor }) => `${categoria}: ${(valor / 1000).toFixed(0)}k`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="valor"
                  >
                    {despesasPorCategoria.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.cor} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo de Caixa (6 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              entradas: {
                label: 'Entradas',
                color: 'hsl(var(--chart-1))',
              },
              saidas: {
                label: 'Saídas',
                color: 'hsl(var(--chart-2))',
              },
              saldo: {
                label: 'Saldo',
                color: 'hsl(var(--chart-3))',
              },
            }}
            className="h-[300px]"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fluxoCaixa}>
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
                  dataKey="saidas"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="Saídas"
                />
                <Line
                  type="monotone"
                  dataKey="saldo"
                  stroke="#ffc658"
                  strokeWidth={2}
                  name="Saldo"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Contas Pendentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {contasPendentes.map((conta, index) => (
              <div key={index} className="flex items-start justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={conta.tipo === 'receber' ? 'default' : 'secondary'}>
                      {conta.tipo === 'receber' ? 'A Receber' : 'A Pagar'}
                    </Badge>
                    {conta.dias === 0 && (
                      <Badge variant="destructive">Vence Hoje</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{conta.descricao}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      MT {conta.valor.toLocaleString()}
                    </span>
                    <span>Vencimento: {new Date(conta.vencimento).toLocaleDateString('pt-PT')}</span>
                    <span>{conta.dias > 0 ? `${conta.dias} dias` : 'Hoje'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button variant="outline" asChild>
              <Link href="/fornecedores/contas-pagar">Ver Contas a Pagar</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/clientes">Ver Contas a Receber</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Contas a Receber</p>
                <p className="text-2xl font-bold">
                  MT {estatisticas.contasReceber.toLocaleString()}
                </p>
                <p className="text-xs text-green-600 mt-1">em aberto</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Contas a Pagar</p>
                <p className="text-2xl font-bold">
                  MT {estatisticas.contasPagar.toLocaleString()}
                </p>
                <p className="text-xs text-red-600 mt-1">em aberto</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
