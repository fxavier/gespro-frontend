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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Users,
  User,
  Clock,
  Calendar,
  Award,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  DollarSign,
  Briefcase,
  GraduationCap,
  Shield,
  Timer,
  UserCheck,
  UserX,
  Coffee,
  Target,
  Zap,
  Filter,
  Download,
  Plus,
  XCircle
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

interface Operador {
  id: string;
  codigo: string;
  nome: string;
  foto?: string;
  cargo: string;
  departamento: string;
  turno: 'manha' | 'tarde' | 'noite' | 'rotativo';
  qualificacoes: string[];
  certificados: Certificado[];
  status: 'ativo' | 'ferias' | 'ausente' | 'inativo';
  dataAdmissao: string;
  salarioHora: number;
  eficienciaMedia: number;
  horasTrabalhadasMes: number;
  horasExtrasMes: number;
  faltasMes: number;
}

interface Certificado {
  nome: string;
  dataObtencao: string;
  dataValidade: string;
  status: 'valido' | 'expirando' | 'expirado';
}

interface RegistoPresenca {
  operadorId: string;
  data: string;
  entrada: string;
  saida?: string;
  horasTrabalhadas: number;
  horasExtras: number;
  turno: string;
  ordemProducao?: string;
  centroTrabalho?: string;
  producaoDia: number;
  eficiencia: number;
}

interface AlocacaoEquipa {
  id: string;
  data: string;
  turno: string;
  centroTrabalho: string;
  operadores: string[];
  lider: string;
  ordemProducao: string;
  metaProducao: number;
  producaoRealizada: number;
  eficienciaEquipa: number;
}

interface IndicadorDesempenho {
  operadorId: string;
  periodo: string;
  producaoTotal: number;
  eficienciaMedia: number;
  taxaQualidade: number;
  taxaPresenca: number;
  horasExtras: number;
  pontuacaoGeral: number;
}

