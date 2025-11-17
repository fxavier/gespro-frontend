'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ClipboardCheck,
  FileText,
  Microscope,
  Award,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Package,
  Users,
  Calendar,
  Clock,
  Target,
  Zap,
  Eye,
  Plus,
  Filter,
  Download,
  RefreshCw
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

interface InspecaoQualidade {
  id: string;
  numero: string;
  ordemProducao: string;
  produto: string;
  lote: string;
  dataInspecao: string;
  inspector: string;
  tipo: 'entrada' | 'processo' | 'final' | 'expedicao';
  status: 'aprovado' | 'rejeitado' | 'condicional' | 'em_analise';
  quantidadeInspecionada: number;
  quantidadeAprovada: number;
  quantidadeRejeitada: number;
  checklist: ChecklistItem[];
  defeitos: Defeito[];
  observacoes?: string;
  certificado?: string;
}

interface ChecklistItem {
  id: string;
  descricao: string;
  especificacao: string;
  valorMedido?: number;
  resultado: 'ok' | 'nok' | 'na';
  obrigatorio: boolean;
  categoria: 'dimensional' | 'visual' | 'funcional' | 'seguranca';
}

interface Defeito {
  tipo: string;
  descricao: string;
  gravidade: 'critico' | 'maior' | 'menor';
  quantidade: number;
  acaoCorretiva?: string;
  responsavel?: string;
}

interface PadraoQualidade {
  id: string;
  produto: string;
  versao: string;
  criterios: CriterioQualidade[];
  aprovadoPor: string;
  dataAprovacao: string;
  status: 'ativo' | 'rascunho' | 'obsoleto';
}

interface CriterioQualidade {
  parametro: string;
  especificacao: string;
  tolerancia: string;
  metodologia: string;
  frequencia: string;
  obrigatorio: boolean;
}

interface NaoConformidade {
  id: string;
  numero: string;
  dataDeteccao: string;
  produto: string;
  lote: string;
  ordemProducao: string;
  tipoDefeito: string;
  descricao: string;
  gravidade: 'critico' | 'maior' | 'menor';
  origem: 'interna' | 'cliente' | 'fornecedor';
  responsavel: string;
  status: 'aberta' | 'em_analise' | 'em_correcao' | 'fechada';
  prazoCorrecao: string;
  custoEstimado: number;
  acaoCorretiva?: string;
  acaoPreventiva?: string;
}

