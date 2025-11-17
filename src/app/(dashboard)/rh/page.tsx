
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardRHStorage } from '@/lib/storage/rh-storage';
import { DashboardRH } from '@/types/rh';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Award,
  GraduationCap,
  FileText,
  Briefcase,
  Target,
  Cake
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { formatCurrency } from '@/lib/format-currency';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardRHPage() {
  const [dashboard, setDashboard] = useState<DashboardRH | null>(null);

  useEffect(() => {
    const data = DashboardRHStorage.getDashboardData();
    setDashboard(data);
  }, []);

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">A carregar dashboard...</p>
        </div>
      </div>
    );
  }

  const statsCards = [
    {
      title: 'Total de Colaboradores',
      value: dashboard.totalColaboradores,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Colaboradores Activos',
      value: dashboard.colaboradoresActivos,
      icon: UserCheck,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Inactivos',
      value: dashboard.colaboradoresInactivos,
      icon: UserX,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10'
    },
    {
      title: 'Período Experimental',
      value: dashboard.colaboradoresPeriodoExperimental,
      icon: Clock,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10'
    },
    {
      title: 'Férias Pendentes',
      value: dashboard.feriasPendentes,
      icon: Calendar,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Ausências Hoje',
      value: dashboard.ausenciasHoje,
      icon: UserX,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10'
    },
    {
      title: 'Custo Folha Mensal',
      value: formatCurrency(dashboard.custoFolhaMensal),
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-600/10'
    },
    {
      title: 'Taxa de Rotatividade',
      value: `${dashboard.taxaRotatividade}%`,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-600/10'
    },
    {
      title: 'Avaliações Pendentes',
      value: dashboard.avaliacoesPendentes,
      icon: Award,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10'
    },
    {
      title: 'Formações do Mês',
      value: dashboard.formacoesMes,
      icon: GraduationCap,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10'
    },
    {
      title: 'Contratos a Expirar',
      value: dashboard.contratosExpirando,
      icon: FileText,
      color: 'text-red-600',
      bgColor: 'bg-red-600/10'
    },
    {
      title: 'Vagas Abertas',
      value: dashboard.vagasAbertas,
      icon: Briefcase,
      color: 'text-teal-500',
      bgColor: 'bg-teal-500/10'
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard de Recursos Humanos</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral da gestão de pessoas
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Distribuição por Departamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard.distribuicaoDepartamento}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="departamento" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#3b82f6" name="Colaboradores" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Distribuição por Cargo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dashboard.distribuicaoCargo}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => entry.cargo}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="total"
                >
                  {dashboard.distribuicaoCargo.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cake className="h-5 w-5" />
              Aniversariantes do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.aniversariantesMes.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum aniversariante este mês
              </p>
            ) : (
              <div className="space-y-3">
                {dashboard.aniversariantesMes.map((colaborador) => (
                  <div key={colaborador.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{colaborador.nome}</p>
                      <p className="text-sm text-muted-foreground">{colaborador.cargo}</p>
                    </div>
                    <Badge variant="secondary">
                      {new Date(colaborador.dataNascimento).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Média de Assiduidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600">
                  {dashboard.mediaAssiduidade}%
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Taxa de presença dos colaboradores
                </p>
              </div>
              <Progress value={dashboard.mediaAssiduidade} className="h-3" />
              <div className="grid grid-cols-3 gap-4 text-center text-sm">
                <div>
                  <p className="text-muted-foreground">Excelente</p>
                  <p className="font-semibold text-green-600">&gt; 95%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Bom</p>
                  <p className="font-semibold text-yellow-600">90-95%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Atenção</p>
                  <p className="font-semibold text-red-600">&lt; 90%</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
