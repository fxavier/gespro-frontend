'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Calculator,
  TrendingDown,
  DollarSign,
  Calendar,
  Package,
  FileSpreadsheet,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  PieChart
} from 'lucide-react';
import Link from 'next/link';
import { Ativo } from '@/types/inventario';
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
  Legend
} from 'recharts';

export default function AmortizacaoPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todos');
  const [metodoFilter, setMetodoFilter] = useState<string>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Dados de exemplo
  const ativos: Ativo[] = [
    {
      id: '1',
      codigoInterno: 'PC-001',
      nome: 'Computador Dell OptiPlex 3090',
      descricao: 'Computador desktop para escritório',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      numeroSerie: 'DL3090-12345',
      modelo: 'OptiPlex 3090',
      marca: 'Dell',
      fornecedorId: '1',
      fornecedorNome: 'Dell Moçambique',
      dataAquisicao: new Date('2023-01-15'),
      valorCompra: 45000,
      valorResidual: 4500,
      vidaUtil: 5,
      dataSubstituicao: new Date('2028-01-15'),
      estado: 'em_uso',
      localizacaoId: '3',
      localizacaoNome: 'Departamento de TI',
      responsavelId: '1',
      responsavelNome: 'Carlos Fernandes',
      departamentoId: 'ti',
      departamentoNome: 'Tecnologia da Informação',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 18000,
        valorLiquidoContabilistico: 27000,
        percentualAmortizado: 40
      },
      qrCode: 'QR-PC-001',
      criadoEm: new Date('2023-01-15'),
      criadoPor: 'admin'
    },
    {
      id: '2',
      codigoInterno: 'PORT-001',
      nome: 'Portátil Lenovo ThinkPad E15',
      descricao: 'Portátil para trabalho móvel',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      numeroSerie: 'TP-E15-67890',
      modelo: 'ThinkPad E15',
      marca: 'Lenovo',
      fornecedorId: '2',
      fornecedorNome: 'Lenovo Store',
      dataAquisicao: new Date('2023-03-20'),
      valorCompra: 55000,
      valorResidual: 5500,
      vidaUtil: 4,
      dataSubstituicao: new Date('2027-03-20'),
      estado: 'em_uso',
      localizacaoId: '2',
      localizacaoNome: 'Escritório Central',
      responsavelId: '2',
      responsavelNome: 'Maria Santos',
      departamentoId: 'admin',
      departamentoNome: 'Administração',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 11833,
        valorLiquidoContabilistico: 43167,
        percentualAmortizado: 21.5
      },
      qrCode: 'QR-PORT-001',
      criadoEm: new Date('2023-03-20'),
      criadoPor: 'admin'
    },
    {
      id: '3',
      codigoInterno: 'VEI-001',
      nome: 'Toyota Hilux 2022',
      descricao: 'Veículo para transporte e logística',
      categoriaId: 'transporte',
      categoriaNome: 'Transporte',
      numeroSerie: 'TH2022-ABC123',
      modelo: 'Hilux 2.4 4x4',
      marca: 'Toyota',
      fornecedorId: '3',
      fornecedorNome: 'Toyota Moçambique',
      dataAquisicao: new Date('2022-05-10'),
      valorCompra: 1250000,
      valorResidual: 375000,
      vidaUtil: 10,
      dataSubstituicao: new Date('2032-05-10'),
      estado: 'em_uso',
      localizacaoId: '1',
      localizacaoNome: 'Armazém Principal',
      responsavelId: '3',
      responsavelNome: 'João Silva',
      departamentoId: 'logistica',
      departamentoNome: 'Logística',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 175000,
        valorLiquidoContabilistico: 1075000,
        percentualAmortizado: 14
      },
      qrCode: 'QR-VEI-001',
      criadoEm: new Date('2022-05-10'),
      criadoPor: 'admin'
    },
    {
      id: '4',
      codigoInterno: 'IMP-001',
      nome: 'Impressora HP LaserJet Pro',
      descricao: 'Impressora laser multifunções',
      categoriaId: 'informatica',
      categoriaNome: 'Informática',
      numeroSerie: 'HP-LJ-54321',
      modelo: 'LaserJet Pro MFP M428fdw',
      marca: 'HP',
      fornecedorId: '4',
      fornecedorNome: 'HP Store',
      dataAquisicao: new Date('2023-06-01'),
      valorCompra: 25000,
      valorResidual: 2500,
      vidaUtil: 5,
      dataSubstituicao: new Date('2028-06-01'),
      estado: 'em_manutencao',
      localizacaoId: '2',
      localizacaoNome: 'Escritório Central',
      responsavelId: '4',
      responsavelNome: 'Ana Costa',
      departamentoId: 'admin',
      departamentoNome: 'Administração',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 3125,
        valorLiquidoContabilistico: 21875,
        percentualAmortizado: 12.5
      },
      qrCode: 'QR-IMP-001',
      criadoEm: new Date('2023-06-01'),
      criadoPor: 'admin'
    },
    {
      id: '5',
      codigoInterno: 'MOB-001',
      nome: 'Mesa de Escritório Executive',
      descricao: 'Mesa de madeira para executivos',
      categoriaId: 'mobiliario',
      categoriaNome: 'Mobiliário',
      modelo: 'Executive Plus 160cm',
      marca: 'Office Furniture',
      fornecedorId: '5',
      fornecedorNome: 'Móveis & Cia',
      dataAquisicao: new Date('2023-02-15'),
      valorCompra: 15000,
      valorResidual: 1500,
      vidaUtil: 10,
      dataSubstituicao: new Date('2033-02-15'),
      estado: 'em_uso',
      localizacaoId: '6',
      localizacaoNome: 'Sala de Conferências',
      responsavelId: '5',
      responsavelNome: 'Sofia Nunes',
      departamentoId: 'admin',
      departamentoNome: 'Administração',
      amortizacao: {
        metodo: 'linear',
        valorAmortizadoAcumulado: 1215,
        valorLiquidoContabilistico: 13785,
        percentualAmortizado: 8.1
      },
      qrCode: 'QR-MOB-001',
      criadoEm: new Date('2023-02-15'),
      criadoPor: 'admin'
    }
  ];

  const categorias = [
    { id: 'informatica', nome: 'Informática' },
    { id: 'transporte', nome: 'Transporte' },
    { id: 'mobiliario', nome: 'Mobiliário' },
    { id: 'ferramentas', nome: 'Ferramentas' },
    { id: 'equipamento_medico', nome: 'Equipamento Médico' }
  ];

  const metodos = [
    { value: 'linear', label: 'Linear' },
    { value: 'decrescente', label: 'Decrescente' },
    { value: 'soma_digitos', label: 'Soma dos Dígitos' },
    { value: 'unidades_producao', label: 'Unidades de Produção' }
  ];

  const filteredAtivos = ativos.filter(ativo => {
    const matchesSearch = 
      ativo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ativo.codigoInterno.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ativo.marca && ativo.marca.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategoria = categoriaFilter === 'todos' || ativo.categoriaId === categoriaFilter;
    const matchesMetodo = metodoFilter === 'todos' || ativo.amortizacao.metodo === metodoFilter;

    return matchesSearch && matchesCategoria && matchesMetodo;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredAtivos, initialItemsPerPage: 10 });

  const handleCalcularAmortizacao = (ativo: Ativo) => {
    toast({
      title: "Amortização recalculada",
      description: `A amortização do ativo ${ativo.nome} foi recalculada`,
    });
  };

  const handleExportarRelatorio = () => {
    toast({
      title: "Exportando relatório",
      description: "O relatório de amortização será baixado em breve",
    });
  };

  const handleProcessarAmortizacao = () => {
    toast({
      title: "Processamento iniciado",
      description: "A amortização mensal está sendo processada para todos os ativos",
    });
  };

  // Estatísticas e dados para gráficos
  const estatisticas = {
    valorTotalAtivos: ativos.reduce((acc, ativo) => acc + ativo.valorCompra, 0),
    valorAmortizadoTotal: ativos.reduce((acc, ativo) => acc + ativo.amortizacao.valorAmortizadoAcumulado, 0),
    valorLiquidoTotal: ativos.reduce((acc, ativo) => acc + ativo.amortizacao.valorLiquidoContabilistico, 0),
    percentualMedioAmortizado: ativos.reduce((acc, ativo) => acc + ativo.amortizacao.percentualAmortizado, 0) / ativos.length
  };

  const amortizacaoPorCategoria = categorias.map(categoria => {
    const ativosCategoria = ativos.filter(a => a.categoriaId === categoria.id);
    return {
      categoria: categoria.nome,
      valorOriginal: ativosCategoria.reduce((acc, a) => acc + a.valorCompra, 0),
      valorAmortizado: ativosCategoria.reduce((acc, a) => acc + a.amortizacao.valorAmortizadoAcumulado, 0),
      valorLiquido: ativosCategoria.reduce((acc, a) => acc + a.amortizacao.valorLiquidoContabilistico, 0)
    };
  }).filter(item => item.valorOriginal > 0);

  const amortizacaoMensal = [
    { mes: 'Jan', valor: 8500 },
    { mes: 'Fev', valor: 8300 },
    { mes: 'Mar', valor: 8700 },
    { mes: 'Abr', valor: 8400 },
    { mes: 'Mai', valor: 8600 },
    { mes: 'Jun', valor: 8200 },
    { mes: 'Jul', valor: 8800 },
    { mes: 'Ago', valor: 8500 },
    { mes: 'Set', valor: 8900 },
    { mes: 'Out', valor: 8300 },
    { mes: 'Nov', valor: 8700 },
    { mes: 'Dez', valor: 8600 }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Amortização</h1>
          <p className="text-muted-foreground">Controle da depreciação e valorização dos ativos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleProcessarAmortizacao}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Processar Mês
          </Button>
          <Button variant="outline" onClick={handleExportarRelatorio}>
            <Download className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Configurar Amortização
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Configurar Amortização</DialogTitle>
                <DialogDescription>
                  Configure os parâmetros de amortização do ativo
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="ativo">Ativo *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o ativo" />
                    </SelectTrigger>
                    <SelectContent>
                      {ativos.map(ativo => (
                        <SelectItem key={ativo.id} value={ativo.id}>
                          {ativo.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="metodo">Método *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Método de amortização" />
                      </SelectTrigger>
                      <SelectContent>
                        {metodos.map(metodo => (
                          <SelectItem key={metodo.value} value={metodo.value}>
                            {metodo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vidaUtil">Vida Útil (anos) *</Label>
                    <Input id="vidaUtil" type="number" placeholder="5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valorResidual">Valor Residual (MT)</Label>
                    <Input id="valorResidual" type="number" placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxa">Taxa Anual (%)</Label>
                    <Input id="taxa" type="number" step="0.01" placeholder="20.00" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dataInicio">Data de Início</Label>
                  <Input id="dataInicio" type="date" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  setIsDialogOpen(false);
                  toast({
                    title: "Configuração salva",
                    description: "A configuração de amortização foi atualizada",
                  });
                }}>
                  Salvar Configuração
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Estatísticas Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Ativos</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.valorTotalAtivos / 1000000).toFixed(1)}M
                </p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Amortizado Acumulado</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.valorAmortizadoTotal / 1000).toFixed(0)}K
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Líquido</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.valorLiquidoTotal / 1000000).toFixed(1)}M
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Médio Amortizado</p>
                <p className="text-2xl font-bold">
                  {estatisticas.percentualMedioAmortizado.toFixed(1)}%
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Amortização por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                valorOriginal: {
                  label: 'Valor Original',
                  color: 'hsl(var(--chart-1))',
                },
                valorLiquido: {
                  label: 'Valor Líquido',
                  color: 'hsl(var(--chart-2))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={amortizacaoPorCategoria}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="valorOriginal" fill="#8884d8" name="Valor Original" />
                  <Bar dataKey="valorLiquido" fill="#82ca9d" name="Valor Líquido" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Amortização Mensal (Anual)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                valor: {
                  label: 'Valor (MT)',
                  color: 'hsl(var(--chart-1))',
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={amortizacaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line 
                    type="monotone" 
                    dataKey="valor" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    name="Amortização (MT)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, código ou marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {categorias.map(categoria => (
                    <SelectItem key={categoria.id} value={categoria.id}>
                      {categoria.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={metodoFilter} onValueChange={setMetodoFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {metodos.map(metodo => (
                    <SelectItem key={metodo.value} value={metodo.value}>
                      {metodo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Valor Original</TableHead>
                <TableHead>Amortizado</TableHead>
                <TableHead>Valor Líquido</TableHead>
                <TableHead>% Amortizado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((ativo) => {
                  const anosDecorridos = (new Date().getTime() - ativo.dataAquisicao.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                  const podeAmortizar = anosDecorridos > 0;
                  
                  return (
                    <TableRow key={ativo.id}>
                      <TableCell className="font-medium">{ativo.codigoInterno}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{ativo.nome}</div>
                          <div className="text-sm text-muted-foreground">
                            {ativo.marca} {ativo.modelo}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{ativo.categoriaNome}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {metodos.find(m => m.value === ativo.amortizacao.metodo)?.label || ativo.amortizacao.metodo}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          MT {ativo.valorCompra.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-red-600">
                          MT {ativo.amortizacao.valorAmortizadoAcumulado.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-green-600">
                          MT {ativo.amortizacao.valorLiquidoContabilistico.toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={ativo.amortizacao.percentualAmortizado > 75 ? 'destructive' : 
                                   ativo.amortizacao.percentualAmortizado > 50 ? 'default' : 'secondary'}
                          >
                            {ativo.amortizacao.percentualAmortizado.toFixed(1)}%
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Abrir menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/ativos/${ativo.id}/amortizacao`}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleCalcularAmortizacao(ativo)}
                              disabled={!podeAmortizar}
                            >
                              <Calculator className="h-4 w-4 mr-2" />
                              Recalcular
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/ativos/${ativo.id}/editar`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar Configuração
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Relatório Individual
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Calculator className="h-12 w-12 opacity-50" />
                      <p>Nenhum ativo encontrado</p>
                      <p className="text-sm">Tente ajustar os filtros ou configurar amortização</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}