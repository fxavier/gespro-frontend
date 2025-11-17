
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  RotateCcw,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function VendasDashboardPage() {
  const vendasPorDia = [
    { dia: 'Seg', vendas: 45, valor: 125000 },
    { dia: 'Ter', vendas: 52, valor: 148000 },
    { dia: 'Qua', vendas: 48, valor: 135000 },
    { dia: 'Qui', vendas: 61, valor: 172000 },
    { dia: 'Sex', vendas: 55, valor: 156000 },
    { dia: 'Sáb', vendas: 67, valor: 189000 },
    { dia: 'Dom', vendas: 43, valor: 118000 }
  ];

  const produtosMaisVendidos = [
    { nome: 'Arroz 25kg', quantidade: 245, valor: 300625 },
    { nome: 'Óleo 1L', quantidade: 189, valor: 28350 },
    { nome: 'Coca-Cola 500ml', quantidade: 567, valor: 28350 },
    { nome: 'Detergente 1L', quantidade: 234, valor: 15210 },
    { nome: 'Açúcar 1kg', quantidade: 198, valor: 17820 }
  ];

  const vendasPorMetodo = [
    { metodo: 'Dinheiro', valor: 450000, percentual: 45 },
    { metodo: 'M-Pesa', valor: 300000, percentual: 30 },
    { metodo: 'Cartão', valor: 200000, percentual: 20 },
    { metodo: 'Transferência', valor: 50000, percentual: 5 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const estatisticas = {
    vendasHoje: 45,
    faturamentoHoje: 125000,
    ticketMedio: 2777.78,
    clientesAtendidos: 38,
    crescimentoVendas: 12.5,
    crescimentoFaturamento: 8.3,
    devolucoes: 3,
    taxaDevolucao: 6.7
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Vendas</h1>
          <p className="text-muted-foreground">Visão geral do desempenho de vendas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/vendas/historico">
              <TrendingUp className="h-4 w-4 mr-2" />
              Ver Histórico
            </Link>
          </Button>
          <Button asChild>
            <Link href="/pos">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Nova Venda
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendas Hoje</p>
                <p className="text-3xl font-bold">{estatisticas.vendasHoje}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-600">+{estatisticas.crescimentoVendas}%</span>
                </div>
              </div>
              <ShoppingCart className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Faturamento Hoje</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.faturamentoHoje / 1000).toFixed(0)}k
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-600">+{estatisticas.crescimentoFaturamento}%</span>
                </div>
              </div>
              <DollarSign className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-3xl font-bold">
                  MT {estatisticas.ticketMedio.toFixed(0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  por venda
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clientes Atendidos</p>
                <p className="text-3xl font-bold">{estatisticas.clientesAtendidos}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  hoje
                </p>
              </div>
              <Users className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendas da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                vendas: {
                  label: 'Vendas',
                  color: 'hsl(var(--chart-1))',
                },
                valor: {
                  label: 'Valor (MT)',
                  color: 'hsl(var(--chart-2))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vendasPorDia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="vendas"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="Vendas"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="valor"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name="Valor (MT)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vendas por Método de Pagamento</CardTitle>
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
                <PieChart>
                  <Pie
                    data={vendasPorMetodo}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ metodo, percentual }) => `${metodo} ${percentual}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="valor"
                  >
                    {vendasPorMetodo.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Produtos Mais Vendidos</CardTitle>
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
              <BarChart data={produtosMaisVendidos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="quantidade" fill="#8884d8" name="Quantidade Vendida" />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Devoluções</p>
                <p className="text-2xl font-bold">{estatisticas.devolucoes}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Taxa: {estatisticas.taxaDevolucao}%
                </p>
              </div>
              <RotateCcw className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Produtos Vendidos</p>
                <p className="text-2xl font-bold">1,433</p>
                <p className="text-xs text-muted-foreground mt-1">
                  unidades hoje
                </p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Meta do Mês</p>
                <p className="text-2xl font-bold">78%</p>
                <p className="text-xs text-green-600 mt-1">
                  MT 780k de MT 1M
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
