
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Download, 
  Calendar,
  TrendingUp,
  Users,
  DollarSign
} from 'lucide-react';
import { ServicoStorage, AgendamentoServicoStorage } from '@/lib/storage/servico-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function RelatoriosPage() {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [relatorio, setRelatorio] = useState<any>(null);

  useEffect(() => {
    gerarRelatorio();
  }, []);

  const gerarRelatorio = () => {
    const servicos = ServicoStorage.getServicos();
    const agendamentos = AgendamentoServicoStorage.getAgendamentos();

    let agendamentosFiltrados = agendamentos;

    if (dataInicio && dataFim) {
      agendamentosFiltrados = agendamentos.filter(a => {
        const data = new Date(a.dataAgendamento);
        return data >= new Date(dataInicio) && data <= new Date(dataFim);
      });
    }

    const faturamento = agendamentosFiltrados.reduce((total, a) => total + a.total, 0);
    const agendamentosConc = agendamentosFiltrados.filter(a => a.status === 'concluido').length;
    const agendamentosCancelados = agendamentosFiltrados.filter(a => a.status === 'cancelado').length;

    const servicosPorCategoria = servicos.reduce((acc: any, s) => {
      const cat = s.categoria;
      if (!acc[cat]) acc[cat] = { categoria: cat, total: 0, faturamento: 0 };
      acc[cat].total++;
      acc[cat].faturamento += s.faturamentoTotal;
      return acc;
    }, {});

    const topServicos = servicos
      .sort((a, b) => b.faturamentoTotal - a.faturamentoTotal)
      .slice(0, 5)
      .map(s => ({
        nome: s.nome.substring(0, 15),
        faturamento: s.faturamentoTotal,
        vendas: s.totalVendas
      }));

    const statusDistribuicao = [
      { name: 'Concluído', value: agendamentosConc },
      { name: 'Cancelado', value: agendamentosCancelados },
      { name: 'Pendente', value: agendamentosFiltrados.filter(a => a.status === 'pendente').length }
    ];

    setRelatorio({
      periodo: { inicio: dataInicio, fim: dataFim },
      totalAgendamentos: agendamentosFiltrados.length,
      agendamentosConc,
      agendamentosCancelados,
      faturamento,
      servicosPorCategoria: Object.values(servicosPorCategoria),
      topServicos,
      statusDistribuicao,
      totalServicos: servicos.length,
      servicosAtivos: servicos.filter(s => s.ativo).length
    });
  };

  const COLORS = ['#10b981', '#ef4444', '#f59e0b'];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Relatórios de Serviços
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Análise e estatísticas de desempenho
        </p>
      </div>

      {/* Filtros de Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Período do Relatório</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Data Início</label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium">Data Fim</label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={gerarRelatorio} className="w-full">
                Gerar Relatório
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {relatorio && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Agendamentos</p>
                    <p className="text-3xl font-bold mt-2">{relatorio.totalAgendamentos}</p>
                  </div>
                  <Calendar className="h-10 w-10 text-blue-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Concluídos</p>
                    <p className="text-3xl font-bold mt-2 text-green-600">{relatorio.agendamentosConc}</p>
                  </div>
                  <TrendingUp className="h-10 w-10 text-green-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento</p>
                    <p className="text-2xl font-bold mt-2">{formatCurrency(relatorio.faturamento)}</p>
                  </div>
                  <DollarSign className="h-10 w-10 text-green-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Taxa Conclusão</p>
                    <p className="text-3xl font-bold mt-2">
                      {relatorio.totalAgendamentos > 0
                        ? ((relatorio.agendamentosConc / relatorio.totalAgendamentos) * 100).toFixed(1)
                        : 0}
                      %
                    </p>
                  </div>
                  <Users className="h-10 w-10 text-purple-600 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Serviços */}
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Serviços por Faturamento</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={relatorio.topServicos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="faturamento" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status Distribuição */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={relatorio.statusDistribuicao}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {relatorio.statusDistribuicao.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Serviços por Categoria */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Faturamento por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={relatorio.servicosPorCategoria}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="categoria" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="#3b82f6" name="Quantidade" />
                    <Bar dataKey="faturamento" fill="#10b981" name="Faturamento" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Botão de Exportação */}
          <div className="flex justify-end">
            <Button className="gap-2">
              <Download className="h-4 w-4" />
              Exportar Relatório (PDF)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
