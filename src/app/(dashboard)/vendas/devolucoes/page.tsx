
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
  RotateCcw, 
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
  FileText
} from 'lucide-react';

export default function DevolucaoPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [motivoFiltro, setMotivoFiltro] = useState('todos');

  const devolucoes = [
    {
      id: 'DEV001',
      numero: 'DEV2024/001',
      vendaOriginal: 'V2024/001',
      cliente: 'João Silva',
      clienteId: 'C001',
      dataDevolucao: '2024-01-16',
      dataVendaOriginal: '2024-01-15',
      motivo: 'defeito',
      status: 'aprovada',
      valorTotal: 245.00,
      responsavel: 'Maria Santos',
      observacoes: 'Produto com defeito de fabricação',
      itens: [
        { produto: 'Smartphone Samsung A54', quantidade: 1, valorUnitario: 245.00, valorTotal: 245.00 }
      ]
    },
    {
      id: 'DEV002',
      numero: 'DEV2024/002',
      vendaOriginal: 'V2024/002',
      cliente: 'Maria Santos',
      clienteId: 'C003',
      dataDevolucao: '2024-01-15',
      dataVendaOriginal: '2024-01-14',
      motivo: 'arrependimento',
      status: 'pendente',
      valorTotal: 89.50,
      responsavel: 'João Silva',
      observacoes: 'Cliente desistiu da compra',
      itens: [
        { produto: 'Óleo de Cozinha 1L', quantidade: 1, valorUnitario: 89.50, valorTotal: 89.50 }
      ]
    },
    {
      id: 'DEV003',
      numero: 'DEV2024/003',
      vendaOriginal: 'V2024/003',
      cliente: 'Carlos Mendes',
      clienteId: 'C004',
      dataDevolucao: '2024-01-14',
      dataVendaOriginal: '2024-01-13',
      motivo: 'produto_errado',
      status: 'processada',
      valorTotal: 65.00,
      responsavel: 'Ana Costa',
      observacoes: 'Cliente recebeu produto diferente do pedido',
      itens: [
        { produto: 'Detergente Líquido 1L', quantidade: 1, valorUnitario: 65.00, valorTotal: 65.00 }
      ]
    },
    {
      id: 'DEV004',
      numero: 'DEV2024/004',
      vendaOriginal: 'V2024/004',
      cliente: 'Ana Costa',
      clienteId: 'C005',
      dataDevolucao: '2024-01-13',
      dataVendaOriginal: '2024-01-12',
      motivo: 'vencimento',
      status: 'rejeitada',
      valorTotal: 35.00,
      responsavel: 'Carlos Mendes',
      observacoes: 'Produto fora do prazo de devolução',
      itens: [
        { produto: 'Coca-Cola 500ml', quantidade: 1, valorUnitario: 35.00, valorTotal: 35.00 }
      ]
    }
  ];

  const statusOptions = ['pendente', 'aprovada', 'processada', 'rejeitada'];
  const motivosOptions = ['defeito', 'arrependimento', 'produto_errado', 'vencimento', 'outros'];

  const devolucoesFiltradas = devolucoes.filter(devolucao => {
    const correspondeNumero = devolucao.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                             devolucao.cliente.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                             devolucao.vendaOriginal.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeStatus = statusFiltro === 'todos' || devolucao.status === statusFiltro;
    const correspondeMotivo = motivoFiltro === 'todos' || devolucao.motivo === motivoFiltro;
    
    return correspondeNumero && correspondeStatus && correspondeMotivo;
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

  const obterCorMotivo = (motivo: string) => {
    const cores = {
      'defeito': 'bg-red-100 text-red-800',
      'arrependimento': 'bg-blue-100 text-blue-800',
      'produto_errado': 'bg-orange-100 text-orange-800',
      'vencimento': 'bg-yellow-100 text-yellow-800',
      'outros': 'bg-gray-100 text-gray-800'
    };
    return cores[motivo as keyof typeof cores] || 'bg-gray-100 text-gray-800';
  };

  const obterIconeStatus = (status: string) => {
    switch (status) {
      case 'pendente': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'aprovada': return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case 'processada': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejeitada': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <RotateCcw className="h-4 w-4" />;
    }
  };

  const obterLabelMotivo = (motivo: string) => {
    const labels = {
      'defeito': 'Defeito',
      'arrependimento': 'Arrependimento',
      'produto_errado': 'Produto Errado',
      'vencimento': 'Vencimento',
      'outros': 'Outros'
    };
    return labels[motivo as keyof typeof labels] || motivo;
  };

  const estatisticas = {
    totalDevolucoes: devolucoes.length,
    devolucoesPendentes: devolucoes.filter(d => d.status === 'pendente').length,
    devolucoesAprovadas: devolucoes.filter(d => d.status === 'aprovada').length,
    devolucoesProcessadas: devolucoes.filter(d => d.status === 'processada').length,
    valorTotalDevolvido: devolucoes.filter(d => d.status === 'processada').reduce((total, d) => total + d.valorTotal, 0)
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Devoluções de Produtos
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de devoluções e reembolsos
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
            <Link href="/vendas/devolucoes/nova">
              <Plus className="h-4 w-4 mr-2" />
              Nova Devolução
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Devoluções</p>
                <p className="text-2xl font-bold">{estatisticas.totalDevolucoes}</p>
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
                <p className="text-2xl font-bold">{estatisticas.devolucoesPendentes}</p>
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
                <p className="text-2xl font-bold">{estatisticas.devolucoesAprovadas}</p>
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
                <p className="text-2xl font-bold">{estatisticas.devolucoesProcessadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Valor Devolvido</p>
                <p className="text-2xl font-bold">MT {estatisticas.valorTotalDevolvido.toFixed(2)}</p>
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
            
            <Select value={motivoFiltro} onValueChange={setMotivoFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Motivos</SelectItem>
                {motivosOptions.map(motivo => (
                  <SelectItem key={motivo} value={motivo}>
                    {obterLabelMotivo(motivo)}
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
          <CardTitle>Lista de Devoluções ({devolucoesFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Venda Original</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data Devolução</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devolucoesFiltradas.map((devolucao) => (
                  <TableRow key={devolucao.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <RotateCcw className="h-4 w-4" />
                        <span className="font-medium">{devolucao.numero}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span>{devolucao.vendaOriginal}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        <span>{devolucao.cliente}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(devolucao.dataDevolucao).toLocaleDateString('pt-MZ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={obterCorMotivo(devolucao.motivo)}>
                        {obterLabelMotivo(devolucao.motivo)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-red-600">
                        MT {devolucao.valorTotal.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span>{devolucao.responsavel}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {obterIconeStatus(devolucao.status)}
                        <Badge variant={obterCorStatus(devolucao.status) as any}>
                          {devolucao.status.charAt(0).toUpperCase() + devolucao.status.slice(1)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/vendas/devolucoes/${devolucao.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {devolucao.status === 'pendente' && (
                          <>
                            <Button variant="ghost" size="sm">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {devolucao.status === 'aprovada' && (
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
          
          {devolucoesFiltradas.length === 0 && (
            <div className="text-center py-8">
              <RotateCcw className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma devolução encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou registrar uma nova devolução
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Devoluções por Motivo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {motivosOptions.map((motivo) => {
                const quantidade = devolucoes.filter(d => d.motivo === motivo).length;
                return (
                  <div key={motivo} className="flex justify-between">
                    <span>{obterLabelMotivo(motivo)}:</span>
                    <span className="font-medium">{quantidade}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Valor por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statusOptions.map((status) => {
                const valor = devolucoes
                  .filter(d => d.status === status)
                  .reduce((total, d) => total + d.valorTotal, 0);
                return (
                  <div key={status} className="flex justify-between">
                    <span className="capitalize">{status}:</span>
                    <span className="font-medium">MT {valor.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Devoluções Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {devolucoes
                .sort((a, b) => new Date(b.dataDevolucao).getTime() - new Date(a.dataDevolucao).getTime())
                .slice(0, 4)
                .map((devolucao) => (
                  <div key={devolucao.id} className="flex justify-between text-sm">
                    <span className="truncate">{devolucao.numero}</span>
                    <Badge variant={obterCorStatus(devolucao.status) as any} className="text-xs">
                      {devolucao.status}
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
