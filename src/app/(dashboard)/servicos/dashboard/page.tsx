
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Wrench, 
  Calendar, 
  TrendingUp, 
  Users, 
  Star, 
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign
} from 'lucide-react';
import { ServicoStorage, AgendamentoServicoStorage, AvaliacaoServicoStorage } from '@/lib/storage/servico-storage';
import { formatCurrency } from '@/lib/format-currency';

export default function DashboardServicosPage() {
  const [stats, setStats] = useState({
    totalServicos: 0,
    servicosAtivos: 0,
    agendamentosHoje: 0,
    agendamentosProximos: 0,
    faturamentoMes: 0,
    avaliacaoMedia: 0,
    agendamentosPendentes: 0,
    taxaConclusao: 0
  });

  const [topServicos, setTopServicos] = useState<any[]>([]);
  const [agendamentosProximos, setAgendamentosProximos] = useState<any[]>([]);

  useEffect(() => {
    const servicos = ServicoStorage.getServicos();
    const agendamentos = AgendamentoServicoStorage.getAgendamentos();
    const avaliacoes = AvaliacaoServicoStorage.getAvaliacoes();

    const hoje = new Date().toISOString().split('T')[0];
    const agendamentosHoje = agendamentos.filter(a => a.dataAgendamento === hoje);
    const agendamentosProximos7 = AgendamentoServicoStorage.getAgendamentosProximos(7);
    const agendamentosPendentes = AgendamentoServicoStorage.getAgendamentosPendentes();

    const faturamentoMes = agendamentos
      .filter(a => {
        const data = new Date(a.dataAgendamento);
        const agora = new Date();
        return data.getMonth() === agora.getMonth() && data.getFullYear() === agora.getFullYear();
      })
      .reduce((total, a) => total + a.total, 0);

    const mediaAvaliacoes = avaliacoes.length > 0 
      ? avaliacoes.reduce((sum, a) => sum + a.nota, 0) / avaliacoes.length 
      : 0;

    const agendamentosConc = agendamentos.filter(a => a.status === 'concluido').length;
    const taxaConclusao = agendamentos.length > 0 ? (agendamentosConc / agendamentos.length) * 100 : 0;

    setStats({
      totalServicos: servicos.length,
      servicosAtivos: servicos.filter(s => s.ativo).length,
      agendamentosHoje: agendamentosHoje.length,
      agendamentosProximos: agendamentosProximos7.length,
      faturamentoMes,
      avaliacaoMedia: mediaAvaliacoes,
      agendamentosPendentes: agendamentosPendentes.length,
      taxaConclusao
    });

    const top = servicos
      .sort((a, b) => b.faturamentoTotal - a.faturamentoTotal)
      .slice(0, 5);
    setTopServicos(top);

    setAgendamentosProximos(agendamentosProximos7.slice(0, 5));
  }, []);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard de Serviços
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Visão geral do desempenho e agendamentos
        </p>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Serviços</p>
                <p className="text-3xl font-bold mt-2">{stats.totalServicos}</p>
                <p className="text-xs text-green-600 mt-1">{stats.servicosAtivos} ativos</p>
              </div>
              <Wrench className="h-10 w-10 text-blue-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Agendamentos Hoje</p>
                <p className="text-3xl font-bold mt-2">{stats.agendamentosHoje}</p>
                <p className="text-xs text-orange-600 mt-1">{stats.agendamentosPendentes} pendentes</p>
              </div>
              <Calendar className="h-10 w-10 text-orange-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Faturamento (Mês)</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(stats.faturamentoMes)}</p>
                <p className="text-xs text-green-600 mt-1">+12% vs mês anterior</p>
              </div>
              <DollarSign className="h-10 w-10 text-green-600 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Avaliação Média</p>
                <p className="text-3xl font-bold mt-2">{stats.avaliacaoMedia.toFixed(1)}</p>
                <div className="flex items-center mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${i < Math.round(stats.avaliacaoMedia) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                </div>
              </div>
              <Star className="h-10 w-10 text-yellow-600 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos e Tabelas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Serviços */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 5 Serviços por Faturamento</CardTitle>
            <CardDescription>Serviços mais rentáveis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topServicos.map((servico, index) => (
                <div key={servico.id} className="flex items-center justify-between pb-4 border-b last:border-b-0">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-300">
                        {index + 1}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{servico.nome}</p>
                      <p className="text-sm text-gray-500">{servico.totalVendas} vendas</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(servico.faturamentoTotal)}</p>
                    <Badge variant="outline" className="mt-1">
                      {servico.categoria}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas Rápidas */}
        <Card>
          <CardHeader>
            <CardTitle>Estatísticas Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm">Taxa de Conclusão</span>
              </div>
              <span className="font-bold">{stats.taxaConclusao.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span className="text-sm">Próximos 7 Dias</span>
              </div>
              <span className="font-bold">{stats.agendamentosProximos}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                <span className="text-sm">Pendentes</span>
              </div>
              <span className="font-bold">{stats.agendamentosPendentes}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-purple-600" />
                <span className="text-sm">Crescimento</span>
              </div>
              <span className="font-bold text-green-600">+15%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agendamentos Próximos */}
      <Card>
        <CardHeader>
          <CardTitle>Agendamentos Próximos</CardTitle>
          <CardDescription>Próximos 7 dias</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {agendamentosProximos.length > 0 ? (
              agendamentosProximos.map((agendamento) => (
                <div key={agendamento.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{agendamento.servicoNome}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(agendamento.dataAgendamento).toLocaleDateString('pt-MZ')} às {agendamento.horaInicio}
                      </p>
                    </div>
                  </div>
                  <Badge variant={agendamento.status === 'confirmado' ? 'default' : 'secondary'}>
                    {agendamento.status}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">Nenhum agendamento próximo</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
