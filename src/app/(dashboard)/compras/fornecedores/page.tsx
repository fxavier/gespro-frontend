
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Building, 
  Search, 
  Filter, 
  Eye,
  Edit,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Star,
  ShoppingCart,
  Plus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';

export default function ComprasFornecedoresPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('todos');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const fornecedores = [
    {
      id: 'F001',
      nome: 'Distribuidora ABC Lda',
      categoria: 'Alimentos',
      nuit: '123456789',
      telefone: '+258 21 123 456',
      email: 'contato@distribuidoraabc.co.mz',
      endereco: 'Av. Julius Nyerere, 123',
      cidade: 'Maputo',
      dataCadastro: '2023-01-15',
      ultimaCompra: '2024-01-20',
      totalCompras: 125000,
      numeroCompras: 12,
      avaliacao: 4.8,
      status: 'ativo'
    },
    {
      id: 'F002',
      nome: 'Bebidas Moçambique SA',
      categoria: 'Bebidas',
      nuit: '987654321',
      telefone: '+258 21 987 654',
      email: 'vendas@bebidasmoz.co.mz',
      endereco: 'Av. 24 de Julho, 456',
      cidade: 'Maputo',
      dataCadastro: '2023-03-10',
      ultimaCompra: '2024-01-19',
      totalCompras: 98000,
      numeroCompras: 8,
      avaliacao: 4.5,
      status: 'ativo'
    },
    {
      id: 'F003',
      nome: 'Produtos de Limpeza Norte',
      categoria: 'Limpeza',
      nuit: '456789123',
      telefone: '+258 26 456 789',
      email: 'comercial@limpezanorte.co.mz',
      endereco: 'Rua da Resistência, 789',
      cidade: 'Nampula',
      dataCadastro: '2023-05-22',
      ultimaCompra: '2024-01-18',
      totalCompras: 65000,
      numeroCompras: 15,
      avaliacao: 4.3,
      status: 'ativo'
    },
    {
      id: 'F004',
      nome: 'Eletrodomésticos Beira',
      categoria: 'Eletrônicos',
      nuit: '789123456',
      telefone: '+258 23 789 123',
      email: 'vendas@eletrobeira.co.mz',
      endereco: 'Av. Eduardo Mondlane, 321',
      cidade: 'Beira',
      dataCadastro: '2023-02-05',
      ultimaCompra: '2023-12-15',
      totalCompras: 45000,
      numeroCompras: 5,
      avaliacao: 4.0,
      status: 'inativo'
    },
    {
      id: 'F005',
      nome: 'Alimentos Norte Lda',
      categoria: 'Alimentos',
      nuit: '321654987',
      telefone: '+258 26 321 654',
      email: 'contato@alimentosnorte.co.mz',
      endereco: 'Av. Samora Machel, 654',
      cidade: 'Nampula',
      dataCadastro: '2023-06-18',
      ultimaCompra: '2024-01-21',
      totalCompras: 38000,
      numeroCompras: 10,
      avaliacao: 4.6,
      status: 'ativo'
    }
  ];

  const categorias = ['Alimentos', 'Bebidas', 'Limpeza', 'Eletrônicos', 'Higiene'];

  const fornecedoresFiltrados = fornecedores.filter(fornecedor => {
    const correspondePesquisa = fornecedor.nome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                fornecedor.nuit.includes(termoPesquisa) ||
                                fornecedor.email.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeCategoria = categoriaFiltro === 'todos' || fornecedor.categoria === categoriaFiltro;
    const correspondeStatus = statusFiltro === 'todos' || fornecedor.status === statusFiltro;
    
    return correspondePesquisa && correspondeCategoria && correspondeStatus;
  });

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } = usePagination({
    data: fornecedoresFiltrados,
    initialItemsPerPage: 10
  });

  const estatisticas = {
    totalFornecedores: fornecedores.length,
    fornecedoresAtivos: fornecedores.filter(f => f.status === 'ativo').length,
    fornecedoresInativos: fornecedores.filter(f => f.status === 'inativo').length,
    totalCompras: fornecedores.reduce((total, f) => total + f.totalCompras, 0)
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Fornecedores
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão de fornecedores para compras
          </p>
        </div>
        <Button asChild>
          <Link href="/compras/fornecedores/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Fornecedor
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Building className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold">{estatisticas.totalFornecedores}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Building className="h-5 w-5 text-green-600" />
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
              <Building className="h-5 w-5 text-gray-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Inativos</p>
                <p className="text-2xl font-bold">{estatisticas.fornecedoresInativos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Compras</p>
                <p className="text-2xl font-bold">MT {(estatisticas.totalCompras / 1000).toFixed(0)}k</p>
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
                  placeholder="Pesquisar por nome, NUIT ou email..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Categorias</SelectItem>
                {categorias.map(categoria => (
                  <SelectItem key={categoria} value={categoria}>
                    {categoria}
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
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fornecedores ({fornecedoresFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>NUIT</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Total Compras</TableHead>
                  <TableHead>Avaliação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{fornecedor.nome}</p>
                        <p className="text-sm text-muted-foreground">{fornecedor.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{fornecedor.categoria}</Badge>
                    </TableCell>
                    <TableCell>{fornecedor.nuit}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" />
                          <span>{fornecedor.telefone}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3" />
                          <span className="text-xs">{fornecedor.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="text-sm">{fornecedor.cidade}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">MT {fornecedor.totalCompras.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          {fornecedor.numeroCompras} compras
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-600 fill-yellow-600" />
                        <span className="font-medium">{fornecedor.avaliacao}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={fornecedor.status === 'ativo' ? 'default' : 'secondary'}>
                        {fornecedor.status.charAt(0).toUpperCase() + fornecedor.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/compras/fornecedores/${fornecedor.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/compras/fornecedores/${fornecedor.id}/editar`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {paginatedData.length === 0 && (
            <div className="text-center py-8">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum fornecedor encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou cadastrar um novo fornecedor
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
