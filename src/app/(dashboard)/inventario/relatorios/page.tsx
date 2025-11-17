'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  DialogTrigger,
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
  FileText,
  Download,
  Calendar as CalendarIcon,
  Filter,
  BarChart3,
  PieChart,
  TrendingUp,
  Package,
  DollarSign,
  MapPin,
  Users,
  Activity,
  Search,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  Printer,
  Mail,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle,
  Calculator,
  Building,
  Layers
} from 'lucide-react';
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
  PieChart as RechartsPieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface RelatorioConfig {
  tipo: string;
  nome: string;
  descricao: string;
  dataInicio?: Date;
  dataFim?: Date;
  categoria?: string;
  localizacao?: string;
  responsavel?: string;
  status?: string;
  formato: 'pdf' | 'excel' | 'csv';
}

interface EstatisticaRelatorio {
  label: string;
  valor: string | number;
  mudanca?: number;
  icone: React.ReactNode;
  cor: string;
}

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{from?: Date; to?: Date}>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });
  const [selectedReport, setSelectedReport] = useState<string>('');

  const [filtros, setFiltros] = useState({
    categoria: 'todos',
    localizacao: 'todos',
    periodo: '30dias',
    status: 'todos'
  });

  // Dados de exemplo
  const tiposRelatorio = [
    {
      id: 'ativos-categoria',
      nome: 'Ativos por Categoria',
      descricao: 'Relatório detalhado dos ativos organizados por categoria',
      icone: <Layers className="h-5 w-5" />,
      categoria: 'ativos'
    },
    {
      id: 'ativos-localizacao',
      nome: 'Ativos por Localização',
      descricao: 'Distribuição dos ativos pelas diferentes localizações',
      icone: <MapPin className="h-5 w-5" />,
      categoria: 'ativos'
    },
    {
      id: 'ativos-valor',
      nome: 'Valorização dos Ativos',
      descricao: 'Relatório de valores de aquisição e atuais dos ativos',
      icone: <DollarSign className="h-5 w-5" />,
      categoria: 'financeiro'
    },
    {
      id: 'movimentacoes',
      nome: 'Movimentações de Ativos',
      descricao: 'Histórico de movimentações num período específico',
      icone: <Activity className="h-5 w-5" />,
      categoria: 'movimentacoes'
    },
    {
      id: 'amortizacao',
      nome: 'Relatório de Amortização',
      descricao: 'Amortização acumulada e valores líquidos dos ativos',
      icone: <Calculator className="h-5 w-5" />,
      categoria: 'financeiro'
    },
    {
      id: 'inventario-fisico',
      nome: 'Inventário Físico',
      descricao: 'Resultados dos inventários físicos realizados',
      icone: <CheckCircle className="h-5 w-5" />,
      categoria: 'auditoria'
    },
    {
      id: 'manutencao',
      nome: 'Manutenção e Reparos',
      descricao: 'Histórico de manutenções e custos associados',
      icone: <RefreshCw className="h-5 w-5" />,
      categoria: 'manutencao'
    },
    {
      id: 'responsabilidade',
      nome: 'Ativos por Responsável',
      descricao: 'Ativos atribuídos a cada responsável',
      icone: <Users className="h-5 w-5" />,
      categoria: 'gestao'
    }
  ];

  const categorias = [
    { id: 'informatica', nome: 'Informática' },
    { id: 'transporte', nome: 'Transporte' },
    { id: 'mobiliario', nome: 'Mobiliário' },
    { id: 'ferramentas', nome: 'Ferramentas' },
    { id: 'equipamento_medico', nome: 'Equipamento Médico' }
  ];

  const localizacoes = [
    { id: '1', nome: 'Armazém Principal' },
    { id: '2', nome: 'Escritório Central' },
    { id: '3', nome: 'Departamento de TI' },
    { id: '4', nome: 'Sala Diretoria' },
    { id: '5', nome: 'Área Técnica' },
    { id: '6', nome: 'Sala de Conferências' }
  ];

  // Estatísticas de exemplo
  const estatisticas: EstatisticaRelatorio[] = [
    {
      label: 'Total de Ativos',
      valor: 247,
      mudanca: 5.2,
      icone: <Package className="h-6 w-6" />,
      cor: 'text-blue-600'
    },
    {
      label: 'Valor Total',
      valor: 'MT 1.89M',
      mudanca: 2.1,
      icone: <DollarSign className="h-6 w-6" />,
      cor: 'text-green-600'
    },
    {
      label: 'Movimentações (mês)',
      valor: 34,
      mudanca: -8.3,
      icone: <Activity className="h-6 w-6" />,
      cor: 'text-purple-600'
    },
    {
      label: 'Relatórios Gerados',
      valor: 142,
      mudanca: 12.5,
      icone: <FileText className="h-6 w-6" />,
      cor: 'text-orange-600'
    }
  ];

  // Dados para gráficos
  const ativosPorCategoria = [
    { categoria: 'Informática', quantidade: 98, valor: 650000, cor: '#8884d8' },
    { categoria: 'Transporte', quantidade: 12, valor: 1250000, cor: '#82ca9d' },
    { categoria: 'Mobiliário', quantidade: 67, valor: 145000, cor: '#ffc658' },
    { categoria: 'Ferramentas', quantidade: 45, valor: 78000, cor: '#ff7300' },
    { categoria: 'Equipamento Médico', quantidade: 25, valor: 350000, cor: '#00c49f' }
  ];

  const movimentacoesMensais = [
    { mes: 'Jan', entradas: 12, saidas: 8, transferencias: 15 },
    { mes: 'Fev', entradas: 8, saidas: 5, transferencias: 12 },
    { mes: 'Mar', entradas: 15, saidas: 3, transferencias: 18 },
    { mes: 'Abr', entradas: 6, saidas: 7, transferencias: 14 },
    { mes: 'Mai', entradas: 10, saidas: 4, transferencias: 16 },
    { mes: 'Jun', entradas: 14, saidas: 6, transferencias: 11 }
  ];

  const relatóriosRecentes = [
    {
      id: '1',
      nome: 'Ativos por Categoria - Junho 2024',
      tipo: 'Ativos',
      dataGeracao: new Date('2024-06-15'),
      tamanho: '2.4 MB',
      formato: 'PDF',
      status: 'concluido'
    },
    {
      id: '2',
      nome: 'Movimentações Mensais - Maio 2024',
      tipo: 'Movimentações',
      dataGeracao: new Date('2024-05-31'),
      tamanho: '1.8 MB',
      formato: 'Excel',
      status: 'concluido'
    },
    {
      id: '3',
      nome: 'Relatório de Amortização - Q1 2024',
      tipo: 'Financeiro',
      dataGeracao: new Date('2024-04-01'),
      tamanho: '3.1 MB',
      formato: 'PDF',
      status: 'processando'
    },
    {
      id: '4',
      nome: 'Inventário Físico - Departamento TI',
      tipo: 'Auditoria',
      dataGeracao: new Date('2024-03-20'),
      tamanho: '856 KB',
      formato: 'CSV',
      status: 'concluido'
    }
  ];

  const handleGerarRelatorio = (config: RelatorioConfig) => {
    toast({
      title: "Relatório em processamento",
      description: `O relatório "${config.nome}" está sendo gerado. Você será notificado quando estiver pronto.`,
    });
    setIsDialogOpen(false);
  };

  const handleExportarRelatorio = (relatorioId: string, formato: string) => {
    toast({
      title: "Exportando relatório",
      description: `O relatório será baixado em formato ${formato.toUpperCase()}`,
    });
  };

  const handleEnviarEmail = (relatorioId: string) => {
    toast({
      title: "Enviando por email",
      description: "O relatório será enviado para o seu email cadastrado",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      concluido: { label: 'Concluído', color: 'bg-green-100 text-green-800' },
      processando: { label: 'Processando', color: 'bg-yellow-100 text-yellow-800' },
      erro: { label: 'Erro', color: 'bg-red-100 text-red-800' }
    };
    return statusMap[status as keyof typeof statusMap] || statusMap.concluido;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Relatórios de Inventário</h1>
          <p className="text-muted-foreground">Análises e relatórios detalhados do sistema de inventário</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <FileText className="h-4 w-4 mr-2" />
                Gerar Relatório
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Gerar Novo Relatório</DialogTitle>
                <DialogDescription>
                  Configure os parâmetros para gerar um novo relatório
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="tipoRelatorio">Tipo de Relatório *</Label>
                  <Select value={selectedReport} onValueChange={setSelectedReport}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo de relatório" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposRelatorio.map(tipo => (
                        <SelectItem key={tipo.id} value={tipo.id}>
                          <div className="flex items-center gap-2">
                            {tipo.icone}
                            <div>
                              <div className="font-medium">{tipo.nome}</div>
                              <div className="text-sm text-muted-foreground">{tipo.descricao}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Início</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? format(dateRange.from, 'dd/MM/yyyy', { locale: pt }) : 'Selecionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateRange.from}
                          onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Data de Fim</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.to ? format(dateRange.to, 'dd/MM/yyyy', { locale: pt }) : 'Selecionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateRange.to}
                          onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select defaultValue="todos">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as categorias</SelectItem>
                        {categorias.map(categoria => (
                          <SelectItem key={categoria.id} value={categoria.id}>
                            {categoria.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Localização</Label>
                    <Select defaultValue="todos">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todas as localizações</SelectItem>
                        {localizacoes.map(localizacao => (
                          <SelectItem key={localizacao.id} value={localizacao.id}>
                            {localizacao.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Formato de Exportação</Label>
                  <Select defaultValue="pdf">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => handleGerarRelatorio({
                  tipo: selectedReport,
                  nome: tiposRelatorio.find(t => t.id === selectedReport)?.nome || '',
                  descricao: '',
                  dataInicio: dateRange.from,
                  dataFim: dateRange.to,
                  formato: 'pdf'
                })}>
                  Gerar Relatório
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {estatisticas.map((stat, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.valor}</p>
                  {stat.mudanca && (
                    <div className="flex items-center gap-1 mt-1">
                      {stat.mudanca > 0 ? (
                        <ArrowUpRight className="h-3 w-3 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`text-xs ${stat.mudanca > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {Math.abs(stat.mudança)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className={stat.cor}>
                  {stat.icone}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="tipos-relatorio">Tipos de Relatório</TabsTrigger>
          <TabsTrigger value="relatorios-recentes">Relatórios Recentes</TabsTrigger>
          <TabsTrigger value="analises">Análises</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral">
          <div className="grid gap-6">
            {/* Gráficos de Resumo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ativos por Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      quantidade: {
                        label: 'Quantidade',
                        color: 'hsl(var(--chart-1))',
                      },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <RechartsPieChart data={ativosPorCategoria} dataKey="quantidade">
                          {ativosPorCategoria.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.cor} />
                          ))}
                        </RechartsPieChart>
                        <Legend />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Movimentações Mensais</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      entradas: {
                        label: 'Entradas',
                        color: 'hsl(var(--chart-1))',
                      },
                      saidas: {
                        label: 'Saídas',
                        color: 'hsl(var(--chart-2))',
                      },
                      transferencias: {
                        label: 'Transferências',
                        color: 'hsl(var(--chart-3))',
                      },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={movimentacoesMensais}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Bar dataKey="entradas" fill="#8884d8" name="Entradas" />
                        <Bar dataKey="saidas" fill="#82ca9d" name="Saídas" />
                        <Bar dataKey="transferencias" fill="#ffc658" name="Transferências" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Resumo de Relatórios Mais Gerados */}
            <Card>
              <CardHeader>
                <CardTitle>Relatórios Mais Utilizados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { nome: 'Ativos por Categoria', uso: 85, crescimento: 12 },
                    { nome: 'Movimentações Mensais', uso: 72, crescimento: 8 },
                    { nome: 'Relatório de Amortização', uso: 68, crescimento: -3 },
                    { nome: 'Inventário Físico', uso: 45, crescimento: 25 }
                  ].map((relatorio, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{relatorio.nome}</span>
                          <span className="text-sm text-muted-foreground">{relatorio.uso}%</span>
                        </div>
                        <Progress value={relatorio.uso} className="h-2" />
                      </div>
                      <div className="ml-4">
                        <span className={`text-xs flex items-center gap-1 ${
                          relatorio.crescimento > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {relatorio.crescimento > 0 ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {Math.abs(relatorio.crescimento)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tipos-relatorio">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Tipos de Relatório Disponíveis</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filtrar
                  </Button>
                  <Select value={filtros.categoria} onValueChange={(value) => setFiltros(prev => ({ ...prev, categoria: value }))}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      <SelectItem value="ativos">Ativos</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                      <SelectItem value="movimentacoes">Movimentações</SelectItem>
                      <SelectItem value="auditoria">Auditoria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tiposRelatorio.map(tipo => (
                    <Card key={tipo.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                              {tipo.icone}
                            </div>
                            <div className="flex-1">
                              <h3 className="font-medium">{tipo.nome}</h3>
                              <Badge variant="secondary" className="text-xs">
                                {tipo.categoria}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tipo.descricao}
                          </p>
                          <Button 
                            size="sm" 
                            className="w-full"
                            onClick={() => {
                              setSelectedReport(tipo.id);
                              setIsDialogOpen(true);
                            }}
                          >
                            Gerar Agora
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relatorios-recentes">
          <Card>
            <CardHeader>
              <CardTitle>Relatórios Gerados Recentemente</CardTitle>
              <div className="flex gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Pesquisar relatórios..." className="pl-10" />
                </div>
                <Select defaultValue="todos">
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="concluido">Concluídos</SelectItem>
                    <SelectItem value="processando">Processando</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Relatório</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatóriosRecentes.map(relatorio => {
                    const status = getStatusBadge(relatorio.status);
                    return (
                      <TableRow key={relatorio.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{relatorio.nome}</span>
                          </div>
                        </TableCell>
                        <TableCell>{relatorio.tipo}</TableCell>
                        <TableCell>
                          {format(relatorio.dataGeracao, 'dd/MM/yyyy HH:mm', { locale: pt })}
                        </TableCell>
                        <TableCell>{relatorio.tamanho}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {relatorio.status === 'processando' && <Clock className="h-3 w-3" />}
                            {relatorio.status === 'concluido' && <CheckCircle className="h-3 w-3" />}
                            {relatorio.status === 'erro' && <AlertTriangle className="h-3 w-3" />}
                            {status.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {relatorio.status === 'concluido' && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleExportarRelatorio(relatorio.id, 'pdf')}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleEnviarEmail(relatorio.id)}
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analises">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Análises Avançadas</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Insights detalhados sobre o desempenho do inventário
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium">Tendências de Aquisição</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Este mês</span>
                        <span className="font-medium">15 novos ativos</span>
                      </div>
                      <Progress value={75} className="h-2" />
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Mês anterior</span>
                        <span className="font-medium">12 novos ativos</span>
                      </div>
                      <Progress value={60} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Eficiência por Localização</h4>
                    <div className="space-y-2">
                      {[
                        { local: 'Departamento TI', eficiencia: 92 },
                        { local: 'Escritório Central', eficiencia: 88 },
                        { local: 'Armazém Principal', eficiencia: 75 },
                        { local: 'Área Técnica', eficiencia: 70 }
                      ].map((item, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-sm">{item.local}</span>
                            <span className="font-medium">{item.eficiencia}%</span>
                          </div>
                          <Progress value={item.eficiencia} className="h-2" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Alertas de Manutenção</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm">5 ativos precisam de manutenção</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <span className="text-sm">2 ativos fora de garantia</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">ROI por Categoria</h4>
                    <div className="space-y-2">
                      {[
                        { categoria: 'Informática', roi: 145 },
                        { categoria: 'Transporte', roi: 132 },
                        { categoria: 'Ferramentas', roi: 98 },
                        { categoria: 'Mobiliário', roi: 85 }
                      ].map((item, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm">{item.categoria}</span>
                          <span className={`font-medium ${item.roi > 100 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.roi}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recomendações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-blue-900">Otimização de Inventário</h5>
                      <p className="text-sm text-blue-700">
                        Considere redistribuir 12 ativos subutilizados do Armazém para áreas de maior demanda.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-green-900">Manutenção Preventiva</h5>
                      <p className="text-sm text-green-700">
                        Agende manutenção para 8 ativos que completarão 2 anos de uso no próximo mês.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                    <Building className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-orange-900">Expansão de Capacidade</h5>
                      <p className="text-sm text-orange-700">
                        O Departamento de TI está operando em 95% da capacidade. Considere expansão.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}