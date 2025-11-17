
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Building,
  TrendingUp,
  AlertCircle,
  Star,
  DollarSign,
  ShoppingCart,
  Clock
} from 'lucide-react';
import { formatCurrency } from '@/lib/format-currency';

export default function FornecedoresDashboardPage() {
  const ultimosPedidos = [
    {
      id: '1',
      numero: 'PED-2024-001',
      fornecedor: 'Distribuidora ABC Moçambique',
      dataPedido: '2024-01-15',
      dataEntrega: '2024-01-20',
      valor: 22500,
      status: 'entregue'
    },
    {
      id: '2',
      numero: 'PED-2024-002',
      fornecedor: 'Importadora XYZ Lda',
      dataPedido: '2024-01-18',
      dataEntrega: '2024-01-25',
      valor: 24000,
      status: 'confirmado'
    },
    {
      id: '3',
      numero: 'PED-2024-003',
      fornecedor: 'Distribuidor Nampula',
      dataPedido: '2024-01-19',
      dataEntrega: '2024-01-26',
      valor: 35000,
      status: 'pendente'
    }
  ];

  const fornecedoresPreferenciais = [
    {
      id: '1',
      nome: 'Distribuidor Nampula',
      rating: 4.8,
      totalCompras: 520000,
      status: 'ativo'
    },
    {
      id: '2',
      nome: 'Distribuidora ABC Moçambique',
      rating: 4.5,
      totalCompras: 450000,
      status: 'ativo'
    }
  ];

  const estatisticas = {
    totalFornecedores: 5,
    fornecedoresAtivos: 4,
    pedidosPendentes: 8,
    pagamentosPendentes: 12,
    totalComprasMes: 1477500,
    ratingMedio: 4.15
  };

  const renderizarEstrelas = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
        <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard de Fornecedores
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Visão geral e métricas principais
        </p>
      </div>

      {/* Cartões de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Building className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Fornecedores</p>
                <p className="text-2xl font-bold">{estatisticas.totalFornecedores}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.fornecedoresAtivos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pedidos Pendentes</p>
                <p className="text-2xl font-bold">{estatisticas.pedidosPendentes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pagamentos Pendentes</p>
                <p className="text-2xl font-bold">{estatisticas.pagamentosPendentes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Compras (Mês)</p>
                <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalComprasMes)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Star className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Rating Médio</p>
                <p className="text-2xl font-bold">{estatisticas.ratingMedio.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Últimos 30 Dias</p>
                <p className="text-2xl font-bold">28 compras</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Últimos Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Últimos Pedidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Data Pedido</TableHead>
                  <TableHead>Data Entrega</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ultimosPedidos.map((pedido) => (
                  <TableRow key={pedido.id}>
                    <TableCell className="font-medium">{pedido.numero}</TableCell>
                    <TableCell>{pedido.fornecedor}</TableCell>
                    <TableCell>{new Date(pedido.dataPedido).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>{new Date(pedido.dataEntrega).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>{formatCurrency(pedido.valor)}</TableCell>
                    <TableCell>
                      <Badge variant={pedido.status === 'entregue' ? 'default' : 'secondary'}>
                        {pedido.status.charAt(0).toUpperCase() + pedido.status.slice(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Fornecedores Preferenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Fornecedores Preferenciais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fornecedoresPreferenciais.map((fornecedor) => (
              <div key={fornecedor.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                <div>
                  <p className="font-medium">{fornecedor.nome}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total de compras: {formatCurrency(fornecedor.totalCompras)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    {renderizarEstrelas(fornecedor.rating)}
                  </div>
                  <Badge variant="default">{fornecedor.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
