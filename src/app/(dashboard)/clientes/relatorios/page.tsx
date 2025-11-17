
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import {
  Download,
  TrendingUp,
  Users,
  DollarSign,
  Activity
} from 'lucide-react';
import { ClienteStorage, HistoricoTransacaoStorage } from '@/lib/storage/cliente-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function RelatoriosClientesPage() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => {
    const clientesData = ClienteStorage.getClientes();
    const historicoData = HistoricoTransacaoStorage.getHistorico();
    setClientes(clientesData);
    setHistorico(historicoData);
  }, []);

  // Cálculos
  const clientesAtivos = clientes.filter(c => c.status === 'ativo').length;
  const clientesInativos = clientes.filter(c => c.status === 'inativo').length;
  const clientesVIP = clientes.filter(c => c.categoria === 'vip').length;

  const faturamentoTotal = historico
    .filter(h => h.tipo === 'venda' && h.status === 'concluido')
    .reduce((acc, h) => acc + h.valorMT, 0);

  const clientesMaisVendas = clientes
    .map(c => ({
      ...c,
      totalVendas: historico
        .filter(h => h.clienteId === c.id && h.tipo === 'venda' && h.status === 'concluido')
        .reduce((acc, h) => acc + h.valorMT, 0),
      numeroTransacoes: historico.filter(h => h.clienteId === c.id).length
    }))
    .filter(c => c.totalVendas > 0)
    .sort((a, b) => b.totalVendas - a.totalVendas)
    .slice(0, 10);

  const distribuicaoPorCategoria = [
    { name: 'VIP', value: clientesVIP },
    { name: 'Regular', value: clientes.filter(c => c.categoria === 'regular').length },
    { name: 'Novo', value: clientes.filter(c => c.categoria === 'novo').length },
    { name: 'Inativo', value: clientes.filter(c => c.categoria === 'inativo').length }
  ];

  const distribuicaoPorRegiao = clientes.reduce((acc: any[], c) => {
    const existing = acc.find(r => r.name === c.endereco.provincia);
    if (existing) {
      existing.value++;
    } else {
      acc.push({ name: c.endereco.provincia, value: 1 });
    }
    return acc;
  }, []);

  const faturamentoPorMes = historico
    .filter(h => h.tipo === 'venda' && h.status === 'concluido')
    .reduce((acc: any[], h) => {
      const mes = new Date(h.dataTransacao).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' });
      const existing = acc.find(m => m.mes === mes);
      if (existing) {
        existing.valor += h.valorMT;
      } else {
        acc.push({ mes, valor: h.valorMT });
      }
      return acc;
    }, [])
    .slice(-6);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const exportarRelatorio = () => {
    const conteudo = `
RELATÓRIO DE CLIENTES
Data: ${new Date().toLocaleDateString('pt-PT')}

RESUMO EXECUTIVO
================
Total de Clientes: ${clientes.length}
Clientes Ativos: ${clientesAtivos}
Clientes Inativos: ${clientesInativos}
Clientes VIP: ${clientesVIP}

FATURAMENTO
===========
Faturamento Total: MT ${faturamentoTotal.toFixed(2)}
Ticket Médio: MT ${(faturamentoTotal / clientesMaisVendas.length).toFixed(2)}

TOP 10 CLIENTES
===============
${clientesMaisVendas.map((c, i) => `${i + 1}. ${c.nome} - MT ${c.totalVendas.toFixed(2)} (${c.numeroTransacoes} transações)`).join('\n')}
    `;

    const blob = new Blob([conteudo], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-clientes-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Relatórios de Clientes
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Análise e relatórios da base de clientes
          </p>
        </div>
        <Button onClick={exportarRelatorio} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar Relatório
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
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Clientes VIP</p>
                <p className="text-3xl font-bold mt-2">{clientesVIP}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={distribuicaoPorCategoria}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {distribuicaoPorCategoria.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Região</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={distribuicaoPorRegiao}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Faturamento por Mês */}
      <Card>
        <CardHeader>
          <CardTitle>Faturamento por Mês</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={faturamentoPorMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Legend />
              <Line type="monotone" dataKey="valor" stroke="#3b82f6" name="Faturamento (MT)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top 10 Clientes */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Clientes por Faturamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posição</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Total Vendas</TableHead>
                  <TableHead>Transações</TableHead>
                  <TableHead>Ticket Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesMaisVendas.map((cliente, idx) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-bold">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{cliente.nome}</TableCell>
                    <TableCell>
                      <Badge variant={cliente.categoria === 'vip' ? 'default' : 'secondary'}>
                        {cliente.categoria.charAt(0).toUpperCase() + cliente.categoria.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(cliente.totalVendas)}</TableCell>
                    <TableCell>{cliente.numeroTransacoes}</TableCell>
                    <TableCell>{formatCurrency(cliente.totalVendas / cliente.numeroTransacoes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
