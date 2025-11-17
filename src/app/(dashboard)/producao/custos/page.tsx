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
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calculator,
  Package,
  Factory,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  PieChart,
  Receipt,
  FileText,
  Wrench,
  Clock,
  Target,
  ArrowUp,
  ArrowDown,
  Filter,
  Download,
  Eye
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
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
  Treemap
} from 'recharts';

interface ComponenteCusto {
  tipo: 'material' | 'mao_obra' | 'energia' | 'manutencao' | 'overhead';
  descricao: string;
  valor: number;
  percentual: number;
}

interface CustoProduto {
  id: string;
  codigoProduto: string;
  nomeProduto: string;
  quantidade: number;
  unidadeMedida: string;
  custoUnitarioPadrao: number;
  custoUnitarioReal: number;
  variacaoCusto: number;
  margemContribuicao: number;
  componentesCusto: ComponenteCusto[];
  dataCalculo: string;
  status: 'favoravel' | 'desfavoravel' | 'neutro';
}

interface CustoOrdemProducao {
  id: string;
  numeroOrdem: string;
  produto: string;
  quantidadeProduzida: number;
  custoTotalPrevisto: number;
  custoTotalRealizado: number;
  variacaoTotal: number;
  variacaoPercentual: number;
  dataProducao: string;
  detalheCustos: {
    materiaPrima: number;
    maoObra: number;
    energia: number;
    manutencao: number;
    overhead: number;
  };
}

interface AnaliseVariacao {
  tipo: 'material' | 'mao_obra' | 'eficiencia' | 'volume' | 'preco';
  descricao: string;
  valorEsperado: number;
  valorReal: number;
  variacao: number;
  impacto: 'positivo' | 'negativo';
  causas: string[];
  acoesCorretivas: string[];
}

interface CentroCusto {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'producao' | 'apoio' | 'administrativo';
  custoMensal: number;
  custoAlocado: number;
  taxaAbsorcao: number;
  responsavel: string;
}

