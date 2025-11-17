
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  BarChart3,
  Download,
  TrendingUp,
  Building,
  Star,
  DollarSign
} from 'lucide-react';
import { formatCurrency } from '@/lib/format-currency';

export default function RelatoriosFornecedoresPage() {
  const fornecedoresMaisCompras = [
    {
      id: '1',
      nome: 'Distribuidor Nampula',
      totalCompras: 520000,
      numeroCompras: 35,
      ultimaCompra: '2024-01-21',
      rating: 4.8
    },
    {
      id: '2',
      nome: 'Distribuidora ABC Moçambique',
      totalCompras: 450000,
      numeroCompras: 28,
      ultimaCompra: '2024-01-20',
      rating: 4.5
    },
    {
      id: '3',
      nome: 'Importadora XYZ Lda',
      totalCompras: 285000,
      numeroCompras: 18,
      ultimaCompra: '2024-01-19',
      rating: 4
    },
    {
      id: '4',
      nome: 'Fornecedor Local Maputo',
      totalCompras: 125000,
      numeroCompras: 12,
      ultimaCompra: '2024-01-18',
      rating: 3.5
    }
  ];

  const distribuicaoPorClassificacao = [
    { classificacao: 'Preferencial', total: 2, percentual: 40 },
    { classificacao: 'Regular', total: 2, percentual: 40 },
    { classificacao: 'Novo', total: 1, percentual: 20 }
  ];

  const distribuicaoPorRegiao = [
    { regiao: 'Maputo', total: 3, valor: 757500 },
    { regiao: 'Sofala', total: 1, valor: 95000 },
    { regiao: 'Nampula', total: 1, valor: 520000 }
  ];

  const estatisticas = {
    totalFornecedores: 5,
    fornecedoresAtivos: 4,
    fornecedoresInativos: 1,
    fornecedoresNovos: 1,
    totalCompras: 1477500,
    numeroCompras: 93,
    ratingMedio: 4.15
  };

  const renderizarEstrelas = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <span key={i} className={i < Math.floor(rating) ? 'text-yellow-400' : 'text-gray-300'}>
            ★
          </span>
        ))}
        <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Relatórios de Fornecedores
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Análise e estatísticas de fornecedores
          </p>
        </div>
        <Button className="gap-2">
          <Download className="h-4 w-4" />
          Exportar Relatório
        </Button>
      </div>

      {/* Estatísticas Principais */}
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
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Compras</p>
                <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalCompras)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Número de Compras</p>
                <p className="text-2xl font-bold">{estatisticas.numeroCompras}</p>
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
      </div>

      {/* Fornecedores Mais Compras */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Fornecedores com Mais Compras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Total Compras</TableHead>
                  <TableHead>Número de Compras</TableHead>
                  <TableHead>Última Compra</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fornecedoresMaisCompras.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell className="font-medium">{fornecedor.nome}</TableCell>
                    <TableCell>{formatCurrency(fornecedor.totalCompras)}</TableCell>
                    <TableCell>{fornecedor.numeroCompras}</TableCell>
                    <TableCell>{new Date(fornecedor.ultimaCompra).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>
                      {renderizarEstrelas(fornecedor.rating)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Distribuição por Classificação */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Classificação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {distribuicaoPorClassificacao.map((item) => (
                <div key={item.classificacao}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{item.classificacao}</span>
                    <Badge variant="outline">{item.total} ({item.percentual}%)</Badge>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${item.percentual}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por Região */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Região</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {distribuicaoPorRegiao.map((item) => (
                <div key={item.regiao} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg">
                  <div>
                    <p className="font-medium">{item.regiao}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{item.total} fornecedor(es)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumo de Status */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo de Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Fornecedores Ativos</p>
              <p className="text-3xl font-bold mt-2">{estatisticas.fornecedoresAtivos}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Fornecedores Inativos</p>
              <p className="text-3xl font-bold mt-2">{estatisticas.fornecedoresInativos}</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Fornecedores Novos</p>
              <p className="text-3xl font-bold mt-2">{estatisticas.fornecedoresNovos}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
