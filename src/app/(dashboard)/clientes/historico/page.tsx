
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  Filter,
  History,
  TrendingUp,
  Download
} from 'lucide-react';
import { ClienteStorage, HistoricoTransacaoStorage } from '@/lib/storage/cliente-storage';
import { formatCurrency } from '@/lib/format-currency';
import { usePagination } from '@/hooks/usePagination';

export default function HistoricoClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [clienteFiltro, setClienteFiltro] = useState('todos');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [statusFiltro, setStatusFiltro] = useState('todos');

  useEffect(() => {
    const clientesData = ClienteStorage.getClientes();
    const historicoData = HistoricoTransacaoStorage.getHistorico();
    setClientes(clientesData);
    setHistorico(historicoData);
  }, []);

  const historicoFiltrado = historico.filter(h => {
    const correspondePesquisa = h.referencia.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                                h.descricao.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeCliente = clienteFiltro === 'todos' || h.clienteId === clienteFiltro;
    const correspondeTipo = tipoFiltro === 'todos' || h.tipo === tipoFiltro;
    const correspondeStatus = statusFiltro === 'todos' || h.status === statusFiltro;
    return correspondePesquisa && correspondeCliente && correspondeTipo && correspondeStatus;
  }).sort((a, b) => new Date(b.dataTransacao).getTime() - new Date(a.dataTransacao).getTime());

  const { paginatedData, currentPage, totalPages, handlePageChange, itemsPerPage, handleItemsPerPageChange } =
    usePagination({ data: historicoFiltrado, initialItemsPerPage: 15 });

  const getClienteNome = (clienteId: string) => {
    return clientes.find(c => c.id === clienteId)?.nome || 'N/A';
  };

  const totalVendas = historicoFiltrado
    .filter(h => h.tipo === 'venda' && h.status === 'concluido')
    .reduce((acc, h) => acc + h.valorMT, 0);

  const totalPagamentos = historicoFiltrado
    .filter(h => h.tipo === 'pagamento' && h.status === 'concluido')
    .reduce((acc, h) => acc + h.valorMT, 0);

  const exportarCSV = () => {
    const headers = ['Referência', 'Cliente', 'Tipo', 'Descrição', 'Valor (MT)', 'Data', 'Status', 'Usuário'];
    const rows = historicoFiltrado.map(h => [
      h.referencia,
      getClienteNome(h.clienteId),
      h.tipo,
      h.descricao,
      h.valorMT,
      new Date(h.dataTransacao).toLocaleDateString('pt-PT'),
      h.status,
      h.usuario
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-transacoes-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Histórico de Transações
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Registro completo de todas as transações com clientes
          </p>
        </div>
        <Button onClick={exportarCSV} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Transações</p>
                <p className="text-3xl font-bold mt-2">{historicoFiltrado.length}</p>
              </div>
              <History className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Vendas</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(totalVendas)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Pagamentos</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(totalPagamentos)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Pesquisar por referência..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Clientes</SelectItem>
                {clientes.map(cliente => (
                  <SelectItem key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="venda">Venda</SelectItem>
                <SelectItem value="devolucao">Devolução</SelectItem>
                <SelectItem value="pagamento">Pagamento</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
                <SelectItem value="nota_credito">Nota de Crédito</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transações ({historicoFiltrado.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usuário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((transacao) => (
                  <TableRow key={transacao.id}>
                    <TableCell className="font-medium">{transacao.referencia}</TableCell>
                    <TableCell>{getClienteNome(transacao.clienteId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {transacao.tipo === 'venda' ? 'Venda' :
                         transacao.tipo === 'devolucao' ? 'Devolução' :
                         transacao.tipo === 'pagamento' ? 'Pagamento' :
                         transacao.tipo === 'ajuste' ? 'Ajuste' :
                         transacao.tipo === 'nota_credito' ? 'Nota de Crédito' : transacao.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>{transacao.descricao}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(transacao.valorMT)}</TableCell>
                    <TableCell>{new Date(transacao.dataTransacao).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell>
                      <Badge variant={transacao.status === 'concluido' ? 'default' : transacao.status === 'pendente' ? 'secondary' : 'destructive'}>
                        {transacao.status === 'concluido' ? 'Concluído' :
                         transacao.status === 'pendente' ? 'Pendente' : 'Cancelado'}
                      </Badge>
                    </TableCell>
                    <TableCell>{transacao.usuario}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {paginatedData.length === 0 && (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma transação encontrada</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Itens por página:</span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => handleItemsPerPageChange(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