export default function CustosPage() {
  const [selectedProduto, setSelectedProduto] = useState<CustoProduto | null>(null);
  const [selectedOrdem, setSelectedOrdem] = useState<CustoOrdemProducao | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [periodoAnalise, setPeriodoAnalise] = useState('mes_atual');

  // Mock data
  const custosProdutos: CustoProduto[] = [
    {
      id: '1',
      codigoProduto: 'PROD-001',
      nomeProduto: 'Bolo de Chocolate Premium',
      quantidade: 1,
      unidadeMedida: 'unidade',
      custoUnitarioPadrao: 125.50,
      custoUnitarioReal: 132.75,
      variacaoCusto: 7.25,
      margemContribuicao: 42.5,
      componentesCusto: [
        { tipo: 'material', descricao: 'Matérias-primas', valor: 65.50, percentual: 49.3 },
        { tipo: 'mao_obra', descricao: 'Mão de obra direta', valor: 35.25, percentual: 26.5 },
        { tipo: 'energia', descricao: 'Energia e utilidades', valor: 12.50, percentual: 9.4 },
        { tipo: 'manutencao', descricao: 'Manutenção', valor: 8.50, percentual: 6.4 },
        { tipo: 'overhead', descricao: 'Custos indiretos', valor: 11.00, percentual: 8.4 }
      ],
      dataCalculo: '2024-10-20',
      status: 'desfavoravel'
    },
    {
      id: '2',
      codigoProduto: 'PROD-002',
      nomeProduto: 'Mesa Executive',
      quantidade: 1,
      unidadeMedida: 'unidade',
      custoUnitarioPadrao: 2850.00,
      custoUnitarioReal: 2790.00,
      variacaoCusto: -60.00,
      margemContribuicao: 35.8,
      componentesCusto: [
        { tipo: 'material', descricao: 'Matérias-primas', valor: 1650.00, percentual: 59.1 },
        { tipo: 'mao_obra', descricao: 'Mão de obra direta', valor: 680.00, percentual: 24.4 },
        { tipo: 'energia', descricao: 'Energia e utilidades', valor: 120.00, percentual: 4.3 },
        { tipo: 'manutencao', descricao: 'Manutenção', valor: 180.00, percentual: 6.5 },
        { tipo: 'overhead', descricao: 'Custos indiretos', valor: 160.00, percentual: 5.7 }
      ],
      dataCalculo: '2024-10-20',
      status: 'favoravel'
    }
  ];

  const custosOrdens: CustoOrdemProducao[] = [
    {
      id: '1',
      numeroOrdem: 'OP-2024-001',
      produto: 'Bolo de Chocolate Premium',
      quantidadeProduzida: 50,
      custoTotalPrevisto: 6275.00,
      custoTotalRealizado: 6637.50,
      variacaoTotal: 362.50,
      variacaoPercentual: 5.8,
      dataProducao: '2024-10-20',
      detalheCustos: {
        materiaPrima: 3275.00,
        maoObra: 1762.50,
        energia: 625.00,
        manutencao: 425.00,
        overhead: 550.00
      }
    },
    {
      id: '2',
      numeroOrdem: 'OP-2024-002',
      produto: 'Mesa Executive',
      quantidadeProduzida: 10,
      custoTotalPrevisto: 28500.00,
      custoTotalRealizado: 27900.00,
      variacaoTotal: -600.00,
      variacaoPercentual: -2.1,
      dataProducao: '2024-10-19',
      detalheCustos: {
        materiaPrima: 16500.00,
        maoObra: 6800.00,
        energia: 1200.00,
        manutencao: 1800.00,
        overhead: 1600.00
      }
    }
  ];

  const analisesVariacao: AnaliseVariacao[] = [
    {
      tipo: 'material',
      descricao: 'Variação de Preço de Material',
      valorEsperado: 3000.00,
      valorReal: 3275.00,
      variacao: 275.00,
      impacto: 'negativo',
      causas: ['Aumento no preço da farinha de trigo', 'Inflação geral de commodities'],
      acoesCorretivas: ['Negociar contratos de longo prazo', 'Buscar fornecedores alternativos']
    },
    {
      tipo: 'mao_obra',
      descricao: 'Variação de Eficiência',
      valorEsperado: 1800.00,
      valorReal: 1762.50,
      variacao: -37.50,
      impacto: 'positivo',
      causas: ['Melhoria nos processos', 'Treinamento eficaz'],
      acoesCorretivas: []
    }
  ];

  const centrosCusto: CentroCusto[] = [
    {
      id: '1',
      codigo: 'CC-PROD-001',
      nome: 'Centro de Produção - Padaria',
      tipo: 'producao',
      custoMensal: 45000.00,
      custoAlocado: 42750.00,
      taxaAbsorcao: 95,
      responsavel: 'Maria Santos'
    },
    {
      id: '2',
      codigo: 'CC-PROD-002',
      nome: 'Centro de Produção - Móveis',
      tipo: 'producao',
      custoMensal: 85000.00,
      custoAlocado: 76500.00,
      taxaAbsorcao: 90,
      responsavel: 'João Silva'
    }
  ];

  // Dados para gráficos
  const dadosComparativoCustos = [
    { mes: 'Jan', padrao: 125000, real: 128000, variacao: 3000 },
    { mes: 'Fev', padrao: 130000, real: 127000, variacao: -3000 },
    { mes: 'Mar', padrao: 135000, real: 138000, variacao: 3000 },
    { mes: 'Abr', padrao: 128000, real: 125000, variacao: -3000 }
  ];

  const dadosComposicaoCusto = [
    { name: 'Matéria-Prima', value: 55, color: '#0088FE' },
    { name: 'Mão de Obra', value: 25, color: '#00C49F' },
    { name: 'Energia', value: 8, color: '#FFBB28' },
    { name: 'Manutenção', value: 7, color: '#FF8042' },
    { name: 'Overhead', value: 5, color: '#8884D8' }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const getVariacaoBadge = (variacao: number) => {
    if (variacao > 0) {
      return (
        <Badge className="bg-red-100 text-red-800 flex items-center gap-1">
          <ArrowUp className="h-3 w-3" />
          +{variacao.toFixed(2)}%
        </Badge>
      );
    } else if (variacao < 0) {
      return (
        <Badge className="bg-green-100 text-green-800 flex items-center gap-1">
          <ArrowDown className="h-3 w-3" />
          {variacao.toFixed(2)}%
        </Badge>
      );
    } else {
      return <Badge variant="secondary">0%</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'favoravel':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'desfavoravel':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const calcularCustoTotal = () => {
    return custosOrdens.reduce((total, ordem) => total + ordem.custoTotalRealizado, 0);
  };

  const calcularVariacaoTotal = () => {
    return custosOrdens.reduce((total, ordem) => total + ordem.variacaoTotal, 0);
  };

  const recalcularCustos = () => {
    toast({
      title: "Custos recalculados",
      description: "Todos os custos foram atualizados com sucesso",
    });
  };

  const exportarRelatorio = () => {
    toast({
      title: "Relatório exportado",
      description: "Relatório de custos disponível para download",
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Cálculo de Custos de Produção</h1>
          <p className="text-muted-foreground">Análise e controlo de custos por produto e ordem</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={recalcularCustos}>
            <Calculator className="mr-2 h-4 w-4" />
            Recalcular
          </Button>
          <Button variant="outline" onClick={exportarRelatorio}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Custo Total Mês</p>
                <p className="text-2xl font-bold">MT {calcularCustoTotal().toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {calcularVariacaoTotal() > 0 ? (
                <TrendingUp className="h-5 w-5 text-red-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-green-500" />
              )}
              <div>
                <p className="text-sm font-medium">Variação Total</p>
                <p className={`text-2xl font-bold ${calcularVariacaoTotal() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  MT {Math.abs(calcularVariacaoTotal()).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Absorção Custos</p>
                <p className="text-2xl font-bold">92.5%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Margem Média</p>
                <p className="text-2xl font-bold">38.2%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="produtos" className="w-full">
        <TabsList>
          <TabsTrigger value="produtos">Custos por Produto</TabsTrigger>
          <TabsTrigger value="ordens">Custos por Ordem</TabsTrigger>
          <TabsTrigger value="variacoes">Análise de Variações</TabsTrigger>
          <TabsTrigger value="centros">Centros de Custo</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Custos por Produto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Custo Padrão</TableHead>
                      <TableHead>Custo Real</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Margem Contribuição</TableHead>
                      <TableHead>Composição</TableHead>
                      <TableHead>Última Atualização</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custosProdutos.map((produto) => (
                      <TableRow key={produto.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{produto.nomeProduto}</div>
                            <div className="text-sm text-gray-500">{produto.codigoProduto}</div>
                          </div>
                        </TableCell>
                        <TableCell>MT {produto.custoUnitarioPadrao.toFixed(2)}</TableCell>
                        <TableCell>MT {produto.custoUnitarioReal.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>MT {Math.abs(produto.variacaoCusto).toFixed(2)}</span>
                            {getVariacaoBadge((produto.variacaoCusto / produto.custoUnitarioPadrao) * 100)}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusIcon(produto.status)}</TableCell>
                        <TableCell>{produto.margemContribuicao}%</TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedProduto(produto);
                              setIsDialogOpen(true);
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                        <TableCell>
                          {format(new Date(produto.dataCalculo), 'dd/MM/yyyy', { locale: pt })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline">
                            <Calculator className="h-3 w-3" />
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

        <TabsContent value="ordens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5" />
                Custos por Ordem de Produção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ordem</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Qtd Produzida</TableHead>
                      <TableHead>Custo Previsto</TableHead>
                      <TableHead>Custo Real</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Data Produção</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custosOrdens.map((ordem) => (
                      <TableRow key={ordem.id}>
                        <TableCell className="font-medium">{ordem.numeroOrdem}</TableCell>
                        <TableCell>{ordem.produto}</TableCell>
                        <TableCell>{ordem.quantidadeProduzida} unidades</TableCell>
                        <TableCell>MT {ordem.custoTotalPrevisto.toLocaleString()}</TableCell>
                        <TableCell>MT {ordem.custoTotalRealizado.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>MT {Math.abs(ordem.variacaoTotal).toLocaleString()}</span>
                            {getVariacaoBadge(ordem.variacaoPercentual)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(ordem.dataProducao), 'dd/MM/yyyy', { locale: pt })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedOrdem(ordem)}
                          >
                            Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedOrdem && (
                <div className="mt-6 p-4 border rounded-lg">
                  <h4 className="font-semibold mb-3">Detalhamento de Custos - {selectedOrdem.numeroOrdem}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="p-3 bg-gray-50 rounded">
                      <Label className="text-xs text-gray-500">Matéria-Prima</Label>
                      <p className="font-medium">MT {selectedOrdem.detalheCustos.materiaPrima.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <Label className="text-xs text-gray-500">Mão de Obra</Label>
                      <p className="font-medium">MT {selectedOrdem.detalheCustos.maoObra.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <Label className="text-xs text-gray-500">Energia</Label>
                      <p className="font-medium">MT {selectedOrdem.detalheCustos.energia.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <Label className="text-xs text-gray-500">Manutenção</Label>
                      <p className="font-medium">MT {selectedOrdem.detalheCustos.manutencao.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                      <Label className="text-xs text-gray-500">Overhead</Label>
                      <p className="font-medium">MT {selectedOrdem.detalheCustos.overhead.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variacoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Análise de Variações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analisesVariacao.map((analise, index) => (
                  <div key={index} className={`border rounded-lg p-4 ${
                    analise.impacto === 'negativo' ? 'bg-red-50' : 'bg-green-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {analise.impacto === 'negativo' ? (
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        )}
                        <h4 className="font-semibold">{analise.descricao}</h4>
                      </div>
                      <Badge className={analise.impacto === 'negativo' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}>
                        MT {Math.abs(analise.variacao).toLocaleString()}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <Label className="text-xs text-gray-500">Valor Esperado</Label>
                        <p className="text-sm font-medium">MT {analise.valorEsperado.toLocaleString()}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Valor Real</Label>
                        <p className="text-sm font-medium">MT {analise.valorReal.toLocaleString()}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Variação %</Label>
                        <p className={`text-sm font-medium ${
                          analise.impacto === 'negativo' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {((analise.variacao / analise.valorEsperado) * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    
                    {analise.causas.length > 0 && (
                      <div className="mb-3">
                        <Label className="text-xs text-gray-500">Causas Identificadas</Label>
                        <ul className="list-disc list-inside text-sm mt-1">
                          {analise.causas.map((causa, idx) => (
                            <li key={idx}>{causa}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {analise.acoesCorretivas.length > 0 && (
                      <div>
                        <Label className="text-xs text-gray-500">Ações Corretivas</Label>
                        <ul className="list-disc list-inside text-sm mt-1">
                          {analise.acoesCorretivas.map((acao, idx) => (
                            <li key={idx}>{acao}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centros" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5" />
                Centros de Custo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {centrosCusto.map((centro) => (
                  <div key={centro.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-semibold">{centro.nome}</h4>
                        <p className="text-sm text-gray-600">{centro.codigo}</p>
                      </div>
                      <Badge variant={centro.tipo === 'producao' ? 'default' : 'secondary'}>
                        {centro.tipo}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <Label className="text-xs text-gray-500">Custo Mensal</Label>
                        <p className="text-sm font-medium">MT {centro.custoMensal.toLocaleString()}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Custo Alocado</Label>
                        <p className="text-sm font-medium">MT {centro.custoAlocado.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Taxa de Absorção</span>
                        <span className="text-sm font-medium">{centro.taxaAbsorcao}%</span>
                      </div>
                      <Progress value={centro.taxaAbsorcao} className="h-2" />
                    </div>
                    
                    <div className="mt-3 pt-3 border-t">
                      <Label className="text-xs text-gray-500">Responsável</Label>
                      <p className="text-sm">{centro.responsavel}</p>
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
                <CardTitle>Comparativo Custo Padrão vs Real</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dadosComparativoCustos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `MT ${value.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="padrao" fill="#8884d8" name="Padrão" />
                    <Bar dataKey="real" fill="#82ca9d" name="Real" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Composição de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={dadosComposicaoCusto}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {dadosComposicaoCusto.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Tendência de Variações</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={dadosComparativoCustos}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => `MT ${value}`} />
                  <Line 
                    type="monotone" 
                    dataKey="variacao" 
                    stroke="#ff7300" 
                    name="Variação"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog de Composição de Custos */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Composição de Custos</DialogTitle>
            <DialogDescription>
              Detalhamento dos componentes de custo
            </DialogDescription>
          </DialogHeader>
          
          {selectedProduto && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">{selectedProduto.nomeProduto}</h3>
                <p className="text-sm text-gray-600">{selectedProduto.codigoProduto}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Custo Padrão</Label>
                  <p className="text-lg font-medium">MT {selectedProduto.custoUnitarioPadrao.toFixed(2)}</p>
                </div>
                <div>
                  <Label>Custo Real</Label>
                  <p className="text-lg font-medium">MT {selectedProduto.custoUnitarioReal.toFixed(2)}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {selectedProduto.componentesCusto.map((comp, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <div>
                        <p className="font-medium">{comp.descricao}</p>
                        <p className="text-sm text-gray-500">{comp.tipo}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">MT {comp.valor.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">{comp.percentual}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button>
              <FileText className="mr-2 h-4 w-4" />
              Gerar Relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}