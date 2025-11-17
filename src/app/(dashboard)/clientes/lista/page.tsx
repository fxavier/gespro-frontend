
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
  Users, 
  Search, 
  Filter, 
  Eye,
  Edit,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign
} from 'lucide-react';

export default function ClientesListaPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const clientes = [
    {
      id: 'C001',
      nome: 'João Silva',
      tipo: 'fisica',
      nuit: '123456789',
      telefone: '+258 84 123 4567',
      email: 'joao.silva@email.com',
      endereco: 'Av. Julius Nyerere, 123',
      cidade: 'Maputo',
      dataCadastro: '2023-06-15',
      ultimaCompra: '2024-01-20',
      totalCompras: 125000,
      numeroCompras: 45,
      status: 'ativo'
    },
    {
      id: 'C002',
      nome: 'Empresa ABC Lda',
      tipo: 'juridica',
      nuit: '987654321',
      telefone: '+258 21 123 456',
      email: 'contato@empresaabc.co.mz',
      endereco: 'Av. 24 de Julho, 456',
      cidade: 'Maputo',
      dataCadastro: '2023-03-10',
      ultimaCompra: '2024-01-19',
      totalCompras: 450000,
      numeroCompras: 28,
      status: 'ativo'
    },
    {
      id: 'C003',
      nome: 'Maria Santos',
      tipo: 'fisica',
      nuit: '456789123',
      telefone: '+258 87 987 6543',
      email: 'maria.santos@email.com',
      endereco: 'Rua da Resistência, 789',
      cidade: 'Matola',
      dataCadastro: '2023-08-22',
      ultimaCompra: '2024-01-18',
      totalCompras: 98000,
      numeroCompras: 38,
      status: 'ativo'
    },
    {
      id: 'C004',
      nome: 'Carlos Mendes',
      tipo: 'fisica',
      nuit: '789123456',
      telefone: '+258 82 456 7890',
      email: 'carlos.mendes@email.com',
      endereco: 'Av. Eduardo Mondlane, 321',
      cidade: 'Beira',
      dataCadastro: '2023-01-05',
      ultimaCompra: '2023-11-15',
      totalCompras: 45000,
      numeroCompras: 12,
      status: 'inativo'
    },
    {
      id: 'C005',
      nome: 'Revendedor XYZ',
      tipo: 'revendedor',
      nuit: '321654987',
      telefone: '+258 84 321 6549',
      email: 'vendas@revendedorxyz.co.mz',
      endereco: 'Av. Samora Machel, 654',
      cidade: 'Nampula',
      dataCadastro: '2023-05-18',
      ultimaCompra: '2024-01-21',
      totalCompras: 285000,
      numeroCompras: 52,
      status: 'ativo'
    }
  ];

  const tiposCliente = ['fisica', 'juridica', 'revendedor'];
  const statusOptions = ['ativo', 'inativo'];

  const clientesFiltrados = clientes.filter(cliente => {
    const correspondePesquisa = cliente.nome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                cliente.nuit.includes(termoPesquisa) ||
                                cliente.email.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeTipo = tipoFiltro === 'todos' || cliente.tipo === tipoFiltro;
    const correspondeStatus = statusFiltro === 'todos' || cliente.status === statusFiltro;
    
    return correspondePesquisa && correspondeTipo && correspondeStatus;
  });

  const obterLabelTipo = (tipo: string) => {
    const labels: Record<string, string> = {
      fisica: 'Pessoa Física',
      juridica: 'Pessoa Jurídica',
      revendedor: 'Revendedor'
    };
    return labels[tipo] || tipo;
  };

  const estatisticas = {
    totalClientes: clientes.length,
    clientesAtivos: clientes.filter(c => c.status === 'ativo').length,
    clientesInativos: clientes.filter(c => c.status === 'inativo').length,
    faturamentoTotal: clientes.reduce((total, c) => total + c.totalCompras, 0)
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Lista de Clientes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão completa da base de clientes
          </p>
        </div>
        <Button asChild>
          <Link href="/clientes/novo">
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold">{estatisticas.totalClientes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ativos</p>
                <p className="text-2xl font-bold">{estatisticas.clientesAtivos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-gray-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Inativos</p>
                <p className="text-2xl font-bold">{estatisticas.clientesInativos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento</p>
                <p className="text-2xl font-bold">MT {(estatisticas.faturamentoTotal / 1000).toFixed(0)}k</p>
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
            
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Tipo de Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                {tiposCliente.map(tipo => (
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
          <CardTitle>Clientes ({clientesFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>NUIT</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Total Compras</TableHead>
                  <TableHead>Última Compra</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesFiltrados.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{cliente.nome}</p>
                        <p className="text-sm text-muted-foreground">{cliente.id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {obterLabelTipo(cliente.tipo)}
                      </Badge>
                    </TableCell>
                    <TableCell>{cliente.nuit}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" />
                          <span>{cliente.telefone}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3" />
                          <span className="text-xs">{cliente.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="text-sm">{cliente.cidade}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">MT {cliente.totalCompras.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{cliente.numeroCompras} compras</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span className="text-sm">
                          {new Date(cliente.ultimaCompra).toLocaleDateString('pt-PT')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cliente.status === 'ativo' ? 'default' : 'secondary'}>
                        {cliente.status.charAt(0).toUpperCase() + cliente.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/clientes/${cliente.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/clientes/${cliente.id}/editar`}>
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
          
          {clientesFiltrados.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum cliente encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou cadastrar um novo cliente
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
