
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
  FileCheck, 
  Plus, 
  Search, 
  Filter,
  Eye,
  Truck,
  CheckCircle,
  Clock,
  Package,
  Building,
  TrendingUp
} from 'lucide-react';

export default function PedidosCompraPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const pedidos = [
    {
      id: 'PC-001',
      numero: 'PC-2024-001',
      data: '2024-01-16',
      fornecedor: 'Distribuidora ABC Lda',
      requisicaoId: 'REQ-2024-002',
      cotacaoId: 'COT-2024-002',
      status: 'confirmado',
      itens: 3,
      valorTotal: 12500.00,
      dataEntregaPrevista: '2024-01-25',
      percentualRecebido: 0
    },
    {
      id: 'PC-002',
      numero: 'PC-2024-002',
      data: '2024-01-15',
      fornecedor: 'Bebidas Moçambique SA',
      requisicaoId: 'REQ-2024-001',
      cotacaoId: 'COT-2024-001',
      status: 'em_transito',
      itens: 5,
      valorTotal: 42000.00,
      dataEntregaPrevista: '2024-02-01',
      percentualRecebido: 0
    },
    {
      id: 'PC-003',
      numero: 'PC-2024-003',
      data: '2024-01-14',
      fornecedor: 'Produtos de Limpeza Norte',
      requisicaoId: 'REQ-2024-003',
      cotacaoId: 'COT-2024-002',
      status: 'recebido_parcial',
      itens: 8,
      valorTotal: 8200.00,
      dataEntregaPrevista: '2024-01-20',
      percentualRecebido: 60
    },
    {
      id: 'PC-004',
      numero: 'PC-2024-004',
      data: '2024-01-12',
      fornecedor: 'Distribuidora ABC Lda',
      requisicaoId: 'REQ-2024-005',
      cotacaoId: null,
      status: 'recebido_total',
      itens: 12,
      valorTotal: 65000.00,
      dataEntregaPrevista: '2024-01-30',
      percentualRecebido: 100
    },
    {
      id: 'PC-005',
      numero: 'PC-2024-005',
      data: '2024-01-11',
      fornecedor: 'Eletrodomésticos Centro',
      requisicaoId: null,
      cotacaoId: null,
      status: 'enviado',
      itens: 4,
      valorTotal: 28000.00,
      dataEntregaPrevista: '2024-02-05',
      percentualRecebido: 0
    }
  ];

  const pedidosFiltrados = pedidos.filter(ped => {
    const correspondeNome = ped.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           ped.fornecedor.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           (ped.requisicaoId && ped.requisicaoId.toLowerCase().includes(termoPesquisa.toLowerCase()));
    const correspondeStatus = statusFiltro === 'todos' || ped.status === statusFiltro;
    
    return correspondeNome && correspondeStatus;
  });

  const obterCorStatus = (status: string) => {
    const cores = {
      'rascunho': 'secondary',
      'enviado': 'default',
      'confirmado': 'default',
      'em_transito': 'default',
      'recebido_parcial': 'default',
      'recebido_total': 'default',
      'cancelado': 'destructive'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'rascunho': FileCheck,
      'enviado': Clock,
      'confirmado': CheckCircle,
      'em_transito': Truck,
      'recebido_parcial': Package,
      'recebido_total': CheckCircle,
      'cancelado': Clock
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const estatisticas = {
    total: pedidos.length,
    emAndamento: pedidos.filter(p => ['enviado', 'confirmado', 'em_transito'].includes(p.status)).length,
    recebidos: pedidos.filter(p => p.status === 'recebido_total').length,
    valorTotal: pedidos.reduce((total, p) => total + p.valorTotal, 0)
  };

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Pedidos de Compra
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gerencie os pedidos de compra e acompanhe entregas
          </p>
        </div>
        <Button asChild>
          <Link href="/procurement/pedidos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Pedido
          </Link>
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileCheck className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Pedidos</p>
                <p className="text-2xl font-bold">{estatisticas.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Truck className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Em Andamento</p>
                <p className="text-2xl font-bold">{estatisticas.emAndamento}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Recebidos</p>
                <p className="text-2xl font-bold">{estatisticas.recebidos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Valor Total</p>
                <p className="text-2xl font-bold">MT {estatisticas.valorTotal.toLocaleString('pt-MZ')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
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
                  placeholder="Pesquisar por número, fornecedor ou requisição..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="em_transito">Em Trânsito</SelectItem>
                <SelectItem value="recebido_parcial">Recebido Parcial</SelectItem>
                <SelectItem value="recebido_total">Recebido Total</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Pedidos ({pedidosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Requisição</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Entrega Prevista</TableHead>
                  <TableHead>Recebimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidosFiltrados.map((ped) => (
                  <TableRow key={ped.id}>
                    <TableCell className="font-medium">{ped.numero}</TableCell>
                    <TableCell>{new Date(ped.data).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Building className="h-4 w-4" />
                        <span>{ped.fornecedor}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {ped.requisicaoId ? (
                        <Link href={`/procurement/requisicoes/${ped.requisicaoId}`} className="text-blue-600 hover:underline">
                          {ped.requisicaoId}
                        </Link>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>{ped.itens}</TableCell>
                    <TableCell className="font-medium">
                      MT {ped.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{new Date(ped.dataEntregaPrevista).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${ped.percentualRecebido}%` }}
                          />
                        </div>
                        <span className="text-sm">{ped.percentualRecebido}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={obterCorStatus(ped.status) as any} className="flex items-center w-fit">
                        {obterIconeStatus(ped.status)}
                        {ped.status.replace('_', ' ').charAt(0).toUpperCase() + ped.status.replace('_', ' ').slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/procurement/pedidos/${ped.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {pedidosFiltrados.length === 0 && (
            <div className="text-center py-8">
              <FileCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum pedido encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou criar um novo pedido
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
