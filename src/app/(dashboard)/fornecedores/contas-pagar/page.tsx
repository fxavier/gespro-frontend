
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Filter, 
  DollarSign,
  Calendar,
  Building,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { formatCurrency } from '@/lib/format-currency';

export default function ContasPagarPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  const contas = [
    {
      id: '1',
      numero: 'CP-2024-001',
      fornecedor: 'Distribuidora ABC Moçambique',
      fornecedorId: 'F001',
      referencia: 'PED-2024-001',
      dataVencimento: '2024-02-15',
      dataPagamento: null,
      valor: 22500,
      status: 'pendente',
      diasAtraso: 0
    },
    {
      id: '2',
      numero: 'CP-2024-002',
      fornecedor: 'Importadora XYZ Lda',
      fornecedorId: 'F002',
      referencia: 'PED-2024-002',
      dataVencimento: '2024-02-28',
      dataPagamento: null,
      valor: 24000,
      status: 'pendente',
      diasAtraso: 0
    },
    {
      id: '3',
      numero: 'CP-2024-003',
      fornecedor: 'Distribuidora ABC Moçambique',
      fornecedorId: 'F001',
      referencia: 'PED-2024-003',
      dataVencimento: '2024-01-20',
      dataPagamento: '2024-01-20',
      valor: 18500,
      status: 'pago',
      diasAtraso: 0
    },
    {
      id: '4',
      numero: 'CP-2024-004',
      fornecedor: 'Fornecedor Local Maputo',
      fornecedorId: 'F003',
      referencia: 'PED-2024-004',
      dataVencimento: '2024-01-25',
      dataPagamento: null,
      valor: 12000,
      status: 'atrasado',
      diasAtraso: 7
    }
  ];

  const statusOptions = ['todos', 'pendente', 'pago', 'atrasado'];

  const contasFiltradas = contas.filter(conta => {
    const correspondePesquisa = conta.numero.includes(termoPesquisa) ||
                                conta.fornecedor.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                conta.referencia.includes(termoPesquisa);
    const correspondeStatus = statusFiltro === 'todos' || conta.status === statusFiltro;
    
    return correspondePesquisa && correspondeStatus;
  });

  const obterCorStatus = (status: string) => {
    const cores: Record<string, string> = {
      pendente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      pago: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      atrasado: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };
    return cores[status] || 'bg-gray-100 text-gray-800';
  };

  const obterIconeStatus = (status: string) => {
    switch (status) {
      case 'pago':
        return <CheckCircle className="h-4 w-4" />;
      case 'atrasado':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const estatisticas = {
    totalPendente: contas.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.valor, 0),
    totalAtrasado: contas.filter(c => c.status === 'atrasado').reduce((acc, c) => acc + c.valor, 0),
    totalPago: contas.filter(c => c.status === 'pago').reduce((acc, c) => acc + c.valor, 0),
    contasAtrasadas: contas.filter(c => c.status === 'atrasado').length
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Contas a Pagar
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Gestão de pagamentos a fornecedores
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pendente</p>
                <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalPendente)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Atrasado</p>
                <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalAtrasado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pago</p>
                <p className="text-2xl font-bold">{formatCurrency(estatisticas.totalPago)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Contas Atrasadas</p>
                <p className="text-2xl font-bold">{estatisticas.contasAtrasadas}</p>
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
                  placeholder="Pesquisar por número, fornecedor ou referência..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>
                    {status === 'todos' ? 'Todos' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas ({contasFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data Vencimento</TableHead>
                  <TableHead>Data Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contasFiltradas.map((conta) => (
                  <TableRow key={conta.id}>
                    <TableCell className="font-medium">{conta.numero}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 text-gray-400" />
                        <span>{conta.fornecedor}</span>
                      </div>
                    </TableCell>
                    <TableCell>{conta.referencia}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(conta.valor)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>{new Date(conta.dataVencimento).toLocaleDateString('pt-PT')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {conta.dataPagamento ? (
                        new Date(conta.dataPagamento).toLocaleDateString('pt-PT')
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${obterCorStatus(conta.status)} flex items-center gap-1 w-fit`}>
                        {obterIconeStatus(conta.status)}
                        {conta.status.charAt(0).toUpperCase() + conta.status.slice(1)}
                        {conta.diasAtraso > 0 && ` (${conta.diasAtraso}d)`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {conta.status === 'pendente' || conta.status === 'atrasado' ? (
                        <Button size="sm" variant="outline">
                          Pagar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled>
                          Pago
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {contasFiltradas.length === 0 && (
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma conta encontrada</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
