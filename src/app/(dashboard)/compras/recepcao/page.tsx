
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
  Package, 
  Plus, 
  Search, 
  Filter,
  Eye,
  CheckCircle,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';

export default function ComprasRecepcaoPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const recepcoes = [
    {
      id: 'REC-001',
      numero: 'REC-2024-001',
      data: '2024-01-20',
      pedidoId: 'PC-2024-001',
      fornecedor: 'Distribuidora ABC Lda',
      itensEsperados: 3,
      itensRecebidos: 3,
      itensRejeitados: 0,
      status: 'completo',
      valorTotal: 12500.00,
      responsavel: 'João Silva'
    },
    {
      id: 'REC-002',
      numero: 'REC-2024-002',
      data: '2024-01-19',
      pedidoId: 'PC-2024-003',
      fornecedor: 'Produtos de Limpeza Norte',
      itensEsperados: 8,
      itensRecebidos: 5,
      itensRejeitados: 0,
      status: 'parcial',
      valorTotal: 8200.00,
      responsavel: 'Maria Santos'
    },
    {
      id: 'REC-003',
      numero: 'REC-2024-003',
      data: '2024-01-18',
      pedidoId: 'PC-2024-004',
      fornecedor: 'Distribuidora ABC Lda',
      itensEsperados: 12,
      itensRecebidos: 12,
      itensRejeitados: 1,
      status: 'com_divergencia',
      valorTotal: 65000.00,
      responsavel: 'Pedro Costa'
    },
    {
      id: 'REC-004',
      numero: 'REC-2024-004',
      data: '2024-01-17',
      pedidoId: 'PC-2024-002',
      fornecedor: 'Bebidas Moçambique SA',
      itensEsperados: 5,
      itensRecebidos: 0,
      itensRejeitados: 0,
      status: 'pendente',
      valorTotal: 42000.00,
      responsavel: 'Ana Oliveira'
    }
  ];

  const recepcoesFiltradas = recepcoes.filter(rec => {
    const correspondeNome = rec.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           rec.fornecedor.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           rec.pedidoId.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeStatus = statusFiltro === 'todos' || rec.status === statusFiltro;
    
    return correspondeNome && correspondeStatus;
  });

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } = usePagination({
    data: recepcoesFiltradas,
    initialItemsPerPage: 10
  });

  const obterCorStatus = (status: string) => {
    const cores = {
      'pendente': 'outline',
      'completo': 'default',
      'parcial': 'default',
      'com_divergencia': 'destructive'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'pendente': Clock,
      'completo': CheckCircle,
      'parcial': AlertTriangle,
      'com_divergencia': AlertTriangle
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const estatisticas = {
    total: recepcoes.length,
    completas: recepcoes.filter(r => r.status === 'completo').length,
    parciais: recepcoes.filter(r => r.status === 'parcial').length,
    comDivergencia: recepcoes.filter(r => r.status === 'com_divergencia').length
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Recepção de Mercadorias
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gerencie a recepção e conferência de pedidos
          </p>
        </div>
        <Button asChild>
          <Link href="/compras/recepcao/nova">
            <Plus className="h-4 w-4 mr-2" />
            Nova Recepção
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Recepções</p>
                <p className="text-2xl font-bold">{estatisticas.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Completas</p>
                <p className="text-2xl font-bold">{estatisticas.completas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Parciais</p>
                <p className="text-2xl font-bold">{estatisticas.parciais}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Com Divergência</p>
                <p className="text-2xl font-bold">{estatisticas.comDivergencia}</p>
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
                  placeholder="Pesquisar por número, pedido ou fornecedor..."
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
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="completo">Completo</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="com_divergencia">Com Divergência</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Recepções ({recepcoesFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Itens Esperados</TableHead>
                  <TableHead>Itens Recebidos</TableHead>
                  <TableHead>Itens Rejeitados</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell className="font-medium">{rec.numero}</TableCell>
                    <TableCell>{new Date(rec.data).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      <Link href={`/compras/pedidos/${rec.pedidoId}`} className="text-blue-600 hover:underline">
                        {rec.pedidoId}
                      </Link>
                    </TableCell>
                    <TableCell>{rec.fornecedor}</TableCell>
                    <TableCell>{rec.itensEsperados}</TableCell>
                    <TableCell>
                      <Badge variant="default">{rec.itensRecebidos}</Badge>
                    </TableCell>
                    <TableCell>
                      {rec.itensRejeitados > 0 ? (
                        <Badge variant="destructive">{rec.itensRejeitados}</Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      MT {rec.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{rec.responsavel}</TableCell>
                    <TableCell>
                      <Badge variant={obterCorStatus(rec.status) as any} className="flex items-center w-fit">
                        {obterIconeStatus(rec.status)}
                        {rec.status.replace('_', ' ').charAt(0).toUpperCase() + rec.status.replace('_', ' ').slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/compras/recepcao/${rec.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {paginatedData.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma recepção encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou registrar uma nova recepção
              </p>
            </div>
          )}

          {paginatedData.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Itens por página:
                </span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