export default function MaoObraPage() {
  const [selectedOperador, setSelectedOperador] = useState<Operador | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [turnoFilter, setTurnoFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Mock data
  const operadores: Operador[] = [
    {
      id: '1',
      codigo: 'OP-001',
      nome: 'João Silva',
      cargo: 'Operador de Máquina',
      departamento: 'Produção',
      turno: 'manha',
      qualificacoes: ['Operação de CNC', 'Segurança Industrial', 'Qualidade ISO 9001'],
      certificados: [
        {
          nome: 'Operação de CNC',
          dataObtencao: '2023-01-15',
          dataValidade: '2025-01-15',
          status: 'valido'
        },
        {
          nome: 'Segurança Industrial',
          dataObtencao: '2023-06-10',
          dataValidade: '2024-06-10',
          status: 'expirando'
        }
      ],
      status: 'ativo',
      dataAdmissao: '2022-03-10',
      salarioHora: 150.00,
      eficienciaMedia: 92,
      horasTrabalhadasMes: 176,
      horasExtrasMes: 12,
      faltasMes: 0
    },
    {
      id: '2',
      codigo: 'OP-002',
      nome: 'Maria Santos',
      cargo: 'Líder de Produção',
      departamento: 'Produção',
      turno: 'tarde',
      qualificacoes: ['Gestão de Equipas', 'Lean Manufacturing', 'Six Sigma Green Belt'],
      certificados: [
        {
          nome: 'Six Sigma Green Belt',
          dataObtencao: '2022-08-20',
          dataValidade: '2025-08-20',
          status: 'valido'
        }
      ],
      status: 'ativo',
      dataAdmissao: '2020-01-15',
      salarioHora: 200.00,
      eficienciaMedia: 95,
      horasTrabalhadasMes: 180,
      horasExtrasMes: 8,
      faltasMes: 0
    },
    {
      id: '3',
      codigo: 'OP-003',
      nome: 'Carlos Pereira',
      cargo: 'Operador de Montagem',
      departamento: 'Montagem',
      turno: 'manha',
      qualificacoes: ['Montagem Industrial', 'Leitura de Desenhos'],
      certificados: [],
      status: 'ferias',
      dataAdmissao: '2023-05-20',
      salarioHora: 120.00,
      eficienciaMedia: 88,
      horasTrabalhadasMes: 160,
      horasExtrasMes: 0,
      faltasMes: 2
    }
  ];

  const registosPresenca: RegistoPresenca[] = [
    {
      operadorId: '1',
      data: format(new Date(), 'yyyy-MM-dd'),
      entrada: '08:00',
      saida: '17:00',
      horasTrabalhadas: 8,
      horasExtras: 1,
      turno: 'manha',
      ordemProducao: 'OP-2024-001',
      centroTrabalho: 'CNC-001',
      producaoDia: 45,
      eficiencia: 92
    },
    {
      operadorId: '2',
      data: format(new Date(), 'yyyy-MM-dd'),
      entrada: '14:00',
      saida: '22:00',
      horasTrabalhadas: 8,
      horasExtras: 0,
      turno: 'tarde',
      ordemProducao: 'OP-2024-002',
      centroTrabalho: 'MONT-001',
      producaoDia: 120,
      eficiencia: 95
    }
  ];

  const alocacoesEquipa: AlocacaoEquipa[] = [
    {
      id: '1',
      data: format(new Date(), 'yyyy-MM-dd'),
      turno: 'manha',
      centroTrabalho: 'Linha de Montagem A',
      operadores: ['João Silva', 'Pedro Costa', 'Ana Lima'],
      lider: 'Maria Santos',
      ordemProducao: 'OP-2024-001',
      metaProducao: 100,
      producaoRealizada: 95,
      eficienciaEquipa: 95
    }
  ];

  // Dados para gráficos
  const dadosEficiencia = [
    { dia: 'Seg', eficiencia: 88, meta: 90 },
    { dia: 'Ter', eficiencia: 92, meta: 90 },
    { dia: 'Qua', eficiencia: 95, meta: 90 },
    { dia: 'Qui', eficiencia: 91, meta: 90 },
    { dia: 'Sex', eficiencia: 93, meta: 90 }
  ];

  const dadosCompetencias = [
    { competencia: 'Técnica', valor: 85 },
    { competencia: 'Qualidade', valor: 90 },
    { competencia: 'Produtividade', valor: 88 },
    { competencia: 'Segurança', valor: 95 },
    { competencia: 'Trabalho Equipa', valor: 92 },
    { competencia: 'Assiduidade', valor: 87 }
  ];

  const dadosPresenca = [
    { mes: 'Jan', presenca: 98, faltas: 2 },
    { mes: 'Fev', presenca: 96, faltas: 4 },
    { mes: 'Mar', presenca: 99, faltas: 1 },
    { mes: 'Abr', presenca: 97, faltas: 3 }
  ];

  const filteredOperadores = operadores.filter(operador => {
    const matchesTurno = turnoFilter === 'todos' || operador.turno === turnoFilter;
    const matchesStatus = statusFilter === 'todos' || operador.status === statusFilter;
    return matchesTurno && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      ativo: 'bg-green-100 text-green-800',
      ferias: 'bg-blue-100 text-blue-800',
      ausente: 'bg-yellow-100 text-yellow-800',
      inativo: 'bg-gray-100 text-gray-800'
    };
    
    const icons = {
      ativo: <UserCheck className="h-3 w-3" />,
      ferias: <Coffee className="h-3 w-3" />,
      ausente: <UserX className="h-3 w-3" />,
      inativo: <UserX className="h-3 w-3" />
    };
    
    return (
      <Badge className={`${variants[status as keyof typeof variants]} flex items-center gap-1`}>
        {icons[status as keyof typeof icons]}
        {status}
      </Badge>
    );
  };

  const getTurnoBadge = (turno: string) => {
    const variants = {
      manha: 'bg-yellow-100 text-yellow-800',
      tarde: 'bg-orange-100 text-orange-800',
      noite: 'bg-purple-100 text-purple-800',
      rotativo: 'bg-blue-100 text-blue-800'
    };
    
    return (
      <Badge className={variants[turno as keyof typeof variants]}>
        {turno}
      </Badge>
    );
  };

  const getCertificadoStatus = (status: string) => {
    const variants = {
      valido: 'text-green-600',
      expirando: 'text-yellow-600',
      expirado: 'text-red-600'
    };
    
    const icons = {
      valido: <CheckCircle className="h-4 w-4" />,
      expirando: <AlertTriangle className="h-4 w-4" />,
      expirado: <XCircle className="h-4 w-4" />
    };
    
    return (
      <div className={`flex items-center gap-1 ${variants[status as keyof typeof variants]}`}>
        {icons[status as keyof typeof icons]}
        <span className="text-sm">{status}</span>
      </div>
    );
  };

  const calcularCustoTotal = () => {
    return operadores.reduce((total, op) => {
      const horasTotal = op.horasTrabalhadasMes + op.horasExtrasMes;
      return total + (horasTotal * op.salarioHora);
    }, 0);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Mão de Obra</h1>
          <p className="text-muted-foreground">Gestão de operadores, turnos e eficiência</p>
        </div>
        <Button asChild>
          <Link href="/producao/mao-obra/novo">
            <Plus className="mr-2 h-4 w-4" />
            Novo Operador
          </Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total Operadores</p>
                <p className="text-2xl font-bold">{operadores.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Presentes Hoje</p>
                <p className="text-2xl font-bold">
                  {operadores.filter(o => o.status === 'ativo').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Eficiência Média</p>
                <p className="text-2xl font-bold">91%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Horas Extras</p>
                <p className="text-2xl font-bold">20h</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Custo Mensal</p>
                <p className="text-2xl font-bold">
                  MT {calcularCustoTotal().toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="operadores" className="w-full">
        <TabsList>
          <TabsTrigger value="operadores">Operadores</TabsTrigger>
          <TabsTrigger value="presenca">Controlo de Presença</TabsTrigger>
          <TabsTrigger value="alocacao">Alocação de Equipas</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="formacao">Formação</TabsTrigger>
        </TabsList>

        <TabsContent value="operadores" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Lista de Operadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar operador..."
                      className="w-full pl-10"
                    />
                  </div>
                </div>
                
                <Select value={turnoFilter} onValueChange={setTurnoFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Turno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Turnos</SelectItem>
                    <SelectItem value="manha">Manhã</SelectItem>
                    <SelectItem value="tarde">Tarde</SelectItem>
                    <SelectItem value="noite">Noite</SelectItem>
                    <SelectItem value="rotativo">Rotativo</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Status</SelectItem>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="ferias">Férias</SelectItem>
                    <SelectItem value="ausente">Ausente</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
                
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operador</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Eficiência</TableHead>
                      <TableHead>Horas/Mês</TableHead>
                      <TableHead>Extras</TableHead>
                      <TableHead>Faltas</TableHead>
                      <TableHead>Custo/Hora</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOperadores.map((operador) => (
                      <TableRow key={operador.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={operador.foto} />
                              <AvatarFallback>
                                {operador.nome.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{operador.nome}</div>
                              <div className="text-sm text-gray-500">{operador.codigo}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{operador.cargo}</TableCell>
                        <TableCell>{operador.departamento}</TableCell>
                        <TableCell>{getTurnoBadge(operador.turno)}</TableCell>
                        <TableCell>{getStatusBadge(operador.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={operador.eficienciaMedia} className="w-16 h-2" />
                            <span className="text-sm">{operador.eficienciaMedia}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{operador.horasTrabalhadasMes}h</TableCell>
                        <TableCell>{operador.horasExtrasMes}h</TableCell>
                        <TableCell>
                          <Badge variant={operador.faltasMes > 0 ? 'destructive' : 'outline'}>
                            {operador.faltasMes}
                          </Badge>
                        </TableCell>
                        <TableCell>MT {operador.salarioHora}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedOperador(operador);
                              setIsDialogOpen(true);
                            }}
                          >
                            Ver Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presenca" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Controlo de Presença - {format(new Date(), 'dd/MM/yyyy', { locale: pt })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operador</TableHead>
                      <TableHead>Turno</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Horas Trabalhadas</TableHead>
                      <TableHead>Horas Extras</TableHead>
                      <TableHead>Ordem Produção</TableHead>
                      <TableHead>Centro Trabalho</TableHead>
                      <TableHead>Produção</TableHead>
                      <TableHead>Eficiência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registosPresenca.map((registo, index) => {
                      const operador = operadores.find(o => o.id === registo.operadorId);
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {operador?.nome.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium">{operador?.nome}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getTurnoBadge(registo.turno)}</TableCell>
                          <TableCell>{registo.entrada}</TableCell>
                          <TableCell>{registo.saida || '-'}</TableCell>
                          <TableCell>{registo.horasTrabalhadas}h</TableCell>
                          <TableCell>
                            <Badge variant={registo.horasExtras > 0 ? 'secondary' : 'outline'}>
                              {registo.horasExtras}h
                            </Badge>
                          </TableCell>
                          <TableCell>{registo.ordemProducao}</TableCell>
                          <TableCell>{registo.centroTrabalho}</TableCell>
                          <TableCell>{registo.producaoDia} unidades</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={registo.eficiencia} className="w-16 h-2" />
                              <span className="text-sm">{registo.eficiencia}%</span>
                            </div>
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

        <TabsContent value="alocacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Alocação de Equipas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alocacoesEquipa.map((alocacao) => (
                  <div key={alocacao.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{alocacao.centroTrabalho}</h4>
                        <p className="text-sm text-gray-600">Ordem: {alocacao.ordemProducao}</p>
                      </div>
                      <Badge>{alocacao.turno}</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <Label className="text-xs text-gray-500">Líder</Label>
                        <p className="text-sm font-medium">{alocacao.lider}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Meta</Label>
                        <p className="text-sm">{alocacao.metaProducao} unidades</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Realizado</Label>
                        <p className="text-sm">{alocacao.producaoRealizada} unidades</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Eficiência</Label>
                        <p className="text-sm font-medium text-green-600">{alocacao.eficienciaEquipa}%</p>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-gray-500">Equipa</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {alocacao.operadores.map((op, idx) => (
                          <Badge key={idx} variant="outline">{op}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button className="w-full mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Nova Alocação
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="desempenho" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Eficiência Semanal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dadosEficiencia}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dia" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="eficiencia" stroke="#8884d8" name="Eficiência" />
                    <Line type="monotone" dataKey="meta" stroke="#82ca9d" name="Meta" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Matriz de Competências</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={dadosCompetencias}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="competencia" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar name="Competências" dataKey="valor" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Taxa de Presença vs Faltas</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dadosPresenca}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="presenca" fill="#82ca9d" name="Presença %" />
                  <Bar dataKey="faltas" fill="#ff7300" name="Faltas %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="formacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Gestão de Certificados e Formação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {operadores.map((operador) => (
                  <div key={operador.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Avatar>
                          <AvatarFallback>
                            {operador.nome.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-semibold">{operador.nome}</h4>
                          <p className="text-sm text-gray-600">{operador.cargo}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar Formação
                      </Button>
                    </div>
                    
                    {operador.certificados.length > 0 ? (
                      <div className="space-y-2">
                        {operador.certificados.map((cert, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div>
                              <p className="text-sm font-medium">{cert.nome}</p>
                              <p className="text-xs text-gray-500">
                                Válido até {format(new Date(cert.dataValidade), 'dd/MM/yyyy', { locale: pt })}
                              </p>
                            </div>
                            {getCertificadoStatus(cert.status)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Sem certificados registados
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Operador</DialogTitle>
          </DialogHeader>
          
          {selectedOperador && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback>
                    {selectedOperador.nome.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{selectedOperador.nome}</h3>
                  <p className="text-sm text-gray-600">{selectedOperador.cargo}</p>
                  <p className="text-sm text-gray-500">{selectedOperador.codigo}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Departamento</Label>
                  <p className="font-medium">{selectedOperador.departamento}</p>
                </div>
                <div>
                  <Label className="text-sm">Turno</Label>
                  <div className="mt-1">{getTurnoBadge(selectedOperador.turno)}</div>
                </div>
                <div>
                  <Label className="text-sm">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedOperador.status)}</div>
                </div>
                <div>
                  <Label className="text-sm">Data de Admissão</Label>
                  <p className="font-medium">
                    {format(new Date(selectedOperador.dataAdmissao), 'dd/MM/yyyy', { locale: pt })}
                  </p>
                </div>
                <div>
                  <Label className="text-sm">Salário/Hora</Label>
                  <p className="font-medium">MT {selectedOperador.salarioHora}</p>
                </div>
                <div>
                  <Label className="text-sm">Eficiência Média</Label>
                  <p className="font-medium">{selectedOperador.eficienciaMedia}%</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm">Qualificações</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedOperador.qualificacoes.map((qual, idx) => (
                    <Badge key={idx} variant="secondary">{qual}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button>Editar Operador</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}