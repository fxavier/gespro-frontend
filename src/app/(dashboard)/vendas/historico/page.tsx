
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
  TrendingUp, 
  Search, 
  Filter, 
  Eye,
  Calendar,
  User,
  DollarSign,
  ShoppingCart,
  Receipt,
  RotateCcw,
  RefreshCw,
  Package,
  CreditCard,
  Banknote,
  Smartphone
} from 'lucide-react';

export default function VendasHistoricoPage() {
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [metodoPagamentoFiltro, setMetodoPagamentoFiltro] = useState('todos');
  const [periodoFiltro, setPeriodoFiltro] = useState('hoje');

  const vendas = [
    {
      id: 'V001',
      numero: 'V2024/001',
      cliente: 'João Silva',
      clienteId: 'C001',
      dataVenda: '2024-01-15 14:30',
      subtotal: 2450.00,
      desconto: 0,
      iva: 416.50,
      total: 2866.50,
      metodoPagamento: 'dinheiro',
      status: 'finalizada',
      vendedor: 'Maria Santos',
      observacoes: '',
      itens: [
        { produto: 'Arroz 25kg', quantidade: 2, preco: 1225.00, total: 2450.00 }
      ]
    },
    {
      id: 'V002',
      numero: 'V2024/002',
      cliente: 'Maria Santos',
      clienteId: 'C003',
      dataVenda: '2024-01-15 13:45',
      subtotal: 1890.50,
      desconto: 94.53,
      iva: 305.39,
      total: 2101.36,
      metodoPagamento: 'cartao',
      status: 'finalizada',
      vendedor: 'João Silva',
      observacoes: 'Desconto de 5%',
      itens: [
        { produto: 'Smartphone Samsung A54', quantidade: 1, preco: 18500.00, total: 18500.00 }
      ]
    },
    {
      id: 'V003',
      numero: 'V2024/003',
      cliente: 'Carlos Mendes',
      clienteId: 'C004',
      dataVenda: '2024-01-15 12:15',
      subtotal: 3200.00,
      desconto: 0,
      iva: 544.00,
      total: 3744.00,
      metodoPagamento: 'mpesa',
      status: 'finalizada',
      vendedor: 'Ana Costa',
      observacoes: '',
      itens: [
        { produto: 'Detergente Líquido 1L', quantidade: 20, preco: 65.00, total: 1300.00 },
        { produto: 'Coca-Cola 500ml', quantidade: 50, preco: 35.00, total: 1750.00 }
      ]
    },
    {
      id: 'V004',
      numero: 'V2024/004',
      cliente: 'Ana Costa',
      clienteId: 'C005',
      dataVenda: '2024-01-15 11:30',
      subtotal: 875.25,
      desconto: 0,
      iva: 148.79,
      total: 1024.04,
      metodoPagamento: 'dinheiro',
      status: 'cancelada',
      vendedor: 'Carlos Mendes',
      observacoes: 'Cancelada por erro no produto',
      itens: []
    },
    {
      id: 'V005',
      numero: 'V2024/005',
      cliente: 'Empresa ABC Lda',
      clienteId: 'C002',
      dataVenda: '2024-01-14 16:20',
      subtotal: 12500.00,
      desconto: 625.00,
      iva: 2018.75,
      total: 13893.75,
      metodoPagamento: 'transferencia',
      status: 'finalizada',
      vendedor: 'Maria Santos',
      observacoes: 'Desconto empresarial de 5%',
      itens: [
        { produto: 'Arroz 25kg', quantidade: 10, preco: 1225.00, total: 12250.00 },
        { produto: 'Óleo 1L', quantidade: 3, preco: 89.50, total: 268.50 }
      ]
    }
  ];

  const statusOptions = ['finalizada', 'cancelada', 'devolvida'];
  const metodosPagamento = ['dinheiro', 'cartao', 'mpesa', 'transferencia'];
  const periodosOptions = ['hoje', 'ontem', 'semana', 'mes', 'ano'];

  const vendasFiltradas = vendas.filter(venda => {
    const correspondeNumero = venda.numero.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                             venda.cliente.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
                             venda.vendedor.toLowerCase().includes(termoPesquisa.toLowerCase());
    const correspondeStatus = statusFiltro === 'todos' || venda.status === statusFiltro;
    const correspondeMetodo = metodoPagamentoFiltro === 'todos' || venda.metodoPagamento === metodoPagamentoFiltro;
    
    let correspondePeriodo = true;
    if (periodoFiltro !== 'todos') {
      const dataVenda = new Date(venda.dataVenda);
      const hoje = new Date();
      
      switch (periodoFiltro) {
        case 'hoje':
          correspondePeriodo = dataVenda.toDateString() === hoje.toDateString();
          break;
        case 'ontem':
          const ontem = new Date(hoje);
          ontem.setDate(hoje.getDate() - 1);
          correspondePeriodo = dataVenda.toDateString() === ontem.toDateString();
          break;
        case 'semana':
          const semanaAtras = new Date(hoje);
          semanaAtras.setDate(hoje.getDate() - 7);
          correspondePeriodo = dataVenda >= semanaAtras;
          break;
        case 'mes':
          correspondePeriodo = dataVenda.getMonth() === hoje.getMonth() && 
                              dataVenda.getFullYear() === hoje.getFullYear();
          break;
        case 'ano':
          correspondePeriodo = dataVenda.getFullYear() === hoje.getFullYear();
          break;
      }
    }
    
    return correspondeNumero && correspondeStatus && correspondeMetodo && correspondePeriodo;
  });

  const obterCorStatus = (status: string) => {
    switch (status) {
      case 'finalizada': return 'default';
      case 'cancelada': return 'destructive';
      case 'devolvida': return 'secondary';
      default: return 'outline';
    }
  };

  const obterIconeMetodoPagamento = (metodo: string) => {
    switch (metodo) {
      case 'dinheiro': return <Banknote className="h-4 w-4" />;
      case 'cartao': return <CreditCard className="h-4 w-4" />;
      case 'mpesa': return <Smartphone className="h-4 w-4" />;
      case 'transferencia': return <DollarSign className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  const estatisticas = {
    totalVendas: vendas.filter(v => v.status === 'finalizada').length,
    vendasCanceladas: vendas.filter(v => v.status === 'cancelada').length,
    vendasDevolvidas: vendas.filter(v => v.status === 'devolvida').length,
    faturamentoTotal: vendas.filter(v => v.status === 'finalizada').reduce((total, v) => total + v.total, 0),
    ticketMedio: vendas.filter(v => v.status === 'finalizada').length > 0 
      ? vendas.filter(v => v.status === 'finalizada').reduce((total, v) => total + v.total, 0) / vendas.filter(v => v.status === 'finalizada').length 
      : 0,
    descontoTotal: vendas.filter(v => v.status === 'finalizada').reduce((total, v) => total + v.desconto, 0)
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Histórico de Vendas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Acompanhamento e análise de vendas realizadas
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" asChild>
            <Link href="/vendas/devolucoes">
              <RotateCcw className="h-4 w-4 mr-2" />
              Devoluções
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/vendas/trocas">
              <RefreshCw className="h-4 w-4 mr-2" />
              Trocas
            </Link>
          </Button>
          <Button asChild>
            <Link href="/pos">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Nova Venda
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Vendas Finalizadas</p>
                <p className="text-2xl font-bold">{estatisticas.totalVendas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento</p>
                <p className="text-2xl font-bold">MT {estatisticas.faturamentoTotal.toLocaleString('pt-MZ')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Receipt className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ticket Médio</p>
                <p className="text-2xl font-bold">MT {estatisticas.ticketMedio.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Descontos</p>
                <p className="text-2xl font-bold">MT {estatisticas.descontoTotal.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RotateCcw className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Canceladas</p>
                <p className="text-2xl font-bold">{estatisticas.vendasCanceladas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Devolvidas</p>
                <p className="text-2xl font-bold">{estatisticas.vendasDevolvidas}</p>
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
                  placeholder="Pesquisar por número, cliente ou vendedor..."
                  value={termoPesquisa}
                  onChange={(e) => setTermoPesquisa(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={periodoFiltro} onValueChange={setPeriodoFiltro}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="mes">Este Mês</SelectItem>
                <SelectItem value="ano">Este Ano</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={metodoPagamentoFiltro} onValueChange={setMetodoPagamentoFiltro}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {metodosPagamento.map(metodo => (
                  <SelectItem key={metodo} value={metodo}>
                    {metodo.charAt(0).toUpperCase() + metodo.slice(1)}
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
          <CardTitle>Lista de Vendas ({vendasFiltradas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendasFiltradas.map((venda) => (
                  <TableRow key={venda.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Receipt className="h-4 w-4" />
                        <span className="font-medium">{venda.numero}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4" />
                        <span>{venda.cliente}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(venda.dataVenda).toLocaleString('pt-MZ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span>{venda.vendedor}</span>
                    </TableCell>
                    <TableCell>
                      MT {venda.subtotal.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {venda.desconto > 0 ? (
                        <span className="text-red-600">-MT {venda.desconto.toFixed(2)}</span>
                      ) : (
                        <span>-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        MT {venda.total.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {obterIconeMetodoPagamento(venda.metodoPagamento)}
                        <span className="capitalize">{venda.metodoPagamento}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={obterCorStatus(venda.status) as any}>
                        {venda.status.charAt(0).toUpperCase() + venda.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/vendas/${venda.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {venda.status === 'finalizada' && (
                          <>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/vendas/${venda.id}/devolucao`}>
                                <RotateCcw className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/vendas/${venda.id}/troca`}>
                                <RefreshCw className="h-4 w-4" />
                              </Link>
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {vendasFiltradas.length === 0 && (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Nenhuma venda encontrada</p>
              <p className="text-sm text-gray-400 mt-1">
                Tente ajustar os filtros ou realizar uma nova venda
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