export default function QualidadePage() {
  const [selectedInspecao, setSelectedInspecao] = useState<InspecaoQualidade | null>(null);
  const [selectedNaoConformidade, setSelectedNaoConformidade] = useState<NaoConformidade | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Mock data
  const inspecoes: InspecaoQualidade[] = [
    {
      id: '1',
      numero: 'INS-2024-001',
      ordemProducao: 'OP-2024-001',
      produto: 'Bolo de Chocolate Premium',
      lote: 'LOTE-2024-10-001',
      dataInspecao: '2024-10-20',
      inspector: 'Ana Silva',
      tipo: 'final',
      status: 'aprovado',
      quantidadeInspecionada: 50,
      quantidadeAprovada: 48,
      quantidadeRejeitada: 2,
      checklist: [
        {
          id: '1',
          descricao: 'Peso do produto',
          especificacao: '500g ± 5g',
          valorMedido: 502,
          resultado: 'ok',
          obrigatorio: true,
          categoria: 'dimensional'
        },
        {
          id: '2',
          descricao: 'Aparência visual',
          especificacao: 'Sem rachaduras ou deformações',
          resultado: 'ok',
          obrigatorio: true,
          categoria: 'visual'
        }
      ],
      defeitos: [
        {
          tipo: 'Rachadura superficial',
          descricao: 'Pequenas rachaduras na cobertura',
          gravidade: 'menor',
          quantidade: 2,
          acaoCorretiva: 'Ajustar temperatura do forno'
        }
      ],
      observacoes: 'Lote dentro dos padrões de qualidade',
      certificado: 'CERT-2024-001'
    },
    {
      id: '2',
      numero: 'INS-2024-002',
      ordemProducao: 'OP-2024-002',
      produto: 'Mesa Executive',
      lote: 'LOTE-2024-10-002',
      dataInspecao: '2024-10-19',
      inspector: 'Carlos Pereira',
      tipo: 'processo',
      status: 'em_analise',
      quantidadeInspecionada: 10,
      quantidadeAprovada: 0,
      quantidadeRejeitada: 0,
      checklist: [
        {
          id: '3',
          descricao: 'Acabamento da madeira',
          especificacao: 'Lixa grão 240',
          resultado: 'ok',
          obrigatorio: true,
          categoria: 'visual'
        }
      ],
      defeitos: [],
      observacoes: 'Inspeção em andamento'
    }
  ];

  const naoConformidades: NaoConformidade[] = [
    {
      id: '1',
      numero: 'NC-2024-001',
      dataDeteccao: '2024-10-18',
      produto: 'Bolo de Chocolate Premium',
      lote: 'LOTE-2024-10-001',
      ordemProducao: 'OP-2024-001',
      tipoDefeito: 'Dimensional',
      descricao: 'Produto fora das especificações de peso',
      gravidade: 'maior',
      origem: 'interna',
      responsavel: 'João Silva',
      status: 'em_correcao',
      prazoCorrecao: '2024-10-25',
      custoEstimado: 1500.00,
      acaoCorretiva: 'Recalibração da balança de dosagem',
      acaoPreventiva: 'Implementar verificação diária das balanças'
    },
    {
      id: '2',
      numero: 'NC-2024-002',
      dataDeteccao: '2024-10-17',
      produto: 'Mesa Executive',
      lote: 'LOTE-2024-09-005',
      ordemProducao: 'OP-2024-001',
      tipoDefeito: 'Funcional',
      descricao: 'Gaveta não desliza adequadamente',
      gravidade: 'critico',
      origem: 'cliente',
      responsavel: 'Maria Santos',
      status: 'fechada',
      prazoCorrecao: '2024-10-20',
      custoEstimado: 850.00,
      acaoCorretiva: 'Substituição das corrediças',
      acaoPreventiva: 'Teste funcional em 100% dos produtos'
    }
  ];

  const padroesQualidade: PadraoQualidade[] = [
    {
      id: '1',
      produto: 'Bolo de Chocolate Premium',
      versao: 'v2.1',
      criterios: [
        {
          parametro: 'Peso',
          especificacao: '500g ± 5g',
          tolerancia: '± 1%',
          metodologia: 'Balança digital',
          frequencia: '100% dos produtos',
          obrigatorio: true
        },
        {
          parametro: 'Temperatura interna',
          especificacao: 'Totalmente assado',
          tolerancia: 'Mín. 70°C',
          metodologia: 'Termômetro digital',
          frequencia: 'Amostragem 10%',
          obrigatorio: true
        }
      ],
      aprovadoPor: 'Diretor Qualidade',
      dataAprovacao: '2024-01-15',
      status: 'ativo'
    }
  ];

  // Dados para gráficos
  const dadosQualidade = [
    { dia: 'Seg', aprovados: 95, rejeitados: 5, meta: 98 },
    { dia: 'Ter', aprovados: 97, rejeitados: 3, meta: 98 },
    { dia: 'Qua', aprovados: 93, rejeitados: 7, meta: 98 },
    { dia: 'Qui', aprovados: 96, rejeitados: 4, meta: 98 },
    { dia: 'Sex', aprovados: 98, rejeitados: 2, meta: 98 }
  ];

  const dadosDefeitos = [
    { tipo: 'Dimensional', quantidade: 12 },
    { tipo: 'Visual', quantidade: 8 },
    { tipo: 'Funcional', quantidade: 5 },
    { tipo: 'Segurança', quantidade: 2 }
  ];

  const dadosConformidade = [
    { nome: 'Conforme', valor: 87, cor: '#00C49F' },
    { nome: 'Não Conforme', valor: 13, cor: '#FF8042' }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const getStatusBadge = (status: string) => {
    const variants = {
      aprovado: 'bg-green-100 text-green-800',
      rejeitado: 'bg-red-100 text-red-800',
      condicional: 'bg-yellow-100 text-yellow-800',
      em_analise: 'bg-blue-100 text-blue-800',
      aberta: 'bg-red-100 text-red-800',
      em_correcao: 'bg-yellow-100 text-yellow-800',
      fechada: 'bg-green-100 text-green-800'
    };
    
    const icons = {
      aprovado: <CheckCircle className="h-3 w-3" />,
      rejeitado: <XCircle className="h-3 w-3" />,
      condicional: <AlertTriangle className="h-3 w-3" />,
      em_analise: <Clock className="h-3 w-3" />,
      aberta: <XCircle className="h-3 w-3" />,
      em_correcao: <RefreshCw className="h-3 w-3" />,
      fechada: <CheckCircle className="h-3 w-3" />
    };
    
    return (
      <Badge className={`${variants[status as keyof typeof variants]} flex items-center gap-1`}>
        {icons[status as keyof typeof icons]}
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getTipoBadge = (tipo: string) => {
    const variants = {
      entrada: 'bg-blue-100 text-blue-800',
      processo: 'bg-yellow-100 text-yellow-800',
      final: 'bg-purple-100 text-purple-800',
      expedicao: 'bg-green-100 text-green-800'
    };
    
    return (
      <Badge className={variants[tipo as keyof typeof variants]}>
        {tipo}
      </Badge>
    );
  };

  const getGravidadeBadge = (gravidade: string) => {
    const variants = {
      critico: 'bg-red-100 text-red-800',
      maior: 'bg-orange-100 text-orange-800',
      menor: 'bg-yellow-100 text-yellow-800'
    };
    
    return (
      <Badge className={variants[gravidade as keyof typeof variants]}>
        {gravidade}
      </Badge>
    );
  };

  const calcularIndicadores = () => {
    const totalInspecoes = inspecoes.length;
    const aprovadas = inspecoes.filter(i => i.status === 'aprovado').length;
    const rejeitadas = inspecoes.filter(i => i.status === 'rejeitado').length;
    
    return {
      taxa_aprovacao: totalInspecoes > 0 ? Math.round((aprovadas / totalInspecoes) * 100) : 0,
      taxa_rejeicao: totalInspecoes > 0 ? Math.round((rejeitadas / totalInspecoes) * 100) : 0,
      nao_conformidades_abertas: naoConformidades.filter(nc => nc.status !== 'fechada').length
    };
  };

  const indicadores = calcularIndicadores();

  const filteredInspecoes = inspecoes.filter(inspecao => {
    const matchesTipo = tipoFilter === 'todos' || inspecao.tipo === tipoFilter;
    const matchesStatus = statusFilter === 'todos' || inspecao.status === statusFilter;
    return matchesTipo && matchesStatus;
  });

  const executarInspecao = () => {
    toast({
      title: "Nova inspeção iniciada",
      description: "Checklist de qualidade criado com sucesso",
    });
  };

  const gerarCertificado = () => {
    toast({
      title: "Certificado gerado",
      description: "Certificado de qualidade disponível para download",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Rastreabilidade e Controlo de Qualidade</h1>
          <p className="text-muted-foreground">Gestão de inspeções, conformidade e rastreabilidade</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={executarInspecao}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Inspeção
          </Button>
          <Button variant="outline" onClick={gerarCertificado}>
            <Award className="mr-2 h-4 w-4" />
            Certificado
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Taxa Aprovação</p>
                <p className="text-2xl font-bold text-green-600">{indicadores.taxa_aprovacao}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Taxa Rejeição</p>
                <p className="text-2xl font-bold text-red-600">{indicadores.taxa_rejeicao}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">NC Abertas</p>
                <p className="text-2xl font-bold text-orange-600">{indicadores.nao_conformidades_abertas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Inspeções Hoje</p>
                <p className="text-2xl font-bold">{inspecoes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Meta Qualidade</p>
                <p className="text-2xl font-bold">98%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inspecoes" className="w-full">
        <TabsList>
          <TabsTrigger value="inspecoes">Inspeções</TabsTrigger>
          <TabsTrigger value="rastreabilidade">Rastreabilidade</TabsTrigger>
          <TabsTrigger value="nao-conformidades">Não Conformidades</TabsTrigger>
          <TabsTrigger value="padroes">Padrões de Qualidade</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="inspecoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Inspeções de Qualidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por número, produto ou lote..."
                    className="w-full"
                  />
                </div>
                
                <Select value={tipoFilter} onValueChange={setTipoFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Tipos</SelectItem>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="processo">Processo</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                    <SelectItem value="expedicao">Expedição</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Status</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="rejeitado">Rejeitado</SelectItem>
                    <SelectItem value="condicional">Condicional</SelectItem>
                    <SelectItem value="em_analise">Em Análise</SelectItem>
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
                      <TableHead>Número</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Inspector</TableHead>
                      <TableHead>Qtd Inspecionada</TableHead>
                      <TableHead>Taxa Aprovação</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInspecoes.map((inspecao) => {
                      const taxaAprovacao = inspecao.quantidadeInspecionada > 0 
                        ? Math.round((inspecao.quantidadeAprovada / inspecao.quantidadeInspecionada) * 100)
                        : 0;
                      
                      return (
                        <TableRow key={inspecao.id}>
                          <TableCell className="font-medium">{inspecao.numero}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{inspecao.produto}</div>
                              <div className="text-sm text-gray-500">{inspecao.ordemProducao}</div>
                            </div>
                          </TableCell>
                          <TableCell>{inspecao.lote}</TableCell>
                          <TableCell>{getTipoBadge(inspecao.tipo)}</TableCell>
                          <TableCell>{getStatusBadge(inspecao.status)}</TableCell>
                          <TableCell>{inspecao.inspector}</TableCell>
                          <TableCell>{inspecao.quantidadeInspecionada}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={taxaAprovacao} className="w-16 h-2" />
                              <span className="text-sm">{taxaAprovacao}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(inspecao.dataInspecao), 'dd/MM/yyyy', { locale: pt })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedInspecao(inspecao);
                                setIsDialogOpen(true);
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver
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

        <TabsContent value="rastreabilidade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Rastreabilidade do Produto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Buscar Lote ou Número de Série</Label>
                    <Input placeholder="Ex: LOTE-2024-10-001" />
                  </div>
                  <Button className="mt-6">
                    <Microscope className="mr-2 h-4 w-4" />
                    Rastrear
                  </Button>
                </div>
                
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-3">Histórico do Lote: LOTE-2024-10-001</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-white rounded border-l-4 border-blue-500">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="font-medium">Ordem de Produção Criada</p>
                        <p className="text-sm text-gray-600">OP-2024-001 - 20/10/2024 08:00</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-white rounded border-l-4 border-yellow-500">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="font-medium">Matérias-Primas Alocadas</p>
                        <p className="text-sm text-gray-600">Farinha: LOTE-MP-001, Ovos: LOTE-MP-002 - 20/10/2024 08:30</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-white rounded border-l-4 border-green-500">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="font-medium">Produção Concluída</p>
                        <p className="text-sm text-gray-600">50 unidades produzidas - 20/10/2024 16:00</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-white rounded border-l-4 border-purple-500">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <div className="flex-1">
                        <p className="font-medium">Inspeção de Qualidade</p>
                        <p className="text-sm text-gray-600">INS-2024-001 - Aprovado: 48 unidades - 20/10/2024 17:00</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nao-conformidades" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Não Conformidades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {naoConformidades.map((nc) => (
                  <div key={nc.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-600" />
                        <div>
                          <h4 className="font-semibold">{nc.numero}</h4>
                          <p className="text-sm text-gray-600">{nc.produto} - {nc.lote}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getGravidadeBadge(nc.gravidade)}
                        {getStatusBadge(nc.status)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <Label className="text-xs text-gray-500">Tipo Defeito</Label>
                        <p className="text-sm font-medium">{nc.tipoDefeito}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Origem</Label>
                        <p className="text-sm">{nc.origem}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Responsável</Label>
                        <p className="text-sm">{nc.responsavel}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Custo Estimado</Label>
                        <p className="text-sm font-medium">MT {nc.custoEstimado.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-gray-500">Descrição</Label>
                        <p className="text-sm">{nc.descricao}</p>
                      </div>
                      
                      {nc.acaoCorretiva && (
                        <div>
                          <Label className="text-xs text-gray-500">Ação Corretiva</Label>
                          <p className="text-sm">{nc.acaoCorretiva}</p>
                        </div>
                      )}
                      
                      {nc.acaoPreventiva && (
                        <div>
                          <Label className="text-xs text-gray-500">Ação Preventiva</Label>
                          <p className="text-sm">{nc.acaoPreventiva}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center mt-3 pt-3 border-t">
                      <span className="text-xs text-gray-500">
                        Detectado em: {format(new Date(nc.dataDeteccao), 'dd/MM/yyyy', { locale: pt })}
                      </span>
                      {nc.status !== 'fechada' && (
                        <span className="text-xs text-gray-500">
                          Prazo: {format(new Date(nc.prazoCorrecao), 'dd/MM/yyyy', { locale: pt })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="padroes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Padrões de Qualidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {padroesQualidade.map((padrao) => (
                  <div key={padrao.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{padrao.produto}</h4>
                        <p className="text-sm text-gray-600">Versão: {padrao.versao}</p>
                      </div>
                      <Badge variant={padrao.status === 'ativo' ? 'default' : 'secondary'}>
                        {padrao.status}
                      </Badge>
                    </div>
                    
                    <div className="space-y-3">
                      {padrao.criterios.map((criterio, index) => (
                        <div key={index} className="p-3 bg-gray-50 rounded">
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                            <div>
                              <Label className="text-xs text-gray-500">Parâmetro</Label>
                              <p className="font-medium">{criterio.parametro}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Especificação</Label>
                              <p>{criterio.especificacao}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Tolerância</Label>
                              <p>{criterio.tolerancia}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Metodologia</Label>
                              <p>{criterio.metodologia}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Frequência</Label>
                              <p>{criterio.frequencia}</p>
                            </div>
                          </div>
                          {criterio.obrigatorio && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              Obrigatório
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="flex justify-between items-center mt-3 pt-3 border-t text-sm text-gray-500">
                      <span>Aprovado por: {padrao.aprovadoPor}</span>
                      <span>
                        Data: {format(new Date(padrao.dataAprovacao), 'dd/MM/yyyy', { locale: pt })}
                      </span>
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
                <CardTitle>Taxa de Qualidade Semanal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dadosQualidade}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dia" />
                    <YAxis domain={[80, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="aprovados" stroke="#00C49F" name="Aprovados %" />
                    <Line type="monotone" dataKey="meta" stroke="#ff7300" name="Meta %" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Defeitos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dadosDefeitos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tipo" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Taxa de Conformidade Global</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width={300} height={300}>
                  <PieChart>
                    <Pie
                      data={dadosConformidade}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="valor"
                      label={(entry) => `${entry.nome}: ${entry.valor}%`}
                    >
                      {dadosConformidade.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.cor} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes da Inspeção */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Detalhes da Inspeção
            </DialogTitle>
            <DialogDescription>
              Checklist e resultados da inspeção de qualidade
            </DialogDescription>
          </DialogHeader>
          
          {selectedInspecao && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium">Número</Label>
                  <p className="text-sm">{selectedInspecao.numero}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Produto</Label>
                  <p className="text-sm">{selectedInspecao.produto}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Lote</Label>
                  <p className="text-sm">{selectedInspecao.lote}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Inspector</Label>
                  <p className="text-sm">{selectedInspecao.inspector}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-3 block">Checklist de Qualidade</Label>
                <div className="space-y-2">
                  {selectedInspecao.checklist.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1">
                        <p className="font-medium">{item.descricao}</p>
                        <p className="text-sm text-gray-600">{item.especificacao}</p>
                        {item.valorMedido && (
                          <p className="text-sm">Valor medido: {item.valorMedido}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.categoria === 'dimensional' ? 'default' : 'secondary'}>
                          {item.categoria}
                        </Badge>
                        {item.resultado === 'ok' ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : item.resultado === 'nok' ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <Clock className="h-5 w-5 text-gray-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {selectedInspecao.defeitos.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-3 block">Defeitos Identificados</Label>
                  <div className="space-y-2">
                    {selectedInspecao.defeitos.map((defeito, index) => (
                      <div key={index} className="p-3 bg-red-50 border rounded">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium">{defeito.tipo}</h5>
                          {getGravidadeBadge(defeito.gravidade)}
                        </div>
                        <p className="text-sm mb-2">{defeito.descricao}</p>
                        <p className="text-sm text-gray-600">Quantidade: {defeito.quantidade}</p>
                        {defeito.acaoCorretiva && (
                          <p className="text-sm mt-2">
                            <strong>Ação:</strong> {defeito.acaoCorretiva}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedInspecao.observacoes && (
                <div>
                  <Label className="text-sm font-medium">Observações</Label>
                  <p className="text-sm mt-1">{selectedInspecao.observacoes}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button onClick={gerarCertificado}>
              <Award className="mr-2 h-4 w-4" />
              Gerar Certificado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}