
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
  Building, 
  Search, 
  Filter, 
  Eye,
  Edit,
  Plus,
  Phone,
  Mail,
  MapPin,
  Star,
  DollarSign,
  TrendingUp
} from 'lucide-react';

export default function FornecedoresListaPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [classificacaoFiltro, setClassificacaoFiltro] = useState('todos');

  const fornecedores = [
    {
      id: 'F001',
      codigo: 'FOR-0001',
      nome: 'Distribuidora ABC Moçambique',
      tipo: 'pessoa_juridica',
      nuit: '123456789',
      telefone: '+258 21 123 456',
      email: 'vendas@distribuidoraabc.co.mz',
      endereco: 'Av. Julius Nyerere, 123',
      cidade: 'Maputo',
      status: 'ativo',
      classificacao: 'preferencial',
      rating: 4.5,
      totalCompras: 450000,
      numeroCompras: 28,
      ultimaCompra: '2024-01-20'
    },
    {
      id: 'F002',
      codigo: 'FOR-0002',
      nome: 'Importadora XYZ Lda',
      tipo: 'pessoa_juridica',
      nuit: '987654321',
      telefone: '+258 84 321 654',
      email: 'contato@importadoraxyz.co.mz',
      endereco: 'Av. 24 de Julho, 456',
      cidade: 'Maputo',
      status: 'ativo',
      classificacao: 'regular',
      rating: 4,
      totalCompras: 285000,
      numeroCompras: 18,
      ultimaCompra: '2024-01-19'
    },
    {
      id: 'F003',
      codigo: 'FOR-0003',
      nome: 'Fornecedor Local Maputo',
      tipo: 'pessoa_fisica',
      nuit: '456789123',
      telefone: '+258 87 987 654',
      email: 'fornecedor@local.co.mz',
      endereco: 'Rua da Resistência, 789',
      cidade: 'Matola',
      status: 'ativo',
      classificacao: 'novo',
      rating: 3.5,
      totalCompras: 125000,
      numeroCompras: 12,
      ultimaCompra: '2024-01-18'
    },
    {
      id: 'F004',
      codigo: 'FOR-0004',
      nome: 'Empresa de Logística Beira',
      tipo: 'pessoa_juridica',
      nuit: '789123456',
      telefone: '+258 82 456 789',
      email: 'logistica@beira.co.mz',
      endereco: 'Av. Eduardo Mondlane, 321',
      cidade: 'Beira',
      status: 'inativo',
      classificacao: 'regular',
      rating: 2.5,
      totalCompras: 95000,
      numeroCompras: 8,
      ultimaCompra: '2023-11-15'
    },
    {
      id: 'F005',
      codigo: 'FOR-0005',
      nome: 'Distribuidor Nampula',
      tipo: 'pessoa_juridica',
      nuit: '321654987',
      telefone: '+258 84 321 654',
      email: 'vendas@distribuidor-nampula.co.mz',
      endereco: 'Av. Samora Machel, 654',
      cidade: 'Nampula',
      status: 'ativo',
      classificacao: 'preferencial',
      rating: 4.8,
      totalCompras: 520000,
      numeroCompras: 35,
      ultimaCompra: '2024-01-21'
    }
  ];

  const tiposFornecedor = ['pessoa_fisica', 'pessoa_juridica'];
  const statusOptions = ['ativo', 'inativo', 'suspenso'];
  const classificacoes = ['preferencial', 'regular', 'novo'];

  const fornecedoresFiltrados = fornecedores.filter(fornecedor => {
    const correspondePesquisa = fornecedor.nome.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                fornecedor.nuit.includes(termoPesquisa) ||
                                fornecedor.email.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeTipo = tipoFiltro === 'todos' || fornecedor.tipo === tipoFiltro;
    const correspondeStatus = statusFiltro === 'todos' || fornecedor.status === statusFiltro;
    const correspondeClassificacao = classificacaoFiltro === 'todos' || fornecedor.classificacao === classificacaoFiltro;
    
    return correspondePesquisa && correspondeTipo && correspondeStatus && correspondeClassificacao;
  });

  const obterLabelTipo = (tipo: string) => {
    const labels: Record<string, string> = {
      pessoa_fisica: 'Pessoa Física',
      pessoa_juridica: 'Pessoa Jurídica'
    };
    return labels[tipo] || tipo;
  };

  const obterCorClassificacao = (classificacao: string) => {
    const cores: Record<string, string> = {
      preferencial: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      regular: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      novo: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    };
    return cores[classificacao] || 'bg-gray-100 text-gray-800';
  };

  const renderizarEstrelas = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
          />
        ))}
        <span className="text-sm font-medium ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

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
            Lista de Fornecedores
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gestão completa de fornecedores e parceiros comerciais
          </p>
        </div>
        <Button asChild>
          <Link href="/fornecedores/novo">
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
            
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Tipo de Fornecedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                {tiposFornecedor.map(tipo => (
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

            <Select value={classificacaoFiltro} onValueChange={setClassificacaoFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Classificação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {classificacoes.map(classificacao => (
                  <SelectItem key={classificacao} value={classificacao}>
                    {classificacao.charAt(0).toUpperCase() + classificacao.slice(1)}
                  </SelectItem>
                ))}
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>NUIT</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Total Compras</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fornecedoresFiltrados.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{fornecedor.nome}</p>
                        <p className="text-sm text-muted-foreground">{fornecedor.codigo}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {obterLabelTipo(fornecedor.tipo)}
                      </Badge>
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
                      <Badge className={obterCorClassificacao(fornecedor.classificacao)}>
                        {fornecedor.classificacao.charAt(0).toUpperCase() + fornecedor.classificacao.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {renderizarEstrelas(fornecedor.rating)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">MT {fornecedor.totalCompras.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{fornecedor.numeroCompras} compras</p>
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
                          <Link href={`/fornecedores/${fornecedor.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/fornecedores/${fornecedor.id}/editar`}>
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
          
          {fornecedoresFiltrados.length === 0 && (
            <div className="text-center py-8">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhum fornecedor encontrado</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou cadastrar um novo fornecedor
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
