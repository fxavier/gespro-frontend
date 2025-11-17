
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  Eye, 
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Filter
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';

interface Recebimento {
  id: string;
  numeroPedido: string;
  fornecedor: string;
  dataRecebimento: string;
  responsavel: string;
  status: 'completo' | 'parcial' | 'com_divergencia';
  itensRecebidos: number;
  itensTotal: number;
  valorTotal: number;
  observacoes?: string;
}

const recebimentosMock: Recebimento[] = [
  {
    id: '1',
    numeroPedido: 'PC001',
    fornecedor: 'Fornecedor A',
    dataRecebimento: '2024-01-20',
    responsavel: 'João Silva',
    status: 'completo',
    itensRecebidos: 5,
    itensTotal: 5,
    valorTotal: 15000,
    observacoes: 'Recebimento sem problemas'
  },
  {
    id: '2',
    numeroPedido: 'PC002',
    fornecedor: 'Fornecedor B',
    dataRecebimento: '2024-01-19',
    responsavel: 'Maria Santos',
    status: 'parcial',
    itensRecebidos: 3,
    itensTotal: 5,
    valorTotal: 8500,
    observacoes: 'Aguardando restante da encomenda'
  },
  {
    id: '3',
    numeroPedido: 'PC003',
    fornecedor: 'Fornecedor C',
    dataRecebimento: '2024-01-18',
    responsavel: 'Pedro Costa',
    status: 'com_divergencia',
    itensRecebidos: 4,
    itensTotal: 4,
    valorTotal: 12000,
    observacoes: 'Produtos com defeito identificados'
  }
];

export default function RecebimentosPage() {
  const [recebimentos] = useState<Recebimento[]>(recebimentosMock);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  const dadosFiltrados = useMemo(() => {
    return recebimentos.filter(recebimento => {
      const matchBusca = busca === '' || 
        recebimento.numeroPedido.toLowerCase().includes(busca.toLowerCase()) ||
        recebimento.fornecedor.toLowerCase().includes(busca.toLowerCase()) ||
        recebimento.responsavel.toLowerCase().includes(busca.toLowerCase());
      
      const matchStatus = filtroStatus === 'todos' || recebimento.status === filtroStatus;
      
      return matchBusca && matchStatus;
    });
  }, [recebimentos, busca, filtroStatus]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completo':
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Completo</Badge>;
      case 'parcial':
        return <Badge className="bg-orange-600"><Clock className="h-3 w-3 mr-1" />Parcial</Badge>;
      case 'com_divergencia':
        return <Badge className="bg-red-600"><XCircle className="h-3 w-3 mr-1" />Com Divergência</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Recebimentos de Encomendas</h1>
          <p className="text-muted-foreground">Gerir recebimentos e conferência de mercadorias</p>
        </div>
        <Button className="gap-2" asChild>
          <Link href="/procurement/recebimentos/novo">
            <Plus className="h-4 w-4" />
            Novo Recebimento
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Recebimentos</p>
                <p className="text-2xl font-bold">{recebimentos.length}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completos</p>
                <p className="text-2xl font-bold text-green-600">
                  {recebimentos.filter(r => r.status === 'completo').length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Parciais</p>
                <p className="text-2xl font-bold text-orange-600">
                  {recebimentos.filter(r => r.status === 'parcial').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Com Divergência</p>
                <p className="text-2xl font-bold text-red-600">
                  {recebimentos.filter(r => r.status === 'com_divergencia').length}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Pesquisa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por número, fornecedor ou responsável..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="completo">Completo</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="com_divergencia">Com Divergência</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros Avançados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Recebimentos ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Nº Pedido</th>
                  <th className="text-left p-4 font-medium">Fornecedor</th>
                  <th className="text-left p-4 font-medium">Data Recebimento</th>
                  <th className="text-left p-4 font-medium">Responsável</th>
                  <th className="text-left p-4 font-medium">Itens</th>
                  <th className="text-left p-4 font-medium">Valor Total</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-right p-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((recebimento) => (
                  <tr key={recebimento.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div className="font-medium">{recebimento.numeroPedido}</div>
                    </td>
                    <td className="p-4">{recebimento.fornecedor}</td>
                    <td className="p-4">
                      {new Date(recebimento.dataRecebimento).toLocaleDateString('pt-PT')}
                    </td>
                    <td className="p-4">{recebimento.responsavel}</td>
                    <td className="p-4">
                      <div>
                        <span className="font-medium">{recebimento.itensRecebidos}</span>
                        <span className="text-muted-foreground"> / {recebimento.itensTotal}</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium">
                      MT {recebimento.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(recebimento.status)}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum recebimento encontrado</p>
            </div>
          )}

          {dadosFiltrados.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={totalItems}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
