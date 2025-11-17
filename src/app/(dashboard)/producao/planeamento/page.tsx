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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import {
  CalendarIcon,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Factory,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  ShoppingCart,
  Truck,
  Wrench,
  Calculator,
  RefreshCw,
  Download,
  Settings,
  Brain,
  Zap,
  FileText,
  Eye,
  Play
} from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface NecessidadeMaterial {
  id: string;
  codigoMaterial: string;
  nomeMaterial: string;
  quantidadeNecessaria: number;
  quantidadeDisponivel: number;
  quantidadeComprar: number;
  unidadeMedida: string;
  fornecedorSugerido: string;
  leadTime: number;
  dataEntregaEstimada: string;
  custoEstimado: number;
  status: 'disponivel' | 'insuficiente' | 'indisponivel';
  criticidade: 'baixa' | 'media' | 'alta' | 'critica';
}

interface SugestaoOrdem {
  id: string;
  tipo: 'producao' | 'compra';
  produto?: string;
  material?: string;
  quantidade: number;
  unidadeMedida: string;
  dataInicio: string;
  dataFim: string;
  justificativa: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  custoEstimado: number;
  impactoCapacidade: number;
  dependencias: string[];
  aprovada: boolean;
}

interface AnaliseCapacidade {
  centroTrabalho: string;
  capacidadeMaxima: number;
  capacidadeUtilizada: number;
  percentualUtilizacao: number;
  gargalo: boolean;
  periodoSobrecarga: string[];
  sugestaoOtimizacao: string;
}

interface PrevencaoVendas {
  periodo: string;
  produto: string;
  quantidadePrevista: number;
  confianca: number; // %
  baseCalculo: 'historico' | 'tendencia' | 'sazonalidade' | 'pedidos';
}

