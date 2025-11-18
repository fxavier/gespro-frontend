'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSystemModuleById } from '@/data/system-modules';
import {
  LineChart as LineChartIcon,
  PieChart,
  BarChart3,
  AlertTriangle,
  Download
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  BarChart
} from 'recharts';

const performanceSeries = [
  { mes: 'Jan', vendas: 420, procurement: 310, financeiro: 210 },
  { mes: 'Fev', vendas: 460, procurement: 280, financeiro: 250 },
  { mes: 'Mar', vendas: 510, procurement: 320, financeiro: 270 },
  { mes: 'Abr', vendas: 530, procurement: 300, financeiro: 280 },
  { mes: 'Mai', vendas: 550, procurement: 340, financeiro: 300 },
  { mes: 'Jun', vendas: 590, procurement: 360, financeiro: 315 }
];

const dashboards = [
  { nome: 'Executivo', utilizacao: 92, fontes: 'Vendas, Finanças, Procurement' },
  { nome: 'Operações', utilizacao: 81, fontes: 'Inventário, Transporte' },
  { nome: 'Clientes', utilizacao: 74, fontes: 'CRM, Serviços, Tickets' }
];

const eventos = [
  { titulo: 'Atualização DRE', detalhes: 'Novos indicadores enviados pelo módulo Financeiro', prioridade: 'normal' },
  { titulo: 'Alerta de Stock', detalhes: 'Inventário reportou ruptura na província de Tete', prioridade: 'alto' },
  { titulo: 'Nova métrica POS', detalhes: 'Latência média do POS adicionada ao data lake', prioridade: 'normal' }
];

const funilVendas = [
  { etapa: 'Leads', valor: 1200 },
  { etapa: 'Qualificados', valor: 640 },
  { etapa: 'Propostas', valor: 310 },
  { etapa: 'Ganho', valor: 180 }
];

export default function AnalyticsDashboardPage() {
  const moduleInfo = getSystemModuleById('analytics');

  if (!moduleInfo) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{moduleInfo.title}</h1>
          <Badge variant="outline" className="text-xs">
            {moduleInfo.springModule}
          </Badge>
        </div>
        <p className="text-muted-foreground max-w-3xl">{moduleInfo.description}</p>
        <div className="flex flex-wrap gap-2">
          <Button>
            <Download className="mr-2 h-4 w-4" />Exportar Relatório
          </Button>
          <Button variant="outline">
            <LineChartIcon className="mr-2 h-4 w-4" />Criar Dashboard
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {moduleInfo.responsibilities.map((responsibility) => (
          <Card key={responsibility}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Responsabilidade</p>
              <p className="font-semibold mt-1">{responsibility}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Tendência de Métricas por Contexto</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="vendas" stroke="#ec4899" strokeWidth={2} />
                <Line type="monotone" dataKey="procurement" stroke="#a855f7" strokeWidth={2} />
                <Line type="monotone" dataKey="financeiro" stroke="#0ea5e9" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Utilização de Dashboards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboards.map((dashboard) => (
              <div key={dashboard.nome} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{dashboard.nome}</p>
                  <Badge variant="secondary">{dashboard.utilizacao}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{dashboard.fontes}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Eventos de Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {eventos.map((evento) => (
              <div key={evento.titulo} className="flex items-start gap-3">
                <div className={`rounded-full p-2 ${evento.prioridade === 'alto' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold">{evento.titulo}</p>
                  <p className="text-sm text-muted-foreground">{evento.detalhes}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funil de Conversão (Vendas &amp; POS)</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funilVendas} layout="vertical" barSize={24}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="etapa" width={90} />
                <Tooltip />
                <Bar dataKey="valor" fill="#0ea5e9" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Modelos Disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-muted-foreground">
          {moduleInfo.typescriptModels.map((model) => (
            <div key={model} className="rounded-lg border p-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">{model}</p>
              <p>Consumido por relatórios e dashboards cross-módulo.</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
