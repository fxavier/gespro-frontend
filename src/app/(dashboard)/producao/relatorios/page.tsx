'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import {
  FileText,
  Download,
  BarChart3,
  PieChart,
  Calendar as CalendarIcon,
  Factory,
  TrendingUp,
  Target,
  Clock,
  DollarSign,
  Users,
  Package,
  AlertTriangle,
  CheckCircle,
  Activity,
  Gauge,
  Eye,
  Filter,
  RefreshCw,
  Printer
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

interface RelatorioTemplate {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  periodicidade: 'diario' | 'semanal' | 'mensal' | 'trimestral' | 'anual';
  formato: 'pdf' | 'excel' | 'dashboard';
  parametros: ParametroRelatorio[];
  ultimaExecucao?: string;
  agendado: boolean;
}

interface ParametroRelatorio {
  nome: string;
  tipo: 'data' | 'periodo' | 'produto' | 'centro' | 'operador';
  obrigatorio: boolean;
  valorPadrao?: any;
}

interface DadosProducao {
  periodo: string;
  ordensProducao: number;
  unidadesProduzidas: number;
  eficienciaMedia: number;
  custoTotal: number;
  tempoTotal: number;
  qualidadeMedia: number;
}

interface MetricaKPI {
  nome: string;
  valor: number;
  unidade: string;
  meta: number;
  tendencia: 'up' | 'down' | 'stable';
  variacao: number;
  categoria: 'producao' | 'qualidade' | 'custo' | 'tempo';
}