export default function PlaneamentoPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAnalise, setSelectedAnalise] = useState<string>('necessidades');

  // Mock data
  const necessidadesMateriais: NecessidadeMaterial[] = [
    {
      id: '1',
      codigoMaterial: 'MAT-001',
      nomeMaterial: 'Farinha de Trigo',
      quantidadeNecessaria: 500,
      quantidadeDisponivel: 150,
      quantidadeComprar: 350,
      unidadeMedida: 'kg',
      fornecedorSugerido: 'Moageira Central',
      leadTime: 3,
      dataEntregaEstimada: '2024-10-25',
      custoEstimado: 3500.00,
      status: 'insuficiente',
      criticidade: 'alta'
    },
    {
      id: '2',
      codigoMaterial: 'MAT-002',
      nomeMaterial: 'Ovos Frescos',
      quantidadeNecessaria: 1200,
      quantidadeDisponivel: 200,
      quantidadeComprar: 1000,
      unidadeMedida: 'unidades',
      fornecedorSugerido: 'Aviário do Sul',
      leadTime: 1,
      dataEntregaEstimada: '2024-10-22',
      custoEstimado: 2500.00,
      status: 'insuficiente',
      criticidade: 'critica'
    },
    {
      id: '3',
      codigoMaterial: 'MAT-003',
      nomeMaterial: 'Açúcar Refinado',
      quantidadeNecessaria: 200,
      quantidadeDisponivel: 250,
      quantidadeComprar: 0,
      unidadeMedida: 'kg',
      fornecedorSugerido: '-',
      leadTime: 0,
      dataEntregaEstimada: '-',
      custoEstimado: 0,
      status: 'disponivel',
      criticidade: 'baixa'
    }
  ];

  const sugestoesOrdens: SugestaoOrdem[] = [
    {
      id: '1',
      tipo: 'compra',
      material: 'Farinha de Trigo',
      quantidade: 350,
      unidadeMedida: 'kg',
      dataInicio: '2024-10-22',
      dataFim: '2024-10-25',
      justificativa: 'Stock insuficiente para ordens de produção planejadas',
      prioridade: 'alta',
      custoEstimado: 3500.00,
      impactoCapacidade: 0,
      dependencias: [],
      aprovada: false
    },
    {
      id: '2',
      tipo: 'producao',
      produto: 'Bolo de Chocolate Premium',
      quantidade: 100,
      unidadeMedida: 'unidades',
      dataInicio: '2024-10-26',
      dataFim: '2024-10-28',
      justificativa: 'Reposição de stock baseada em vendas previstas',
      prioridade: 'media',
      custoEstimado: 12500.00,
      impactoCapacidade: 75,
      dependencias: ['Compra Farinha de Trigo'],
      aprovada: false
    }
  ];

  const analiseCapacidade: AnaliseCapacidade[] = [
    {
      centroTrabalho: 'Forno Industrial',
      capacidadeMaxima: 480, // minutos por dia
      capacidadeUtilizada: 420,
      percentualUtilizacao: 87.5,
      gargalo: true,
      periodoSobrecarga: ['2024-10-25', '2024-10-26'],
      sugestaoOtimizacao: 'Considerar turno adicional ou equipamento extra'
    },
    {
      centroTrabalho: 'Misturador Industrial',
      capacidadeMaxima: 480,
      capacidadeUtilizada: 240,
      percentualUtilizacao: 50,
      gargalo: false,
      periodoSobrecarga: [],
      sugestaoOtimizacao: 'Capacidade ociosa disponível'
    },
    {
      centroTrabalho: 'Bancada Decoração',
      capacidadeMaxima: 480,
      capacidadeUtilizada: 360,
      percentualUtilizacao: 75,
      gargalo: false,
      periodoSobrecarga: [],
      sugestaoOtimizacao: 'Utilização otimizada'
    }
  ];

  const prevencoesVendas: PrevencaoVendas[] = [
    {
      periodo: 'Próxima Semana',
      produto: 'Bolo de Chocolate Premium',
      quantidadePrevista: 75,
      confianca: 85,
      baseCalculo: 'historico'
    },
    {
      periodo: 'Próximo Mês',
      produto: 'Mesa Executive',
      quantidadePrevista: 25,
      confianca: 70,
      baseCalculo: 'tendencia'
    }
  ];

  const getStatusBadge = (status: string) => {
    const variants = {
      disponivel: 'bg-green-100 text-green-800',
      insuficiente: 'bg-yellow-100 text-yellow-800',
      indisponivel: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  const getCriticidadeBadge = (criticidade: string) => {
    const variants = {
      baixa: 'bg-gray-100 text-gray-800',
      media: 'bg-blue-100 text-blue-800',
      alta: 'bg-orange-100 text-orange-800',
      critica: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={variants[criticidade as keyof typeof variants]}>
        {criticidade}
      </Badge>
    );
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const variants = {
      baixa: 'bg-gray-100 text-gray-800',
      media: 'bg-yellow-100 text-yellow-800',
      alta: 'bg-orange-100 text-orange-800',
      urgente: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={variants[prioridade as keyof typeof variants]}>
        {prioridade}
      </Badge>
    );
  };

  const aprovarSugestao = (id: string) => {
    toast({
      title: "Sugestão aprovada",
      description: "A ordem será criada automaticamente",
    });
  };

  const executarMRP = () => {
    toast({
      title: "MRP executado",
      description: "Cálculo de necessidades atualizado com sucesso",
    });
  };

  const gerarRelatorio = () => {
    toast({
      title: "Relatório gerado",
      description: "Relatório de planeamento disponível para download",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Planeamento da Produção (MRP)</h1>
          <p className="text-muted-foreground">Planeamento de necessidades de materiais e capacidade</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={executarMRP}>
            <Calculator className="mr-2 h-4 w-4" />
            Executar MRP
          </Button>
          <Button variant="outline" onClick={gerarRelatorio}>
            <FileText className="mr-2 h-4 w-4" />
            Relatório
          </Button>
        </div>
      </div>

      {/* Resumo Executivo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Materiais em Falta</p>
                <p className="text-2xl font-bold text-red-600">
                  {necessidadesMateriais.filter(n => n.status !== 'disponivel').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Ordens Sugeridas</p>
                <p className="text-2xl font-bold text-blue-600">{sugestoesOrdens.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Gargalos</p>
                <p className="text-2xl font-bold text-orange-600">
                  {analiseCapacidade.filter(a => a.gargalo).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Capacidade Média</p>
                <p className="text-2xl font-bold text-green-600">
                  {Math.round(analiseCapacidade.reduce((acc, a) => acc + a.percentualUtilizacao, 0) / analiseCapacidade.length)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="necessidades" className="w-full">
        <TabsList>
          <TabsTrigger value="necessidades">Necessidades de Materiais</TabsTrigger>
          <TabsTrigger value="sugestoes">Sugestões de Ordens</TabsTrigger>
          <TabsTrigger value="capacidade">Análise de Capacidade</TabsTrigger>
          <TabsTrigger value="previsoes">Previsões de Vendas</TabsTrigger>
          <TabsTrigger value="simulacao">Simulação "What-If"</TabsTrigger>
        </TabsList>

        <TabsContent value="necessidades" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Necessidades de Materiais
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Necessário</TableHead>
                      <TableHead>Disponível</TableHead>
                      <TableHead>A Comprar</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criticidade</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Entrega</TableHead>
                      <TableHead>Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {necessidadesMateriais.map((necessidade) => (
                      <TableRow key={necessidade.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{necessidade.nomeMaterial}</div>
                            <div className="text-sm text-gray-500">{necessidade.codigoMaterial}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {necessidade.quantidadeNecessaria} {necessidade.unidadeMedida}
                        </TableCell>
                        <TableCell>
                          {necessidade.quantidadeDisponivel} {necessidade.unidadeMedida}
                        </TableCell>
                        <TableCell>
                          <span className={necessidade.quantidadeComprar > 0 ? 'font-medium text-red-600' : ''}>
                            {necessidade.quantidadeComprar} {necessidade.unidadeMedida}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(necessidade.status)}</TableCell>
                        <TableCell>{getCriticidadeBadge(necessidade.criticidade)}</TableCell>
                        <TableCell>{necessidade.fornecedorSugerido}</TableCell>
                        <TableCell>{necessidade.leadTime} dias</TableCell>
                        <TableCell>
                          {necessidade.dataEntregaEstimada !== '-' 
                            ? format(new Date(necessidade.dataEntregaEstimada), 'dd/MM/yyyy', { locale: pt })
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {necessidade.custoEstimado > 0 
                            ? `MT ${necessidade.custoEstimado.toLocaleString()}`
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sugestoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Sugestões Automáticas de Ordens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sugestoesOrdens.map((sugestao) => (
                  <div key={sugestao.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {sugestao.tipo === 'compra' ? (
                          <ShoppingCart className="h-5 w-5 text-blue-500" />
                        ) : (
                          <Factory className="h-5 w-5 text-green-500" />
                        )}
                        <div>
                          <h4 className="font-semibold">
                            {sugestao.tipo === 'compra' ? 'Ordem de Compra' : 'Ordem de Produção'}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {sugestao.produto || sugestao.material} - {sugestao.quantidade} {sugestao.unidadeMedida}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getPrioridadeBadge(sugestao.prioridade)}
                        <Button size="sm" onClick={() => aprovarSugestao(sugestao.id)}>
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Aprovar
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <Label className="text-xs text-gray-500">Data Início</Label>
                        <p>{format(new Date(sugestao.dataInicio), 'dd/MM/yyyy', { locale: pt })}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Data Fim</Label>
                        <p>{format(new Date(sugestao.dataFim), 'dd/MM/yyyy', { locale: pt })}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Custo Estimado</Label>
                        <p>MT {sugestao.custoEstimado.toLocaleString()}</p>
                      </div>
                      {sugestao.tipo === 'producao' && (
                        <div>
                          <Label className="text-xs text-gray-500">Impacto Capacidade</Label>
                          <p>{sugestao.impactoCapacidade}%</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3">
                      <Label className="text-xs text-gray-500">Justificativa</Label>
                      <p className="text-sm">{sugestao.justificativa}</p>
                    </div>
                    
                    {sugestao.dependencias.length > 0 && (
                      <div className="mt-3">
                        <Label className="text-xs text-gray-500">Dependências</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {sugestao.dependencias.map((dep, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {dep}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacidade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Análise de Capacidade Produtiva
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analiseCapacidade.map((analise, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Factory className="h-5 w-5 text-blue-500" />
                        <h4 className="font-semibold">{analise.centroTrabalho}</h4>
                        {analise.gargalo && (
                          <Badge className="bg-red-100 text-red-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Gargalo
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${
                          analise.percentualUtilizacao > 90 ? 'text-red-600' :
                          analise.percentualUtilizacao > 75 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {analise.percentualUtilizacao}%
                        </p>
                        <p className="text-xs text-gray-500">Utilização</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <Label className="text-xs text-gray-500">Capacidade Máxima</Label>
                        <p>{analise.capacidadeMaxima} min/dia</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Capacidade Utilizada</Label>
                        <p>{analise.capacidadeUtilizada} min/dia</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Capacidade Ociosa</Label>
                        <p>{analise.capacidadeMaxima - analise.capacidadeUtilizada} min/dia</p>
                      </div>
                    </div>
                    
                    <div className="mb-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            analise.percentualUtilizacao > 90 ? 'bg-red-500' :
                            analise.percentualUtilizacao > 75 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${analise.percentualUtilizacao}%` }}
                        />
                      </div>
                    </div>
                    
                    {analise.periodoSobrecarga.length > 0 && (
                      <div className="mb-3">
                        <Label className="text-xs text-gray-500">Períodos de Sobrecarga</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analise.periodoSobrecarga.map((periodo, idx) => (
                            <Badge key={idx} variant="destructive" className="text-xs">
                              {format(new Date(periodo), 'dd/MM', { locale: pt })}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <Label className="text-xs text-gray-500">Sugestão de Otimização</Label>
                      <p className="text-sm">{analise.sugestaoOtimizacao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="previsoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Previsões de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade Prevista</TableHead>
                      <TableHead>Confiança</TableHead>
                      <TableHead>Base de Cálculo</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prevencoesVendas.map((previsao, index) => (
                      <TableRow key={index}>
                        <TableCell>{previsao.periodo}</TableCell>
                        <TableCell>{previsao.produto}</TableCell>
                        <TableCell>{previsao.quantidadePrevista} unidades</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  previsao.confianca >= 80 ? 'bg-green-500' :
                                  previsao.confianca >= 60 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${previsao.confianca}%` }}
                              />
                            </div>
                            <span className="text-sm">{previsao.confianca}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{previsao.baseCalculo}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline">
                            <Play className="mr-1 h-3 w-3" />
                            Gerar Plano
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

        <TabsContent value="simulacao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Simulação "What-If"
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-semibold">Parâmetros de Simulação</h4>
                  
                  <div className="space-y-2">
                    <Label>Aumento de Vendas (%)</Label>
                    <Input type="number" placeholder="Ex: 20" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Redução de Lead Time (dias)</Label>
                    <Input type="number" placeholder="Ex: 2" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Aumento de Capacidade (%)</Label>
                    <Input type="number" placeholder="Ex: 15" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Período de Simulação</Label>
                    <div className="flex gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedDate ? format(selectedDate, 'PPP', { locale: pt }) : 'Selecionar data'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  
                  <Button className="w-full">
                    <Calculator className="mr-2 h-4 w-4" />
                    Executar Simulação
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-semibold">Resultados da Simulação</h4>
                  
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600 text-center">
                      Configure os parâmetros e execute a simulação para ver os resultados
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-center">
                          <p className="text-sm font-medium">Impacto Capacidade</p>
                          <p className="text-2xl font-bold text-blue-600">-</p>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-center">
                          <p className="text-sm font-medium">Novos Gargalos</p>
                          <p className="text-2xl font-bold text-orange-600">-</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}