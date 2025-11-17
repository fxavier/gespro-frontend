
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
  FileText, 
  Plus, 
  Search, 
  Filter,
  Eye,
  CheckCircle,
  Clock,
  Building,
  DollarSign,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';

export default function ComprasOrcamentosPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const orcamentos = [
    {
      id: 'ORC-001',
      numero: 'ORC-2024-001',
      data: '2024-01-15',
      fornecedor: 'Distribuidora ABC Lda',
      descricao: 'Alimentos e bebidas',
      itens: 15,
      valorTotal: 125000.00,
      dataValidade: '2024-02-15',
      status: 'aprovado',
      responsavel: 'João Silva'
    },
    {
      id: 'ORC-002',
      numero: 'ORC-2024-002',
      data: '2024-01-14',
      fornecedor: 'Bebidas Moçambique SA',
      descricao: 'Bebidas variadas',
      itens: 8,
      valorTotal: 98000.00,
      dataValidade: '2024-02-14',
      status: 'em_analise',
      responsavel: 'Maria Santos'
    },
    {
      id: 'ORC-003',
      numero: 'ORC-2024-003',
      data: '2024-01-13',
      fornecedor: 'Produtos de Limpeza Norte',
      descricao: 'Produtos de limpeza',
      itens: 12,
      valorTotal: 65000.00,
      dataValidade: '2024-02-13',
      status: 'aprovado',
      responsavel: 'Pedro Costa'
    },
    {
      id: 'ORC-004',
      numero: 'ORC-2024-004',
      data: '2024-01-12',
      fornecedor: 'Eletrodomésticos Beira',
      descricao: 'Equipamentos eletrônicos',
      itens: 5,
      valorTotal: 45000.00,
      dataValidade: '2024-02-12',
      status: 'rejeitado',
      responsavel: 'Ana Oliveira'
    },
    {
      id: 'ORC-005',
      numero: 'ORC-2024-005',
      data: '2024-01-11',
      fornecedor: 'Alimentos Norte Lda',
      descricao: 'Alimentos frescos',
      itens: 10,
      valorTotal: 38000.00,
      dataValidade: '2024-02-11',
      status: 'em_analise',
      responsavel: 'Carlos Mendes'
    }
  ];

  const orcamentosFiltrados = orcamentos.filter(orc => {
    const correspondeNome = orc.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           orc.fornecedor.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           orc.descricao.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeStatus = statusFiltro === 'todos' || orc.status === statusFiltro;
    
    return correspondeNome && correspondeStatus;
  });

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } = usePagination({
    data: orcamentosFiltrados,
    initialItemsPerPage: 10
  });

  const obterCorStatus = (status: string) => {
    const cores = {
      'em_analise': 'default',
      'aprovado': 'default',
      'rejeitado': 'destructive'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'em_analise': Clock,
      'aprovado': CheckCircle,
      'rejeitado': Clock
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const estatisticas = {
    total: orcamentos.length,
    aprovados: orcamentos.filter(o => o.status === 'aprovado').length,
    emAnalise: orcamentos.filter(o => o.status === 'em_analise').length,
    valorTotal: orcamentos.reduce((total, o) => total + o.valorTotal, 0)
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Orçamentos de Compra
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gerencie orçamentos de fornecedores
          </p>
        </div>
        <Button asChild>
          <Link href="/compras/orcamentos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Orçamento
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Orçamentos</p>
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
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprovados</p>
                <p className="text-2xl font-bold">{estatisticas.aprovados}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Em Análise</p>
                <p className="text-2xl font-bold">{estatisticas.emAnalise}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Valor Total</p>
                <p className="text-2xl font-bold">MT {(estatisticas.valorTotal / 1000).toFixed(0)}k</p>
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
                  placeholder="Pesquisar por número, fornecedor ou descrição..."
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
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Orçamentos ({orcamentosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((orc) => (
                  <TableRow key={orc.id}>
                    <TableCell className="font-medium">{orc.numero}</TableCell>
                    <TableCell>{new Date(orc.data).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Building className="h-4 w-4" />
                        <span>{orc.fornecedor}</span>
                      </div>
                    </TableCell>
                    <TableCell>{orc.descricao}</TableCell>
                    <TableCell>{orc.itens}</TableCell>
                    <TableCell className="font-medium">
                      MT {orc.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{new Date(orc.dataValidade).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>{orc.responsavel}</TableCell>
                    <TableCell>
                      <Badge variant={obterCorStatus(orc.status) as any} className="flex items-center w-fit">
                        {obterIconeStatus(orc.status)}
                        {orc.status.replace('_', ' ').charAt(0).toUpperCase() + orc.status.replace('_', ' ').slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/compras/orcamentos/${orc.id}`}>
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
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum orçamento encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou criar um novo orçamento
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
