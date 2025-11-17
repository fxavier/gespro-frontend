
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Users,
  TrendingUp,
  DollarSign,
  CreditCard,
  UserPlus,
  Eye,
  ArrowRight,
  Activity,
  AlertCircle
} from 'lucide-react';
import { ClienteStorage, HistoricoTransacaoStorage, SegmentacaoClienteStorage } from '@/lib/storage/cliente-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function ClientesDashboardPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [segmentacoes, setSegmentacoes] = useState<any[]>([]);

  useEffect(() => {
    const clientesData = ClienteStorage.getClientes();
    const historicoData = HistoricoTransacaoStorage.getHistorico();
    const segmentacoesData = SegmentacaoClienteStorage.getSegmentacoes();

    setClientes(clientesData);
    setHistorico(historicoData);
    setSegmentacoes(segmentacoesData);
  }, []);

  const clientesAtivos = clientes.filter(c => c.status === 'ativo').length;
  const clientesInativos = clientes.filter(c => c.status === 'inativo').length;
  const clientesNovos = clientes.filter(c => c.categoria === 'novo').length;
  const clientesVIP = clientes.filter(c => c.categoria === 'vip').length;

  const faturamentoTotal = historico
    .filter(h => h.tipo === 'venda' && h.status === 'concluido')
    .reduce((acc, h) => acc + h.valorMT, 0);

  const creditoTotalDisponivel = clientes.reduce((acc, c) => acc + c.limiteCreditoMT, 0);
  const creditoTotalUtilizado = clientes.reduce((acc, c) => acc + c.creditoUtilizadoMT, 0);

  const clientesMaisVendas = clientes
    .map(c => ({
      ...c,
      totalVendas: historico
        .filter(h => h.clienteId === c.id && h.tipo === 'venda')
        .reduce((acc, h) => acc + h.valorMT, 0)
    }))
    .sort((a, b) => b.totalVendas - a.totalVendas)
    .slice(0, 5);

  const ultimasTransacoes = historico
    .sort((a, b) => new Date(b.dataTransacao).getTime() - new Date(a.dataTransacao).getTime())
    .slice(0, 5);

  const distribuicaoPorCategoria = [
    { categoria: 'VIP', total: clientesVIP },
    { categoria: 'Regular', total: clientes.filter(c => c.categoria === 'regular').length },
    { categoria: 'Novo', total: clientesNovos },
    { categoria: 'Inativo', total: clientes.filter(c => c.categoria === 'inativo').length }
  ];

  const distribuicaoPorRegiao = clientes.reduce((acc: any[], c) => {
    const existing = acc.find(r => r.regiao === c.endereco.provincia);
    if (existing) {
      existing.total++;
    } else {
      acc.push({ regiao: c.endereco.provincia, total: 1 });
    }
    return acc;
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard de Clientes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Visão geral e análise da base de clientes
          </p>
        </div>
        <Button asChild>
          <Link href="/clientes/novo">
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Link>
        </Button>
      </div>

      {/* Estatísticas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Clientes</p>
                <p className="text-3xl font-bold mt-2">{clientes.length}</p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Clientes Ativos</p>
                <p className="text-3xl font-bold mt-2">{clientesAtivos}</p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento Total</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(faturamentoTotal)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Crédito Utilizado</p>
                <p className="text-2xl font-bold mt-2">
                  {((creditoTotalUtilizado / creditoTotalDisponivel) * 100).toFixed(1)}%
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribuição por Categoria */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribuicaoPorCategoria.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm">{item.categoria}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(item.total / clientes.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{item.total}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Distribuição por Região */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Região</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {distribuicaoPorRegiao.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-sm">{item.regiao}</span>
                <Badge variant="outline">{item.total}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Resumo de Crédito */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumo de Crédito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Limite Total</p>
              <p className="text-2xl font-bold">{formatCurrency(creditoTotalDisponivel)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Utilizado</p>
              <p className="text-2xl font-bold text-orange-600">{formatCurrency(creditoTotalUtilizado)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Disponível</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(creditoTotalDisponivel - creditoTotalUtilizado)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clientes com Mais Vendas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Top 5 Clientes por Vendas</span>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/clientes/lista">
                Ver Todos <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Total Vendas</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesMaisVendas.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{cliente.nome}</p>
                        <p className="text-sm text-muted-foreground">{cliente.codigo}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {cliente.tipo === 'fisica' ? 'Pessoa Física' : cliente.tipo === 'juridica' ? 'Pessoa Jurídica' : 'Revendedor'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(cliente.totalVendas)}</TableCell>
                    <TableCell>
                      <Badge variant={cliente.categoria === 'vip' ? 'default' : 'secondary'}>
                        {cliente.categoria.charAt(0).toUpperCase() + cliente.categoria.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cliente.status === 'ativo' ? 'default' : 'secondary'}>
                        {cliente.status.charAt(0).toUpperCase() + cliente.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/clientes/${cliente.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Últimas Transações */}
      <Card>
        <CardHeader>
          <CardTitle>Últimas Transações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referência</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ultimasTransacoes.map((transacao) => {
                  const cliente = clientes.find(c => c.id === transacao.clienteId);
                  return (
                    <TableRow key={transacao.id}>
                      <TableCell className="font-medium">{transacao.referencia}</TableCell>
                      <TableCell>{cliente?.nome || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {transacao.tipo.charAt(0).toUpperCase() + transacao.tipo.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(transacao.valorMT)}</TableCell>
                      <TableCell>{new Date(transacao.dataTransacao).toLocaleDateString('pt-PT')}</TableCell>
                      <TableCell>
                        <Badge variant={transacao.status === 'concluido' ? 'default' : 'secondary'}>
                          {transacao.status.charAt(0).toUpperCase() + transacao.status.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
