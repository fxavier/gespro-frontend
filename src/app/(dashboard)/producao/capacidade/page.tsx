'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/use-toast';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle,
  Clock,
  Factory,
  Gauge,
  Layers,
  PauseCircle,
  PlayCircle,
  Settings,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  Filter,
  Download,
  RefreshCw,
  Cog,
  ArrowRight,
  Eye
} from 'lucide-react';
import Link from 'next/link';
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns';
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
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface CentroTrabalho {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'maquina' | 'bancada' | 'linha' | 'celula';
  capacidadeNominal: number; // minutos por dia
  turnosDisponiveis: number;
  eficienciaMedia: number; // %
  taxaSetup: number; // minutos médios
  custoHora: number;
  operadoresNecessarios: number;
  status: 'ativo' | 'parado' | 'manutencao' | 'inativo';
}

interface CargaTrabalho {
  centroTrabalhoId: string;
  data: string;
  turno: number;
  horasPlaneadas: number;
  horasRealizadas: number;
  horasDisponiveis: number;
  percentualUtilizacao: number;
  ordensAlocadas: string[];
  gargalo: boolean;
}

interface ProgramacaoProducao {
  id: string;
  ordemProducao: string;
  produto: string;
  quantidade: number;
  centroTrabalho: string;
  dataInicio: string;
  dataFim: string;
  turno: number;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'agendada' | 'em_progresso' | 'concluida' | 'atrasada';
  tempoEstimado: number;
  tempoRealizado: number;
  operador?: string;
}

interface AnaliseGargalo {
  centroTrabalho: string;
  percentualGargalo: number;
  horasPerdidas: number;
  ordemEsperando: number;
  impactoFinanceiro: number;
  causaPrincipal: string;
  sugestaoMelhoria: string;
}

