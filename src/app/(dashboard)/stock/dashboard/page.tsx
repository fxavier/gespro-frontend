
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Package,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  PackageOpen,
  PackagePlus
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function StockDashboardPage() {
  const movimentacoesPorDia = [
    { dia: 'Seg', entradas: 120, saidas: 85 },
    { dia: 'Ter', entradas: 95, saidas: 102 },
    { dia: 'Qua', entradas: 150, saidas: 98 },
    { dia: 'Qui', entradas: 80, saidas: 115 },
    { dia: 'Sex', entradas: 110, saidas: 92 },
    { dia: 'Sáb', entradas: 65, saidas: 78 },
    { dia: 'Dom', entradas: 45, saidas: 56 }
  ];

  const categoriasMaisMovimentadas = [
    { categoria: 'Alimentos', movimentacoes: 450 },
    { categoria: 'Bebidas', movimentacoes: 320 },
    { categoria: 'Limpeza', movimentacoes: 280 },
    { categoria: 'Higiene', movimentacoes: 210 },
    { categoria: 'Eletrônicos', movimentacoes: 150 }
  ];

  const produtosStockBaixo = [
    { nome: 'Arroz 25kg', stockAtual: 15, stockMinimo: 50, percentual: 30 },
    { nome: 'Óleo 1L', stockAtual: 25, stockMinimo: 100, percentual: 25 },
    { nome: 'Açúcar 1kg', stockAtual: 40, stockMinimo: 80, percentual: 50 },
    { nome: 'Detergente 1L', stockAtual: 18, stockMinimo: 60, percentual: 30 },
    { nome: 'Sabão em Pó 1kg', stockAtual: 22, stockMinimo: 50, percentual: 44 }
  ];

  const estatisticas = {
    totalProdutos: 1245,
    valorTotalStock: 2450000,
    produtosStockBaixo: 23,
    produtosSemStock: 8,
    entradasHoje: 120,
    saidasHoje: 85,
    movimentacoesHoje: 205,
    valorMedioItem: 1968
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Stock</h1>
          <p className="text-muted-foreground">Visão geral do inventário e movimentações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/stock/movimentacao">
              <PackageOpen className="h-4 w-4 mr-2" />
              Movimentações
            </Link>
          </Button>
          <Button asChild>
            <Link href="/stock/reposicao">
              <PackagePlus className="h-4 w-4 mr-2" />
              Reposição
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Produtos</p>
                <p className="text-3xl font-bold">{estatisticas.totalProdutos}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  em estoque
                </p>
              </div>
              <Package className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.valorTotalStock / 1000000).toFixed(1)}M
                </p>
                <p className="text-xs text-green-600 mt-1">
                  MT {estatisticas.valorTotalStock.toLocaleString()}
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
                <p className="text-sm text-muted-foreground">Stock Baixo</p>
                <p className="text-3xl font-bold text-orange-600">{estatisticas.produtosStockBaixo}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  produtos críticos
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
                <p className="text-sm text-muted-foreground">Sem Stock</p>
                <p className="text-3xl font-bold text-red-600">{estatisticas.produtosSemStock}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  reposição urgente
                </p>
              </div>
              <TrendingDown className="h-10 w-10 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entradas Hoje</p>
                <p className="text-2xl font-bold">{estatisticas.entradasHoje}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-green-600">produtos</span>
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
                <p className="text-sm text-muted-foreground">Saídas Hoje</p>
                <p className="text-2xl font-bold">{estatisticas.saidasHoje}</p>
                <div className="flex items-center gap-1 mt-1">
                  <ArrowDownRight className="h-4 w-4 text-red-600" />
                  <span className="text-xs text-red-600">produtos</span>
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
                <p className="text-sm text-muted-foreground">Movimentações</p>
                <p className="text-2xl font-bold">{estatisticas.movimentacoesHoje}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  hoje
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Movimentações da Semana</CardTitle>
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
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movimentacoesPorDia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="entradas" fill="#82ca9d" name="Entradas" />
                  <Bar dataKey="saidas" fill="#8884d8" name="Saídas" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias Mais Movimentadas</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                movimentacoes: {
                  label: 'Movimentações',
                  color: 'hsl(var(--chart-1))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoriasMaisMovimentadas} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="categoria" type="category" width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="movimentacoes" fill="#8884d8" name="Movimentações" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Produtos com Stock Baixo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {produtosStockBaixo.map((produto, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{produto.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      Stock: {produto.stockAtual} / Mínimo: {produto.stockMinimo}
                    </p>
                  </div>
                  <Badge variant={produto.percentual < 30 ? 'destructive' : 'secondary'}>
                    {produto.percentual}%
                  </Badge>
                </div>
                <Progress value={produto.percentual} className="h-2" />
              </div>
            ))}
          </div>
          <Button variant="outline" className="w-full mt-4" asChild>
            <Link href="/stock/reposicao">
              <PackagePlus className="h-4 w-4 mr-2" />
              Ver Todos os Produtos
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link href="/produtos" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Package className="h-8 w-8 text-blue-600 mb-2" />
                <p className="font-medium">Produtos</p>
                <p className="text-2xl font-bold">{estatisticas.totalProdutos}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/stock/movimentacao" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <PackageOpen className="h-8 w-8 text-purple-600 mb-2" />
                <p className="font-medium">Movimentações</p>
                <p className="text-2xl font-bold">{estatisticas.movimentacoesHoje}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/stock/reposicao" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <PackagePlus className="h-8 w-8 text-green-600 mb-2" />
                <p className="font-medium">Reposição</p>
                <p className="text-2xl font-bold">{estatisticas.produtosStockBaixo}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventario" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <BarChart3 className="h-8 w-8 text-orange-600 mb-2" />
                <p className="font-medium">Inventário</p>
                <p className="text-2xl font-bold">Ver</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
