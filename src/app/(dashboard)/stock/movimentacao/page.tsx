
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function StockDashboardPage() {
  const estatisticas = {
    valorTotalStock: 850000,
    produtosTotal: 156,
    produtosStockBaixo: 12,
    produtosSemStock: 3,
    movimentacoesHoje: 45,
    entradasHoje: 28,
    saidasHoje: 17,
    valorEntradas: 125000,
    valorSaidas: 85000
  };

  const produtosStockBaixo = [
    { nome: 'Coca-Cola 500ml', stockAtual: 15, stockMinimo: 20, categoria: 'Bebidas' },
    { nome: 'Arroz Tipo 1 - 1kg', stockAtual: 45, stockMinimo: 50, categoria: 'Grãos' },
    { nome: 'Óleo de Cozinha 900ml', stockAtual: 8, stockMinimo: 15, categoria: 'Mercearia' }
  ];

  const movimentacoesRecentes = [
    {
      id: '1',
      produto: 'Coca-Cola 500ml',
      tipo: 'entrada',
      quantidade: 50,
      data: '2024-01-20 14:30',
      motivo: 'Compra de fornecedor'
    },
    {
      id: '2',
      produto: 'Arroz Tipo 1 - 1kg',
      tipo: 'saida',
      quantidade: 30,
      data: '2024-01-20 13:15',
      motivo: 'Venda'
    },
    {
      id: '3',
      produto: 'Óleo de Cozinha 900ml',
      tipo: 'ajuste',
      quantidade: -5,
      data: '2024-01-20 11:00',
      motivo: 'Quebra'
    }
  ];

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
      case 'saida':
        return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
      case 'ajuste':
        return <RefreshCw className="h-4 w-4 text-orange-600" />;
      default:
        return null;
    }
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
            <Link href="/stock/reposicao">
              <Package className="h-4 w-4 mr-2" />
              Reposição
            </Link>
          </Button>
          <Button asChild>
            <Link href="/stock/movimentacao">
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Nova Movimentação
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total em Stock</p>
                <p className="text-3xl font-bold">
                  {(estatisticas.valorTotalStock / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-muted-foreground mt-1">MT</p>
              </div>
              <BarChart3 className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Produtos</p>
                <p className="text-3xl font-bold">{estatisticas.produtosTotal}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  cadastrados
                </p>
              </div>
              <Package className="h-10 w-10 text-green-600" />
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
                  produtos
                </p>
              </div>
              <AlertCircle className="h-10 w-10 text-orange-600" />
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
                  produtos
                </p>
              </div>
              <Package className="h-10 w-10 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span className="font-medium">Entradas Hoje</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Quantidade</span>
                <Badge variant="default" className="bg-green-600">{estatisticas.entradasHoje}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Valor</span>
                <span className="font-medium">MT {estatisticas.valorEntradas.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                <span className="font-medium">Saídas Hoje</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Quantidade</span>
                <Badge variant="destructive">{estatisticas.saidasHoje}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Valor</span>
                <span className="font-medium">MT {estatisticas.valorSaidas.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                <span className="font-medium">Movimentações</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Hoje</span>
                <Badge variant="secondary">{estatisticas.movimentacoesHoje}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Saldo</span>
                <span className="font-medium text-green-600">
                  + MT {(estatisticas.valorEntradas - estatisticas.valorSaidas).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Produtos com Stock Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {produtosStockBaixo.map((produto, index) => (
                <div key={index} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{produto.nome}</span>
                      <Badge variant="outline">{produto.categoria}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Stock: {produto.stockAtual} / Mínimo: {produto.stockMinimo}
                    </p>
                  </div>
                  <Badge variant="destructive">
                    {produto.stockMinimo - produto.stockAtual} faltam
                  </Badge>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link href="/stock/reposicao">Ver todos os alertas</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Movimentações Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {movimentacoesRecentes.map((mov) => (
                <div key={mov.id} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getTipoIcon(mov.tipo)}
                      <span className="font-medium">{mov.produto}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{mov.motivo}</p>
                    <p className="text-xs text-muted-foreground mt-1">{mov.data}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${mov.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                      {mov.tipo === 'entrada' ? '+' : ''}{mov.quantidade}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link href="/stock/movimentacao">Ver todas as movimentações</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link href="/produtos" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <Package className="h-8 w-8 text-blue-600 mb-2" />
                <p className="font-medium">Produtos</p>
                <p className="text-2xl font-bold">{estatisticas.produtosTotal}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/stock/movimentacao" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <RefreshCw className="h-8 w-8 text-green-600 mb-2" />
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
                <AlertCircle className="h-8 w-8 text-orange-600 mb-2" />
                <p className="font-medium">Reposição</p>
                <p className="text-2xl font-bold">{estatisticas.produtosStockBaixo}</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventario/transferencias" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <ArrowUpCircle className="h-8 w-8 text-purple-600 mb-2" />
                <p className="font-medium">Transferências</p>
                <p className="text-2xl font-bold">8</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inventario/reconciliacao" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <BarChart3 className="h-8 w-8 text-red-600 mb-2" />
                <p className="font-medium">Reconciliação</p>
                <p className="text-2xl font-bold">3</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
