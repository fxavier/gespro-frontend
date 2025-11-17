
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
  ClipboardList, 
  Plus, 
  Search, 
  Filter,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  TrendingUp
} from 'lucide-react';

export default function RequisicoesCompraPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [prioridadeFiltro, setPrioridadeFiltro] = useState('todas');

  // Dados mock das requisições
  const requisicoes = [
    {
      id: 'REQ-001',
      numero: 'REQ-2024-001',
      data: '2024-01-15',
      solicitante: 'João Silva',
      departamento: 'TI',
      prioridade: 'alta',
      status: 'em_aprovacao',
      itens: 5,
      valorTotal: 45000.00,
      dataEntregaDesejada: '2024-02-01',
      nivelAprovacao: 2,
      totalNiveis: 3
    },
    {
      id: 'REQ-002',
      numero: 'REQ-2024-002',
      data: '2024-01-14',
      solicitante: 'Maria Santos',
      departamento: 'Compras',
      prioridade: 'media',
      status: 'aprovada',
      itens: 3,
      valorTotal: 12500.00,
      dataEntregaDesejada: '2024-01-25',
      nivelAprovacao: 3,
      totalNiveis: 3
    },
    {
      id: 'REQ-003',
      numero: 'REQ-2024-003',
      data: '2024-01-13',
      solicitante: 'Pedro Costa',
      departamento: 'Manutenção',
      prioridade: 'urgente',
      status: 'pendente',
      itens: 8,
      valorTotal: 8900.00,
      dataEntregaDesejada: '2024-01-20',
      nivelAprovacao: 0,
      totalNiveis: 2
    },
    {
      id: 'REQ-004',
      numero: 'REQ-2024-004',
      data: '2024-01-12',
      solicitante: 'Ana Oliveira',
      departamento: 'Administrativo',
      prioridade: 'baixa',
      status: 'rejeitada',
      itens: 2,
      valorTotal: 3200.00,
      dataEntregaDesejada: '2024-02-10',
      nivelAprovacao: 1,
      totalNiveis: 2
    },
    {
      id: 'REQ-005',
      numero: 'REQ-2024-005',
      data: '2024-01-11',
      solicitante: 'Carlos Mendes',
      departamento: 'Produção',
      prioridade: 'alta',
      status: 'convertida',
      itens: 12,
      valorTotal: 67800.00,
      dataEntregaDesejada: '2024-01-30',
      nivelAprovacao: 3,
      totalNiveis: 3
    }
  ];

  const requisicoesFiltradas = requisicoes.filter(req => {
    const correspondeNome = req.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           req.solicitante.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           req.departamento.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeStatus = statusFiltro === 'todos' || req.status === statusFiltro;
    const correspondePrioridade = prioridadeFiltro === 'todas' || req.prioridade === prioridadeFiltro;
    
    return correspondeNome && correspondeStatus && correspondePrioridade;
  });

  const obterCorStatus = (status: string) => {
    const cores = {
      'rascunho': 'secondary',
      'pendente': 'outline',
      'em_aprovacao': 'default',
      'aprovada': 'default',
      'rejeitada': 'destructive',
      'cancelada': 'secondary',
      'convertida': 'default'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'rascunho': FileText,
      'pendente': Clock,
      'em_aprovacao': AlertCircle,
      'aprovada': CheckCircle,
      'rejeitada': XCircle,
      'cancelada': XCircle,
      'convertida': TrendingUp
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const obterCorPrioridade = (prioridade: string) => {
    const cores = {
      'baixa': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'media': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'alta': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'urgente': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return cores[prioridade as keyof typeof cores] || 'bg-gray-100 text-gray-800';
  };

  const estatisticas = {
    total: requisicoes.length,
    pendentes: requisicoes.filter(r => r.status === 'pendente' || r.status === 'em_aprovacao').length,
    aprovadas: requisicoes.filter(r => r.status === 'aprovada').length,
    valorTotal: requisicoes.reduce((total, r) => total + r.valorTotal, 0)
  };

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Requisições de Compra
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gerencie as solicitações de compra da empresa
          </p>
        </div>
        <Button asChild>
          <Link href="/procurement/requisicoes/nova">
            <Plus className="h-4 w-4 mr-2" />
            Nova Requisição
          </Link>
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Requisições</p>
                <p className="text-2xl font-bold">{estatisticas.total}</p>
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
                <p className="text-2xl font-bold">{estatisticas.pendentes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Aprovadas</p>
                <p className="text-2xl font-bold">{estatisticas.aprovadas}</p>
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
                  placeholder="Pesquisar por número, solicitante ou departamento..."
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
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_aprovacao">Em Aprovação</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="rejeitada">Rejeitada</SelectItem>
                <SelectItem value="convertida">Convertida</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={prioridadeFiltro} onValueChange={setPrioridadeFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Requisições ({requisicoesFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Entrega Desejada</TableHead>
                  <TableHead>Aprovação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisicoesFiltradas.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.numero}</TableCell>
                    <TableCell>{new Date(req.data).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>{req.solicitante}</TableCell>
                    <TableCell>{req.departamento}</TableCell>
                    <TableCell>
                      <Badge className={obterCorPrioridade(req.prioridade)}>
                        {req.prioridade.charAt(0).toUpperCase() + req.prioridade.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{req.itens}</TableCell>
                    <TableCell className="font-medium">
                      MT {req.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{new Date(req.dataEntregaDesejada).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {req.nivelAprovacao}/{req.totalNiveis}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={obterCorStatus(req.status) as any} className="flex items-center w-fit">
                        {obterIconeStatus(req.status)}
                        {req.status.replace('_', ' ').charAt(0).toUpperCase() + req.status.replace('_', ' ').slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/procurement/requisicoes/${req.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {(req.status === 'rascunho' || req.status === 'pendente') && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/procurement/requisicoes/${req.id}/editar`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {requisicoesFiltradas.length === 0 && (
            <div className="text-center py-8">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma requisição encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou criar uma nova requisição
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
