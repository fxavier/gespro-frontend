
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Phone, 
  Mail, 
  MapPin,
  Filter,
  Download
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

interface Cliente {
  id: string;
  nome: string;
  nuit: string;
  email: string;
  telefone: string;
  endereco: string;
  cidade: string;
  tipo: 'Pessoa Física' | 'Pessoa Jurídica';
  status: 'Ativo' | 'Inativo';
  saldoDevedor: number;
  ultimaCompra: string;
}

const clientesMock: Cliente[] = [
  {
    id: '1',
    nome: 'João Silva',
    nuit: '123456789',
    email: 'joao@email.com',
    telefone: '+258 84 123 4567',
    endereco: 'Av. Julius Nyerere, 123',
    cidade: 'Maputo',
    tipo: 'Pessoa Física',
    status: 'Ativo',
    saldoDevedor: 0,
    ultimaCompra: '2024-01-15'
  },
  {
    id: '2',
    nome: 'Empresa ABC Lda',
    nuit: '987654321',
    email: 'contato@abc.co.mz',
    telefone: '+258 21 123 456',
    endereco: 'Av. 25 de Setembro, 456',
    cidade: 'Maputo',
    tipo: 'Pessoa Jurídica',
    status: 'Ativo',
    saldoDevedor: 15000,
    ultimaCompra: '2024-01-20'
  },
  {
    id: '3',
    nome: 'Maria Santos',
    nuit: '456789123',
    email: 'maria@email.com',
    telefone: '+258 87 987 6543',
    endereco: 'Rua da Resistência, 789',
    cidade: 'Beira',
    tipo: 'Pessoa Física',
    status: 'Ativo',
    saldoDevedor: 2500,
    ultimaCompra: '2024-01-18'
  },
  {
    id: '4',
    nome: 'Comércio XYZ',
    nuit: '321654987',
    email: 'xyz@comercio.mz',
    telefone: '+258 82 456 7890',
    endereco: 'Av. Eduardo Mondlane, 321',
    cidade: 'Nampula',
    tipo: 'Pessoa Jurídica',
    status: 'Inativo',
    saldoDevedor: 0,
    ultimaCompra: '2023-12-10'
  }
];

export default function ClientesPage() {
  const [clientes] = useState<Cliente[]>(clientesMock);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  const dadosFiltrados = useMemo(() => {
    return clientes.filter(cliente => {
      const matchBusca = busca === '' || 
        cliente.nome.toLowerCase().includes(busca.toLowerCase()) ||
        cliente.nuit.includes(busca) ||
        cliente.email.toLowerCase().includes(busca.toLowerCase());
      
      const matchTipo = filtroTipo === 'todos' || cliente.tipo === filtroTipo;
      const matchStatus = filtroStatus === 'todos' || cliente.status === filtroStatus;
      
      return matchBusca && matchTipo && matchStatus;
    });
  }, [clientes, busca, filtroTipo, filtroStatus]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">Gerencie seus clientes e informações de contato</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Busca</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, NUIT ou email..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                <SelectItem value="Pessoa Jurídica">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="Ativo">Ativo</SelectItem>
                <SelectItem value="Inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros Avançados
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Clientes ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Cliente</th>
                  <th className="text-left p-4 font-medium">NUIT</th>
                  <th className="text-left p-4 font-medium">Contato</th>
                  <th className="text-left p-4 font-medium">Localização</th>
                  <th className="text-left p-4 font-medium">Tipo</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Saldo Devedor</th>
                  <th className="text-right p-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((cliente) => (
                  <tr key={cliente.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{cliente.nome}</div>
                        <div className="text-sm text-muted-foreground">
                          Última compra: {new Date(cliente.ultimaCompra).toLocaleDateString('pt-MZ')}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">{cliente.nuit}</td>
                    <td className="p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3 w-3" />
                          {cliente.telefone}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-3 w-3" />
                          {cliente.email}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-3 w-3" />
                        <div>
                          <div>{cliente.cidade}</div>
                          <div className="text-muted-foreground">{cliente.endereco}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={cliente.tipo === 'Pessoa Jurídica' ? 'default' : 'secondary'}>
                        {cliente.tipo}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant={cliente.status === 'Ativo' ? 'default' : 'secondary'}>
                        {cliente.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <span className={cliente.saldoDevedor > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                        {cliente.saldoDevedor.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' })}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
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
              <p className="text-muted-foreground">Nenhum cliente encontrado</p>
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
