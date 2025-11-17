
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
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Building
} from 'lucide-react';

export default function CotacoesPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const cotacoes = [
    {
      id: 'COT-001',
      numero: 'COT-2024-001',
      data: '2024-01-15',
      requisicaoId: 'REQ-2024-001',
      status: 'enviada',
      dataValidade: '2024-01-25',
      fornecedores: 3,
      fornecedoresRespondidos: 2,
      itens: 5,
      melhorOferta: 42000.00
    },
    {
      id: 'COT-002',
      numero: 'COT-2024-002',
      data: '2024-01-14',
      requisicaoId: 'REQ-2024-003',
      status: 'respondida',
      dataValidade: '2024-01-22',
      fornecedores: 4,
      fornecedoresRespondidos: 4,
      itens: 8,
      melhorOferta: 8200.00
    },
    {
      id: 'COT-003',
      numero: 'COT-2024-003',
      data: '2024-01-13',
      requisicaoId: null,
      status: 'rascunho',
      dataValidade: '2024-01-28',
      fornecedores: 0,
      fornecedoresRespondidos: 0,
      itens: 3,
      melhorOferta: null
    },
    {
      id: 'COT-004',
      numero: 'COT-2024-004',
      data: '2024-01-10',
      requisicaoId: 'REQ-2024-002',
      status: 'vencida',
      dataValidade: '2024-01-20',
      fornecedores: 3,
      fornecedoresRespondidos: 1,
      itens: 3,
      melhorOferta: 13500.00
    }
  ];

  const cotacoesFiltradas = cotacoes.filter(cot => {
    const correspondeNome = cot.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                           (cot.requisicaoId && cot.requisicaoId.toLowerCase().includes(termoPesquisa.toLowerCase()));
    const correspondeStatus = statusFiltro === 'todos' || cot.status === statusFiltro;
    
    return correspondeNome && correspondeStatus;
  });

  const obterCorStatus = (status: string) => {
    const cores = {
      'rascunho': 'secondary',
      'enviada': 'default',
      'respondida': 'default',
      'vencida': 'destructive',
      'cancelada': 'secondary'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'rascunho': FileText,
      'enviada': Send,
      'respondida': CheckCircle,
      'vencida': AlertTriangle,
      'cancelada': AlertTriangle
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const estatisticas = {
    total: cotacoes.length,
    enviadas: cotacoes.filter(c => c.status === 'enviada').length,
    respondidas: cotacoes.filter(c => c.status === 'respondida').length,
    vencidas: cotacoes.filter(c => c.status === 'vencida').length
  };

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Cotações de Compra
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Gerencie cotações e compare ofertas de fornecedores
          </p>
        </div>
        <Button asChild>
          <Link href="/procurement/cotacoes/nova">
            <Plus className="h-4 w-4 mr-2" />
            Nova Cotação
          </Link>
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Cotações</p>
                <p className="text-2xl font-bold">{estatisticas.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Send className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Enviadas</p>
                <p className="text-2xl font-bold">{estatisticas.enviadas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Respondidas</p>
                <p className="text-2xl font-bold">{estatisticas.respondidas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Vencidas</p>
                <p className="text-2xl font-bold">{estatisticas.vencidas}</p>
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
                  placeholder="Pesquisar por número ou requisição..."
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
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="respondida">Respondida</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Cotações ({cotacoesFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Requisição</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Fornecedores</TableHead>
                  <TableHead>Respostas</TableHead>
                  <TableHead>Melhor Oferta</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cotacoesFiltradas.map((cot) => (
                  <TableRow key={cot.id}>
                    <TableCell className="font-medium">{cot.numero}</TableCell>
                    <TableCell>{new Date(cot.data).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      {cot.requisicaoId ? (
                        <Link href={`/procurement/requisicoes/${cot.requisicaoId}`} className="text-blue-600 hover:underline">
                          {cot.requisicaoId}
                        </Link>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>{cot.itens}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Building className="h-4 w-4" />
                        <span>{cot.fornecedores}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cot.fornecedoresRespondidos === cot.fornecedores ? 'default' : 'secondary'}>
                        {cot.fornecedoresRespondidos}/{cot.fornecedores}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cot.melhorOferta ? (
                        <span className="font-medium text-green-600">
                          MT {cot.melhorOferta.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(cot.dataValidade).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      <Badge variant={obterCorStatus(cot.status) as any} className="flex items-center w-fit">
                        {obterIconeStatus(cot.status)}
                        {cot.status.charAt(0).toUpperCase() + cot.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/procurement/cotacoes/${cot.id}`}>
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
          
          {cotacoesFiltradas.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma cotação encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou criar uma nova cotação
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
