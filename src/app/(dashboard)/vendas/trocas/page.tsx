
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  RefreshCw, 
  Plus, 
  Search, 
  Filter, 
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  DollarSign,
  Package,
  FileText,
  ArrowRightLeft
} from 'lucide-react';

export default function TrocasPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [tipoFiltro, setTipoFiltro] = useState('todos');

  const trocas = [
    {
      id: 'TRC001',
      numero: 'TRC2024/001',
      vendaOriginal: 'V2024/001',
      cliente: 'João Silva',
      clienteId: 'C001',
      dataTroca: '2024-01-16',
      dataVendaOriginal: '2024-01-15',
      tipo: 'produto_diferente',
      status: 'aprovada',
      valorDiferenca: 50.00,
      responsavel: 'Maria Santos',
      observacoes: 'Troca por modelo superior',
      produtoOriginal: {
        nome: 'Smartphone Samsung A34',
        quantidade: 1,
        valor: 12000.00
      },
      produtoNovo: {
        nome: 'Smartphone Samsung A54',
        quantidade: 1,
        valor: 12050.00
      }
    },
    {
      id: 'TRC002',
      numero: 'TRC2024/002',
      vendaOriginal: 'V2024/002',
      cliente: 'Maria Santos',
      clienteId: 'C003',
      dataTroca: '2024-01-15',
      dataVendaOriginal: '2024-01-14',
      tipo: 'defeito',
      status: 'pendente',
      valorDiferenca: 0,
      responsavel: 'João Silva',
      observacoes: 'Produto com defeito de fabricação',
      produtoOriginal: {
        nome: 'Fone de Ouvido Bluetooth',
        quantidade: 1,
        valor: 150.00
      },
      produtoNovo: {
        nome: 'Fone de Ouvido Bluetooth',
        quantidade: 1,
        valor: 150.00
      }
    },
    {
      id: 'TRC003',
      numero: 'TRC2024/003',
      vendaOriginal: 'V2024/003',
      cliente: 'Carlos Mendes',
      clienteId: 'C004',
      dataTroca: '2024-01-14',
      dataVendaOriginal: '2024-01-13',
      tipo: 'tamanho_cor',
      status: 'processada',
      valorDiferenca: -25.00,
      responsavel: 'Ana Costa',
      observacoes: 'Troca de cor do produto',
      produtoOriginal: {
        nome: 'Camiseta Polo Azul G',
        quantidade: 1,
        valor: 85.00
      },
      produtoNovo: {
        nome: 'Camiseta Polo Vermelha G',
        quantidade: 1,
        valor: 60.00
      }
    },
    {
      id: 'TRC004',
      numero: 'TRC2024/004',
      vendaOriginal: 'V2024/004',
      cliente: 'Ana Costa',
      clienteId: 'C005',
      dataTroca: '2024-01-13',
      dataVendaOriginal: '2024-01-12',
      tipo: 'garantia',
      status: 'rejeitada',
      valorDiferenca: 0,
      responsavel: 'Carlos Mendes',
      observacoes: 'Produto fora do prazo de garantia',
      produtoOriginal: {
        nome: 'Relógio Digital',
        quantidade: 1,
        valor: 120.00
      },
      produtoNovo: {
        nome: 'Relógio Digital',
        quantidade: 1,
        valor: 120.00
      }
    }
  ];

  const statusOptions = ['pendente', 'aprovada', 'processada', 'rejeitada'];
  const tiposOptions = ['defeito', 'tamanho_cor', 'produto_diferente', 'garantia', 'outros'];

  const trocasFiltradas = trocas.filter(troca => {
    const correspondeNumero = troca.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                             troca.cliente.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                             troca.vendaOriginal.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeStatus = statusFiltro === 'todos' || troca.status === statusFiltro;
    const correspondeTipo = tipoFiltro === 'todos' || troca.tipo === tipoFiltro;
    
    return correspondeNumero && correspondeStatus && correspondeTipo;
  });

  const obterCorStatus = (status: string) => {
    switch (status) {
      case 'pendente': return 'secondary';
      case 'aprovada': return 'default';
      case 'processada': return 'default';
      case 'rejeitada': return 'destructive';
      default: return 'outline';
    }
  };

  const obterCorTipo = (tipo: string) => {
    const cores = {
      'defeito': 'bg-red-100 text-red-800',
      'tamanho_cor': 'bg-blue-100 text-blue-800',
      'produto_diferente': 'bg-green-100 text-green-800',
      'garantia': 'bg-orange-100 text-orange-800',
      'outros': 'bg-gray-100 text-gray-800'
    };
    return cores[tipo as keyof typeof cores] || 'bg-gray-100 text-gray-800';
  };

  const obterIconeStatus = (status: string) => {
    switch (status) {
      case 'pendente': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'aprovada': return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case 'processada': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejeitada': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <RefreshCw className="h-4 w-4" />;
    }
  };

  const obterLabelTipo = (tipo: string) => {
    const labels = {
      'defeito': 'Defeito',
      'tamanho_cor': 'Tamanho/Cor',
      'produto_diferente': 'Produto Diferente',
      'garantia': 'Garantia',
      'outros': 'Outros'
    };
    return labels[tipo as keyof typeof labels] || tipo;
  };

  const estatisticas = {
    totalTrocas: trocas.length,
    trocasPendentes: trocas.filter(t => t.status === 'pendente').length,
    trocasAprovadas: trocas.filter(t => t.status === 'aprovada').length,
    trocasProcessadas: trocas.filter(t => t.status === 'processada').length,
    valorTotalDiferenca: trocas.filter(t => t.status === 'processada').reduce((total, t) => total + t.valorDiferenca, 0)
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Trocas de Produtos
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de trocas e substituições de produtos
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" asChild>
            <Link href="/vendas">
              <FileText className="h-4 w-4 mr-2" />
              Vendas
            </Link>
          </Button>
          <Button asChild>
            <Link href="/vendas/trocas/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Troca
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Trocas</p>
                <p className="text-2xl font-bold">{estatisticas.totalTrocas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendentes</p>
                <p className="text-2xl font-bold">{estatisticas.trocasPendentes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprovadas</p>
                <p className="text-2xl font-bold">{estatisticas.trocasAprovadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Processadas</p>
                <p className="text-2xl font-bold">{estatisticas.trocasProcessadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Diferença Total</p>
                <p className={`text-2xl font-bold ${estatisticas.valorTotalDiferenca >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {estatisticas.valorTotalDiferenca >= 0 ? '+' : ''}MT {estatisticas.valorTotalDiferenca.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>Filtros e Pesquisa</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por número, cliente ou venda original..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                {tiposOptions.map(tipo => (
                  <SelectItem key={tipo} value={tipo}>
                    {obterLabelTipo(tipo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Trocas ({trocasFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Venda Original</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data Troca</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produtos</TableHead>
                  <TableHead>Diferença</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trocasFiltradas.map((troca) => (
                  <TableRow key={troca.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <RefreshCw className="h-4 w-4" />
                        <span className="font-medium">{troca.numero}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span>{troca.vendaOriginal}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        <span>{troca.cliente}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(troca.dataTroca).toLocaleDateString('pt-MZ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={obterCorTipo(troca.tipo)}>
                        {obterLabelTipo(troca.tipo)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 text-sm">
                          <Package className="h-3 w-3 text-red-600" />
                          <span className="text-red-600">{troca.produtoOriginal.nome}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <ArrowRightLeft className="h-3 w-3" />
                        </div>
                        <div className="flex items-center space-x-2 text-sm">
                          <Package className="h-3 w-3 text-green-600" />
                          <span className="text-green-600">{troca.produtoNovo.nome}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`font-medium ${
                        troca.valorDiferenca > 0 ? 'text-green-600' : 
                        troca.valorDiferenca < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {troca.valorDiferenca > 0 ? '+' : ''}MT {troca.valorDiferenca.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {obterIconeStatus(troca.status)}
                        <Badge variant={obterCorStatus(troca.status) as any}>
                          {troca.status.charAt(0).toUpperCase() + troca.status.slice(1)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/vendas/trocas/${troca.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {troca.status === 'pendente' && (
                          <>
                            <Button variant="ghost" size="sm">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {troca.status === 'aprovada' && (
                          <Button variant="ghost" size="sm">
                            <Package className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {trocasFiltradas.length === 0 && (
            <div className="text-center py-8">
              <RefreshCw className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma troca encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou registrar uma nova troca
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Trocas por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tiposOptions.map((tipo) => {
                const quantidade = trocas.filter(t => t.tipo === tipo).length;
                return (
                  <div key={tipo} className="flex justify-between">
                    <span>{obterLabelTipo(tipo)}:</span>
                    <span className="font-medium">{quantidade}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Diferença por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statusOptions.map((status) => {
                const diferenca = trocas
                  .filter(t => t.status === status)
                  .reduce((total, t) => total + t.valorDiferenca, 0);
                return (
                  <div key={status} className="flex justify-between">
                    <span className="capitalize">{status}:</span>
                    <span className={`font-medium ${diferenca >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {diferenca >= 0 ? '+' : ''}MT {diferenca.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Trocas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trocas
                .sort((a, b) => new Date(b.dataTroca).getTime() - new Date(a.dataTroca).getTime())
                .slice(0, 4)
                .map((troca) => (
                  <div key={troca.id} className="flex justify-between text-sm">
                    <span className="truncate">{troca.numero}</span>
                    <Badge variant={obterCorStatus(troca.status) as any} className="text-xs">
                      {troca.status}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