export default function RelatoriosPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [dateRange, setDateRange] = useState({
    inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    fim: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [tipoRelatorio, setTipoRelatorio] = useState<string>('producao');
  const [formato, setFormato] = useState<string>('pdf');

  // Mock data
  const templateRelatorios: RelatorioTemplate[] = [
    {
      id: '1',
      nome: 'Relatório de Produção Diário',
      categoria: 'Produção',
      descricao: 'Relatório com dados de produção, ordens completadas e eficiência',
      periodicidade: 'diario',
      formato: 'pdf',
      parametros: [
        { nome: 'Data', tipo: 'data', obrigatorio: true },
        { nome: 'Centro de Trabalho', tipo: 'centro', obrigatorio: false }
      ],
      ultimaExecucao: '2024-10-20',
      agendado: true
    },
    {
      id: '2',
      nome: 'Análise de Custos Mensal',
      categoria: 'Custos',
      descricao: 'Análise detalhada de custos por produto e centro de custo',
      periodicidade: 'mensal',
      formato: 'excel',
      parametros: [
        { nome: 'Período', tipo: 'periodo', obrigatorio: true },
        { nome: 'Produto', tipo: 'produto', obrigatorio: false }
      ],
      ultimaExecucao: '2024-10-01',
      agendado: true
    },
    {
      id: '3',
      nome: 'Dashboard de Qualidade',
      categoria: 'Qualidade',
      descricao: 'Indicadores de qualidade, não conformidades e tendências',
      periodicidade: 'semanal',
      formato: 'dashboard',
      parametros: [
        { nome: 'Período', tipo: 'periodo', obrigatorio: true }
      ],
      ultimaExecucao: '2024-10-15',
      agendado: false
    },
    {
      id: '4',
      nome: 'Relatório OEE',
      categoria: 'Eficiência',
      descricao: 'Overall Equipment Effectiveness por centro de trabalho',
      periodicidade: 'diario',
      formato: 'pdf',
      parametros: [
        { nome: 'Data', tipo: 'data', obrigatorio: true },
        { nome: 'Centro de Trabalho', tipo: 'centro', obrigatorio: true }
      ],
      ultimaExecucao: '2024-10-20',
      agendado: true
    }
  ];

  const dadosProducao: DadosProducao[] = [
    { periodo: 'Semana 1', ordensProducao: 25, unidadesProduzidas: 1250, eficienciaMedia: 88, custoTotal: 125000, tempoTotal: 2400, qualidadeMedia: 96 },
    { periodo: 'Semana 2', ordensProducao: 28, unidadesProduzidas: 1380, eficienciaMedia: 91, custoTotal: 138000, tempoTotal: 2520, qualidadeMedia: 94 },
    { periodo: 'Semana 3', ordensProducao: 22, unidadesProduzidas: 1100, eficienciaMedia: 85, custoTotal: 110000, tempoTotal: 2200, qualidadeMedia: 97 },
    { periodo: 'Semana 4', ordensProducao: 30, unidadesProduzidas: 1500, eficienciaMedia: 93, custoTotal: 150000, tempoTotal: 2700, qualidadeMedia: 95 }
  ];

  const metricas: MetricaKPI[] = [
    { nome: 'OEE Global', valor: 89, unidade: '%', meta: 85, tendencia: 'up', variacao: 4, categoria: 'producao' },
    { nome: 'Taxa de Qualidade', valor: 95.5, unidade: '%', meta: 98, tendencia: 'down', variacao: -2.5, categoria: 'qualidade' },
    { nome: 'Custo por Unidade', valor: 98.50, unidade: 'MT', meta: 100, tendencia: 'up', variacao: -1.5, categoria: 'custo' },
    { nome: 'Lead Time Médio', valor: 4.2, unidade: 'dias', meta: 5, tendencia: 'up', variacao: -0.8, categoria: 'tempo' },
    { nome: 'Produtividade', valor: 145, unidade: 'unid/h', meta: 140, tendencia: 'up', variacao: 5, categoria: 'producao' },
    { nome: 'Eficiência Mão Obra', valor: 87, unidade: '%', meta: 90, tendencia: 'stable', variacao: 0, categoria: 'producao' }
  ];

  // Dados para gráficos complexos
  const dadosEficiencia = [
    { mes: 'Jan', disponibilidade: 92, performance: 88, qualidade: 96, oee: 78 },
    { mes: 'Fev', disponibilidade: 94, performance: 91, qualidade: 94, oee: 80 },
    { mes: 'Mar', disponibilidade: 89, performance: 85, qualidade: 97, oee: 73 },
    { mes: 'Abr', disponibilidade: 96, performance: 93, qualidade: 95, oee: 85 },
    { mes: 'Mai', disponibilidade: 91, performance: 89, qualidade: 98, oee: 79 },
    { mes: 'Jun', disponibilidade: 95, performance: 94, qualidade: 96, oee: 86 }
  ];

  const dadosCustos = [
    { categoria: 'Matéria-Prima', valor: 450000, percentual: 55 },
    { categoria: 'Mão de Obra', valor: 200000, percentual: 25 },
    { categoria: 'Energia', valor: 65000, percentual: 8 },
    { categoria: 'Manutenção', valor: 55000, percentual: 7 },
    { categoria: 'Overhead', valor: 40000, percentual: 5 }
  ];

  const dadosRadar = [
    { indicador: 'Produtividade', valor: 85, maximo: 100 },
    { indicador: 'Qualidade', valor: 95, maximo: 100 },
    { indicador: 'Eficiência', valor: 88, maximo: 100 },
    { indicador: 'Segurança', valor: 92, maximo: 100 },
    { indicador: 'Custo', valor: 78, maximo: 100 },
    { indicador: 'Prazo', valor: 90, maximo: 100 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  const getMetricaIcon = (categoria: string) => {
    switch (categoria) {
      case 'producao': return <Factory className="h-4 w-4" />;
      case 'qualidade': return <CheckCircle className="h-4 w-4" />;
      case 'custo': return <DollarSign className="h-4 w-4" />;
      case 'tempo': return <Clock className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getTendenciaIcon = (tendencia: string) => {
    switch (tendencia) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down': return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
      default: return <Target className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (agendado: boolean) => {
    return (
      <Badge variant={agendado ? 'default' : 'secondary'}>
        {agendado ? 'Agendado' : 'Manual'}
      </Badge>
    );
  };

  const gerarRelatorio = (templateId: string) => {
    toast({
      title: "Relatório gerado",
      description: "O relatório foi gerado com sucesso e está disponível para download",
    });
  };

  const agendarRelatorio = (templateId: string) => {
    toast({
      title: "Relatório agendado",
      description: "O relatório foi configurado para geração automática",
    });
  };

  const exportarDados = () => {
    toast({
      title: "Dados exportados",
      description: "Os dados foram exportados com sucesso",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Relatórios e Dashboards</h1>
          <p className="text-muted-foreground">Análises e relatórios de produção</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportarDados}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Dados
          </Button>
          <Button variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList>
          <TabsTrigger value="templates">Templates de Relatórios</TabsTrigger>
          <TabsTrigger value="kpis">KPIs e Métricas</TabsTrigger>
          <TabsTrigger value="producao">Dashboard Produção</TabsTrigger>
          <TabsTrigger value="analytics">Analytics Avançado</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Templates de Relatórios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templateRelatorios.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">{template.nome}</h4>
                        <p className="text-sm text-gray-600">{template.categoria}</p>
                      </div>
                      {getStatusBadge(template.agendado)}
                    </div>
                    
                    <p className="text-sm text-gray-700">{template.descricao}</p>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Periodicidade:</span>
                        <p className="font-medium">{template.periodicidade}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Formato:</span>
                        <p className="font-medium">{template.formato.toUpperCase()}</p>
                      </div>
                    </div>
                    
                    {template.ultimaExecucao && (
                      <div className="text-xs">
                        <span className="text-gray-500">Última execução:</span>
                        <p className="font-medium">
                          {format(new Date(template.ultimaExecucao), 'dd/MM/yyyy', { locale: pt })}
                        </p>
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => gerarRelatorio(template.id)}>
                        <Eye className="mr-1 h-3 w-3" />
                        Gerar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => agendarRelatorio(template.id)}>
                        <CalendarIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-3">Geração Personalizada</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-sm">Tipo de Relatório</Label>
                    <Select value={tipoRelatorio} onValueChange={setTipoRelatorio}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="producao">Produção</SelectItem>
                        <SelectItem value="qualidade">Qualidade</SelectItem>
                        <SelectItem value="custos">Custos</SelectItem>
                        <SelectItem value="eficiencia">Eficiência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm">Data Início</Label>
                    <Input 
                      type="date" 
                      value={dateRange.inicio}
                      onChange={(e) => setDateRange(prev => ({ ...prev, inicio: e.target.value }))}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-sm">Data Fim</Label>
                    <Input 
                      type="date" 
                      value={dateRange.fim}
                      onChange={(e) => setDateRange(prev => ({ ...prev, fim: e.target.value }))}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-sm">Formato</Label>
                    <Select value={formato} onValueChange={setFormato}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="excel">Excel</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button className="mt-4" onClick={() => gerarRelatorio('custom')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Gerar Relatório Personalizado
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kpis" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metricas.map((metrica, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getMetricaIcon(metrica.categoria)}
                      <span className="text-sm font-medium">{metrica.nome}</span>
                    </div>
                    {getTendenciaIcon(metrica.tendencia)}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold">{metrica.valor}</span>
                      <span className="text-sm text-gray-500">{metrica.unidade}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span>Meta: {metrica.meta}{metrica.unidade}</span>
                      <span className={`font-medium ${
                        metrica.variacao > 0 ? 'text-green-600' : 
                        metrica.variacao < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {metrica.variacao > 0 ? '+' : ''}{metrica.variacao}%
                      </span>
                    </div>
                    
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          metrica.valor >= metrica.meta ? 'bg-green-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${Math.min((metrica.valor / metrica.meta) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="producao" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Produção Semanal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dadosProducao}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="unidadesProduzidas" fill="#8884d8" name="Unidades Produzidas" />
                    <Bar dataKey="ordensProducao" fill="#82ca9d" name="Ordens Produção" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Eficiência vs Qualidade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dadosProducao}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="eficienciaMedia" 
                      stroke="#8884d8" 
                      name="Eficiência %" 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="qualidadeMedia" 
                      stroke="#82ca9d" 
                      name="Qualidade %" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Tendência de Custos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dadosProducao}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => `MT ${value.toLocaleString()}`} />
                  <Area 
                    type="monotone" 
                    dataKey="custoTotal" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.6}
                    name="Custo Total"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>OEE - Componentes</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dadosEficiencia}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis domain={[70, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="disponibilidade" stroke="#8884d8" name="Disponibilidade %" />
                    <Line type="monotone" dataKey="performance" stroke="#82ca9d" name="Performance %" />
                    <Line type="monotone" dataKey="qualidade" stroke="#ffc658" name="Qualidade %" />
                    <Line type="monotone" dataKey="oee" stroke="#ff7300" strokeWidth={3} name="OEE %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={dadosCustos}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.categoria}: ${entry.percentual}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="valor"
                    >
                      {dadosCustos.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `MT ${value.toLocaleString()}`} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Radar de Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={dadosRadar}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="indicador" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar 
                    name="Performance Atual" 
                    dataKey="valor" 
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.6} 
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}