export default function CapacidadePage() {
  const [selectedCentro, setSelectedCentro] = useState<CentroTrabalho | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewType, setViewType] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Mock data
  const centrosTrabalho: CentroTrabalho[] = [
    {
      id: '1',
      codigo: 'CT-001',
      nome: 'Forno Industrial',
      tipo: 'maquina',
      capacidadeNominal: 480,
      turnosDisponiveis: 2,
      eficienciaMedia: 85,
      taxaSetup: 15,
      custoHora: 200.00,
      operadoresNecessarios: 2,
      status: 'ativo'
    },
    {
      id: '2',
      codigo: 'CT-002',
      nome: 'Misturador Industrial',
      tipo: 'maquina',
      capacidadeNominal: 480,
      turnosDisponiveis: 2,
      eficienciaMedia: 90,
      taxaSetup: 10,
      custoHora: 150.00,
      operadoresNecessarios: 1,
      status: 'ativo'
    },
    {
      id: '3',
      codigo: 'CT-003',
      nome: 'Linha de Montagem A',
      tipo: 'linha',
      capacidadeNominal: 960,
      turnosDisponiveis: 2,
      eficienciaMedia: 88,
      taxaSetup: 20,
      custoHora: 300.00,
      operadoresNecessarios: 6,
      status: 'ativo'
    },
    {
      id: '4',
      codigo: 'CT-004',
      nome: 'Centro de Usinagem CNC',
      tipo: 'maquina',
      capacidadeNominal: 480,
      turnosDisponiveis: 3,
      eficienciaMedia: 92,
      taxaSetup: 30,
      custoHora: 350.00,
      operadoresNecessarios: 1,
      status: 'manutencao'
    }
  ];

  const cargasTrabalho: CargaTrabalho[] = [
    {
      centroTrabalhoId: '1',
      data: format(new Date(), 'yyyy-MM-dd'),
      turno: 1,
      horasPlaneadas: 7.5,
      horasRealizadas: 6.8,
      horasDisponiveis: 8,
      percentualUtilizacao: 93.75,
      ordensAlocadas: ['OP-2024-001', 'OP-2024-003'],
      gargalo: true
    },
    {
      centroTrabalhoId: '2',
      data: format(new Date(), 'yyyy-MM-dd'),
      turno: 1,
      horasPlaneadas: 5,
      horasRealizadas: 4.5,
      horasDisponiveis: 8,
      percentualUtilizacao: 62.5,
      ordensAlocadas: ['OP-2024-001'],
      gargalo: false
    },
    {
      centroTrabalhoId: '3',
      data: format(new Date(), 'yyyy-MM-dd'),
      turno: 1,
      horasPlaneadas: 7,
      horasRealizadas: 6.5,
      horasDisponiveis: 8,
      percentualUtilizacao: 87.5,
      ordensAlocadas: ['OP-2024-002', 'OP-2024-004'],
      gargalo: false
    }
  ];

  const programacoes: ProgramacaoProducao[] = [
    {
      id: '1',
      ordemProducao: 'OP-2024-001',
      produto: 'Bolo de Chocolate',
      quantidade: 50,
      centroTrabalho: 'Forno Industrial',
      dataInicio: format(new Date(), 'yyyy-MM-dd'),
      dataFim: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      turno: 1,
      prioridade: 'alta',
      status: 'em_progresso',
      tempoEstimado: 240,
      tempoRealizado: 120,
      operador: 'João Silva'
    },
    {
      id: '2',
      ordemProducao: 'OP-2024-002',
      produto: 'Mesa Executive',
      quantidade: 10,
      centroTrabalho: 'Linha de Montagem A',
      dataInicio: format(new Date(), 'yyyy-MM-dd'),
      dataFim: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
      turno: 1,
      prioridade: 'media',
      status: 'agendada',
      tempoEstimado: 420,
      tempoRealizado: 0
    }
  ];

  const analisesGargalo: AnaliseGargalo[] = [
    {
      centroTrabalho: 'Forno Industrial',
      percentualGargalo: 95,
      horasPerdidas: 12,
      ordemEsperando: 3,
      impactoFinanceiro: 5400.00,
      causaPrincipal: 'Capacidade insuficiente para demanda',
      sugestaoMelhoria: 'Adicionar turno noturno ou adquirir equipamento adicional'
    },
    {
      centroTrabalho: 'Centro de Usinagem CNC',
      percentualGargalo: 100,
      horasPerdidas: 24,
      ordemEsperando: 5,
      impactoFinanceiro: 8400.00,
      causaPrincipal: 'Equipamento em manutenção',
      sugestaoMelhoria: 'Acelerar manutenção preventiva ou terceirizar operações'
    }
  ];

  // Dados para gráficos
  const dadosUtilizacao = [
    { nome: 'Segunda', planejado: 85, realizado: 78, capacidade: 100 },
    { nome: 'Terça', planejado: 90, realizado: 88, capacidade: 100 },
    { nome: 'Quarta', planejado: 95, realizado: 92, capacidade: 100 },
    { nome: 'Quinta', planejado: 88, realizado: 85, capacidade: 100 },
    { nome: 'Sexta', planejado: 82, realizado: 80, capacidade: 100 }
  ];

  const dadosOEE = [
    { name: 'Disponibilidade', value: 88 },
    { name: 'Performance', value: 85 },
    { name: 'Qualidade', value: 92 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const getStatusBadge = (status: string) => {
    const variants = {
      ativo: 'bg-green-100 text-green-800',
      parado: 'bg-red-100 text-red-800',
      manutencao: 'bg-yellow-100 text-yellow-800',
      inativo: 'bg-gray-100 text-gray-800',
      agendada: 'bg-blue-100 text-blue-800',
      em_progresso: 'bg-green-100 text-green-800',
      concluida: 'bg-emerald-100 text-emerald-800',
      atrasada: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getUtilizacaoColor = (percentual: number) => {
    if (percentual >= 90) return 'text-red-600';
    if (percentual >= 80) return 'text-yellow-600';
    if (percentual >= 70) return 'text-green-600';
    return 'text-gray-600';
  };

  const calcularOEE = () => {
    const disponibilidade = 88;
    const performance = 85;
    const qualidade = 92;
    return Math.round((disponibilidade * performance * qualidade) / 10000);
  };

  const otimizarCapacidade = () => {
    toast({
      title: "Otimização iniciada",
      description: "Recalculando alocação de recursos para maximizar eficiência",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Capacidade (CRP)</h1>
          <p className="text-muted-foreground">Planeamento e balanceamento da capacidade produtiva</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={otimizarCapacidade}>
            <Zap className="mr-2 h-4 w-4" />
            Otimizar
          </Button>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">OEE Global</p>
                <p className="text-2xl font-bold text-blue-600">{calcularOEE()}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Centros Ativos</p>
                <p className="text-2xl font-bold">
                  {centrosTrabalho.filter(c => c.status === 'ativo').length}/{centrosTrabalho.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Gargalos</p>
                <p className="text-2xl font-bold text-red-600">{analisesGargalo.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Utilização Média</p>
                <p className="text-2xl font-bold">82%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Tempo Ocioso</p>
                <p className="text-2xl font-bold">18%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="centros" className="w-full">
        <TabsList>
          <TabsTrigger value="centros">Centros de Trabalho</TabsTrigger>
          <TabsTrigger value="programacao">Programação</TabsTrigger>
          <TabsTrigger value="gantt">Gráfico de Gantt</TabsTrigger>
          <TabsTrigger value="gargalos">Análise de Gargalos</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="centros" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5" />
                Centros de Trabalho
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {centrosTrabalho.map((centro) => {
                  const carga = cargasTrabalho.find(c => c.centroTrabalhoId === centro.id);
                  const utilizacao = carga ? carga.percentualUtilizacao : 0;
                  
                  return (
                    <div key={centro.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Cog className="h-5 w-5 text-gray-600" />
                          <div>
                            <h4 className="font-semibold">{centro.nome}</h4>
                            <p className="text-sm text-gray-600">{centro.codigo}</p>
                          </div>
                        </div>
                        {getStatusBadge(centro.status)}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <Label className="text-xs text-gray-500">Capacidade</Label>
                          <p className="text-sm font-medium">{centro.capacidadeNominal} min/dia</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Eficiência</Label>
                          <p className="text-sm font-medium">{centro.eficienciaMedia}%</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Custo/Hora</Label>
                          <p className="text-sm font-medium">MT {centro.custoHora}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Operadores</Label>
                          <p className="text-sm font-medium">{centro.operadoresNecessarios}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500">Utilização Atual</span>
                          <span className={`text-sm font-medium ${getUtilizacaoColor(utilizacao)}`}>
                            {utilizacao}%
                          </span>
                        </div>
                        <Progress value={utilizacao} className="h-2" />
                        {carga?.gargalo && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            Gargalo identificado
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1">
                          <Eye className="mr-1 h-3 w-3" />
                          Detalhes
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1">
                          <Settings className="mr-1 h-3 w-3" />
                          Configurar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="programacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Programação da Produção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <Select value={viewType} onValueChange={(value: any) => setViewType(value)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Vista Diária</SelectItem>
                    <SelectItem value="semana">Vista Semanal</SelectItem>
                    <SelectItem value="mes">Vista Mensal</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="icon">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ordem</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Centro de Trabalho</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {programacoes.map((prog) => {
                      const progresso = prog.tempoEstimado > 0 ? 
                        Math.round((prog.tempoRealizado / prog.tempoEstimado) * 100) : 0;
                      
                      return (
                        <TableRow key={prog.id}>
                          <TableCell className="font-medium">{prog.ordemProducao}</TableCell>
                          <TableCell>{prog.produto}</TableCell>
                          <TableCell>{prog.quantidade}</TableCell>
                          <TableCell>{prog.centroTrabalho}</TableCell>
                          <TableCell>{format(new Date(prog.dataInicio), 'dd/MM', { locale: pt })}</TableCell>
                          <TableCell>{format(new Date(prog.dataFim), 'dd/MM', { locale: pt })}</TableCell>
                          <TableCell>T{prog.turno}</TableCell>
                          <TableCell>{getStatusBadge(prog.status)}</TableCell>
                          <TableCell>
                            <div className="w-24">
                              <Progress value={progresso} className="h-2" />
                              <span className="text-xs text-gray-500">{progresso}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline">
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Gráfico de Gantt - Carga de Máquinas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] p-4 bg-gray-50 rounded-lg">
                <div className="space-y-3">
                  {centrosTrabalho.map((centro) => (
                    <div key={centro.id} className="flex items-center gap-3">
                      <div className="w-32 text-sm font-medium">{centro.nome}</div>
                      <div className="flex-1 h-10 bg-white rounded border relative">
                        {programacoes
                          .filter(p => p.centroTrabalho === centro.nome)
                          .map((prog, idx) => (
                            <div
                              key={prog.id}
                              className={`absolute h-8 rounded flex items-center px-2 text-xs text-white ${
                                prog.status === 'em_progresso' ? 'bg-green-500' :
                                prog.status === 'agendada' ? 'bg-blue-500' :
                                prog.status === 'atrasada' ? 'bg-red-500' : 'bg-gray-500'
                              }`}
                              style={{
                                left: `${idx * 30}%`,
                                width: '25%',
                                top: '4px'
                              }}
                            >
                              {prog.ordemProducao}
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gargalos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Análise de Gargalos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analisesGargalo.map((analise, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-red-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <h4 className="font-semibold">{analise.centroTrabalho}</h4>
                      </div>
                      <Badge className="bg-red-100 text-red-800">
                        Gargalo {analise.percentualGargalo}%
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <Label className="text-xs text-gray-500">Horas Perdidas</Label>
                        <p className="text-sm font-medium">{analise.horasPerdidas}h</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Ordens em Espera</Label>
                        <p className="text-sm font-medium">{analise.ordemEsperando}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Impacto Financeiro</Label>
                        <p className="text-sm font-medium text-red-600">
                          MT {analise.impactoFinanceiro.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Causa Principal</Label>
                        <p className="text-sm font-medium">{analise.causaPrincipal}</p>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded p-3">
                      <Label className="text-xs text-gray-500">Sugestão de Melhoria</Label>
                      <p className="text-sm mt-1">{analise.sugestaoMelhoria}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Utilização da Capacidade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dadosUtilizacao}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="nome" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="planejado" stroke="#8884d8" name="Planeado" />
                    <Line type="monotone" dataKey="realizado" stroke="#82ca9d" name="Realizado" />
                    <Line type="monotone" dataKey="capacidade" stroke="#ff7300" name="Capacidade" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>OEE - Overall Equipment Effectiveness</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={dadosOEE}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label
                    >
                      {dadosOEE.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="text-center mt-2">
                  <p className="text-2xl font-bold">{calcularOEE()}%</p>
                  <p className="text-sm text-gray-500">OEE Global</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}