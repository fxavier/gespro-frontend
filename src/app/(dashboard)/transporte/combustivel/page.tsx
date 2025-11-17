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
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Fuel,
  Truck,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  FileText,
  User,
  Activity,
  TrendingUp,
  TrendingDown,
  Settings,
  Filter,
  Download,
  RefreshCw,
  Bell,
  Target,
  Gauge,
  Zap,
  CreditCard,
  MapPin,
  Building,
  Receipt,
  BarChart3,
  PieChart,
  Timer,
  ShoppingCart
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
  Legend
} from 'recharts';

interface Abastecimento {
  id: string;
  codigo: string;
  veiculoId: string;
  veiculoMatricula: string;
  veiculoModelo: string;
  motorista: string;
  postoCombustivel: string;
  enderecoPostо: string;
  dataAbastecimento: Date;
  horaAbastecimento: string;
  kmAnterior: number;
  kmAtual: number;
  kmPercorridos: number;
  litrosAbastecidos: number;
  precoLitro: number;
  valorTotal: number;
  tipoCombustivel: 'gasolina' | 'diesel' | 'gas';
  tanqueCheio: boolean;
  cartaoUtilizado?: string;
  numeroRecibo: string;
  observacoes?: string;
  consumoPorKm?: number;
  eficiencia?: 'excelente' | 'boa' | 'media' | 'ruim';
  rotaId?: string;
  rotaNome?: string;
  aprovado: boolean;
  aprovadoPor?: string;
  criadoEm: Date;
  criadoPor: string;
}

interface CartaoCombustivel {
  id: string;
  numero: string;
  fornecedor: string;
  saldoAtual: number;
  limiteCredito: number;
  dataVencimento: Date;
  status: 'ativo' | 'bloqueado' | 'vencido';
  veiculosAutorizados: string[];
  tipoRede: 'puma' | 'petromoc' | 'engen' | 'total' | 'shell' | 'outro';
}

interface EficienciaCombustivel {
  veiculoId: string;
  veiculoMatricula: string;
  consumoMedio: number; // km/litro
  metaConsumo: number;
  variacao: number; // % vs meta
  custoTotalMes: number;
  litrosTotalMes: number;
  kmPercorridosMes: number;
  ultimaEficiencia: string;
}

export default function CombustivelPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [veiculoFilter, setVeiculoFilter] = useState<string>('todos');
  const [postoFilter, setPostoFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [dataFilter, setDataFilter] = useState<Date>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('abastecimentos');

  // Dados de exemplo
  const abastecimentos: Abastecimento[] = [
    {
      id: '1',
      codigo: 'AB-001',
      veiculoId: '1',
      veiculoMatricula: 'ABC-1234',
      veiculoModelo: 'Toyota Hilux',
      motorista: 'Carlos Santos',
      postoCombustivel: 'Puma Energy Polana',
      enderecoPostо: 'Av. Julius Nyerere, Maputo',
      dataAbastecimento: new Date('2024-06-20'),
      horaAbastecimento: '08:30',
      kmAnterior: 34500,
      kmAtual: 35000,
      kmPercorridos: 500,
      litrosAbastecidos: 45.2,
      precoLitro: 78.50,
      valorTotal: 3548.20,
      tipoCombustivel: 'diesel',
      tanqueCheio: true,
      cartaoUtilizado: 'PUMA-001',
      numeroRecibo: 'PU240620001',
      observacoes: 'Abastecimento completo - tanque cheio',
      consumoPorKm: 11.06, // km/litro
      eficiencia: 'boa',
      rotaId: '1',
      rotaNome: 'Rota Centro-Norte',
      aprovado: true,
      aprovadoPor: 'admin',
      criadoEm: new Date('2024-06-20T08:30:00'),
      criadoPor: 'carlos.santos'
    },
    {
      id: '2',
      codigo: 'AB-002',
      veiculoId: '2',
      veiculoMatricula: 'XYZ-5678',
      veiculoModelo: 'Isuzu D-Max',
      motorista: 'Ana Pereira',
      postoCombustivel: 'Petromoc Centro',
      enderecoPostо: 'Av. 25 de Setembro, Maputo',
      dataAbastecimento: new Date('2024-06-20'),
      horaAbastecimento: '14:15',
      kmAnterior: 41800,
      kmAtual: 42000,
      kmPercorridos: 200,
      litrosAbastecidos: 25.0,
      precoLitro: 76.80,
      valorTotal: 1920.00,
      tipoCombustivel: 'diesel',
      tanqueCheio: false,
      cartaoUtilizado: 'PETRO-002',
      numeroRecibo: 'PT240620015',
      consumoPorKm: 8.0, // km/litro
      eficiencia: 'ruim',
      aprovado: false,
      criadoEm: new Date('2024-06-20T14:15:00'),
      criadoPor: 'ana.pereira'
    },
    {
      id: '3',
      codigo: 'AB-003',
      veiculoId: '3',
      veiculoMatricula: 'VIP-0001',
      veiculoModelo: 'Mercedes Sprinter',
      motorista: 'José Manuel',
      postoCombustivel: 'Shell Select Sommerschield',
      enderecoPostо: 'Av. Vladimir Lenine, Maputo',
      dataAbastecimento: new Date('2024-06-19'),
      horaAbastecimento: '16:45',
      kmAnterior: 17500,
      kmAtual: 18000,
      kmPercorridos: 500,
      litrosAbastecidos: 55.8,
      precoLitro: 79.20,
      valorTotal: 4419.36,
      tipoCombustivel: 'diesel',
      tanqueCheio: true,
      cartaoUtilizado: 'SHELL-003',
      numeroRecibo: 'SH240619033',
      observacoes: 'Combustível premium - veículo VIP',
      consumoPorKm: 8.96, // km/litro
      eficiencia: 'media',
      aprovado: true,
      aprovadoPor: 'admin',
      criadoEm: new Date('2024-06-19T16:45:00'),
      criadoPor: 'jose.manuel'
    },
    {
      id: '4',
      codigo: 'AB-004',
      veiculoId: '1',
      veiculoMatricula: 'ABC-1234',
      veiculoModelo: 'Toyota Hilux',
      motorista: 'Carlos Santos',
      postoCombustivel: 'Total Energy Matola',
      enderecoPostо: 'EN1, Matola',
      dataAbastecimento: new Date('2024-06-18'),
      horaAbastecimento: '09:20',
      kmAnterior: 34000,
      kmAtual: 34500,
      kmPercorridos: 500,
      litrosAbastecidos: 42.5,
      precoLitro: 77.90,
      valorTotal: 3310.75,
      tipoCombustivel: 'diesel',
      tanqueCheio: true,
      numeroRecibo: 'TO240618007',
      observacoes: 'Pagamento em dinheiro - sem cartão',
      consumoPorKm: 11.76, // km/litro
      eficiencia: 'excelente',
      aprovado: true,
      aprovadoPor: 'admin',
      criadoEm: new Date('2024-06-18T09:20:00'),
      criadoPor: 'carlos.santos'
    }
  ];

  const cartoes: CartaoCombustivel[] = [
    {
      id: '1',
      numero: 'PUMA-001',
      fornecedor: 'Puma Energy',
      saldoAtual: 25000,
      limiteCredito: 50000,
      dataVencimento: new Date('2024-12-31'),
      status: 'ativo',
      veiculosAutorizados: ['ABC-1234', 'DEF-9012'],
      tipoRede: 'puma'
    },
    {
      id: '2',
      numero: 'PETRO-002',
      fornecedor: 'Petromoc',
      saldoAtual: 15500,
      limiteCredito: 40000,
      dataVencimento: new Date('2024-11-30'),
      status: 'ativo',
      veiculosAutorizados: ['XYZ-5678'],
      tipoRede: 'petromoc'
    },
    {
      id: '3',
      numero: 'SHELL-003',
      fornecedor: 'Shell',
      saldoAtual: 8200,
      limiteCredito: 30000,
      dataVencimento: new Date('2025-01-15'),
      status: 'ativo',
      veiculosAutorizados: ['VIP-0001'],
      tipoRede: 'shell'
    }
  ];

  const veiculos = [
    { id: '1', matricula: 'ABC-1234', modelo: 'Toyota Hilux' },
    { id: '2', matricula: 'XYZ-5678', modelo: 'Isuzu D-Max' },
    { id: '3', matricula: 'VIP-0001', modelo: 'Mercedes Sprinter' }
  ];

  const postos = [
    { id: '1', nome: 'Puma Energy Polana', rede: 'Puma' },
    { id: '2', nome: 'Petromoc Centro', rede: 'Petromoc' },
    { id: '3', nome: 'Shell Select Sommerschield', rede: 'Shell' },
    { id: '4', nome: 'Total Energy Matola', rede: 'Total' },
    { id: '5', nome: 'Engen Maxaquene', rede: 'Engen' }
  ];

  const filteredAbastecimentos = abastecimentos.filter(abastecimento => {
    const matchesSearch = 
      abastecimento.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      abastecimento.veiculoMatricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
      abastecimento.motorista.toLowerCase().includes(searchTerm.toLowerCase()) ||
      abastecimento.postoCombustivel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      abastecimento.numeroRecibo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesVeiculo = veiculoFilter === 'todos' || abastecimento.veiculoId === veiculoFilter;
    const matchesPosto = postoFilter === 'todos' || abastecimento.postoCombustivel.includes(postoFilter);
    const matchesStatus = statusFilter === 'todos' || 
      (statusFilter === 'aprovado' && abastecimento.aprovado) ||
      (statusFilter === 'pendente' && !abastecimento.aprovado);
    const matchesData = !dataFilter || 
      abastecimento.dataAbastecimento.toDateString() === dataFilter.toDateString();

    return matchesSearch && matchesVeiculo && matchesPosto && matchesStatus && matchesData;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredAbastecimentos, initialItemsPerPage: 10 });

  const getEficienciaInfo = (eficiencia: string) => {
    const eficienciaMap = {
      excelente: { label: 'Excelente', color: 'bg-green-100 text-green-800' },
      boa: { label: 'Boa', color: 'bg-blue-100 text-blue-800' },
      media: { label: 'Média', color: 'bg-yellow-100 text-yellow-800' },
      ruim: { label: 'Ruim', color: 'bg-red-100 text-red-800' }
    };
    return eficienciaMap[eficiencia as keyof typeof eficienciaMap] || eficienciaMap.media;
  };

  const getTipoCombustivelInfo = (tipo: string) => {
    const tipoMap = {
      diesel: { label: 'Diesel', color: 'bg-gray-100 text-gray-800' },
      gasolina: { label: 'Gasolina', color: 'bg-blue-100 text-blue-800' },
      gas: { label: 'Gás', color: 'bg-green-100 text-green-800' }
    };
    return tipoMap[tipo as keyof typeof tipoMap] || tipoMap.diesel;
  };

  const handleAprovarAbastecimento = (abastecimento: Abastecimento) => {
    toast({
      title: "Abastecimento aprovado",
      description: `O abastecimento ${abastecimento.codigo} foi aprovado`,
    });
  };

  const handleReprovarAbastecimento = (abastecimento: Abastecimento) => {
    toast({
      title: "Abastecimento reprovado",
      description: `O abastecimento ${abastecimento.codigo} foi reprovado`,
      variant: "destructive"
    });
  };

  const handleGerarRelatorio = () => {
    toast({
      title: "Gerando relatório",
      description: "O relatório de consumo será baixado em breve",
    });
  };

  // Estatísticas
  const estatisticas = {
    totalAbastecimentos: abastecimentos.length,
    valorTotalMes: abastecimentos.reduce((acc, a) => acc + a.valorTotal, 0),
    litrosTotalMes: abastecimentos.reduce((acc, a) => acc + a.litrosAbastecidos, 0),
    kmTotalMes: abastecimentos.reduce((acc, a) => acc + a.kmPercorridos, 0),
    consumoMedio: abastecimentos.reduce((acc, a) => acc + (a.consumoPorKm || 0), 0) / abastecimentos.length,
    precoMedioLitro: abastecimentos.reduce((acc, a) => acc + a.precoLitro, 0) / abastecimentos.length,
    abastecimentosPendentes: abastecimentos.filter(a => !a.aprovado).length,
    saldoTotalCartoes: cartoes.reduce((acc, c) => acc + c.saldoAtual, 0)
  };

  // Dados para gráficos
  const consumoPorVeiculo = veiculos.map(veiculo => {
    const abastecimentosVeiculo = abastecimentos.filter(a => a.veiculoId === veiculo.id);
    const consumoMedio = abastecimentosVeiculo.reduce((acc, a) => acc + (a.consumoPorKm || 0), 0) / 
      Math.max(abastecimentosVeiculo.length, 1);
    const custoTotal = abastecimentosVeiculo.reduce((acc, a) => acc + a.valorTotal, 0);
    
    return {
      veiculo: veiculo.matricula,
      consumo: consumoMedio,
      custo: custoTotal,
      meta: 10 // Meta de 10 km/litro
    };
  });

  const gastosUltimos6Meses = [
    { mes: 'Jan', valor: 35000, litros: 450 },
    { mes: 'Fev', valor: 32000, litros: 420 },
    { mes: 'Mar', valor: 38000, litros: 480 },
    { mes: 'Abr', valor: 41000, litros: 520 },
    { mes: 'Mai', valor: 39000, litros: 500 },
    { mes: 'Jun', valor: 42000, litros: 530 }
  ];

  const eficienciaVeiculos: EficienciaCombustivel[] = veiculos.map(veiculo => {
    const abastecimentosVeiculo = abastecimentos.filter(a => a.veiculoId === veiculo.id);
    const consumoMedio = abastecimentosVeiculo.reduce((acc, a) => acc + (a.consumoPorKm || 0), 0) / 
      Math.max(abastecimentosVeiculo.length, 1);
    const metaConsumo = 10; // Meta de 10 km/litro
    const variacao = ((consumoMedio - metaConsumo) / metaConsumo) * 100;
    
    return {
      veiculoId: veiculo.id,
      veiculoMatricula: veiculo.matricula,
      consumoMedio,
      metaConsumo,
      variacao,
      custoTotalMes: abastecimentosVeiculo.reduce((acc, a) => acc + a.valorTotal, 0),
      litrosTotalMes: abastecimentosVeiculo.reduce((acc, a) => acc + a.litrosAbastecidos, 0),
      kmPercorridosMes: abastecimentosVeiculo.reduce((acc, a) => acc + a.kmPercorridos, 0),
      ultimaEficiencia: abastecimentosVeiculo[abastecimentosVeiculo.length - 1]?.eficiencia || 'media'
    };
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Combustível</h1>
          <p className="text-muted-foreground">Controle de abastecimentos e consumo da frota</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGerarRelatorio}>
            <Download className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Abastecimento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Registrar Abastecimento</DialogTitle>
                <DialogDescription>
                  Registre um novo abastecimento de combustível
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código *</Label>
                    <Input id="codigo" placeholder="AB-XXX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="veiculo">Veículo *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o veículo" />
                      </SelectTrigger>
                      <SelectContent>
                        {veiculos.map(veiculo => (
                          <SelectItem key={veiculo.id} value={veiculo.id}>
                            {veiculo.matricula} - {veiculo.modelo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="motorista">Motorista *</Label>
                    <Input id="motorista" placeholder="Nome do motorista" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="posto">Posto de Combustível *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o posto" />
                      </SelectTrigger>
                      <SelectContent>
                        {postos.map(posto => (
                          <SelectItem key={posto.id} value={posto.id}>
                            {posto.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataAbastecimento">Data *</Label>
                    <Input id="dataAbastecimento" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaAbastecimento">Hora *</Label>
                    <Input id="horaAbastecimento" type="time" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="kmAnterior">KM Anterior *</Label>
                    <Input id="kmAnterior" type="number" placeholder="34500" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kmAtual">KM Atual *</Label>
                    <Input id="kmAtual" type="number" placeholder="35000" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="litros">Litros *</Label>
                    <Input id="litros" type="number" step="0.1" placeholder="45.2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="precoLitro">Preço/Litro (MT) *</Label>
                    <Input id="precoLitro" type="number" step="0.01" placeholder="78.50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valorTotal">Valor Total</Label>
                    <Input id="valorTotal" placeholder="Calculado automaticamente" disabled />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipoCombustivel">Tipo de Combustível *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diesel">Diesel</SelectItem>
                        <SelectItem value="gasolina">Gasolina</SelectItem>
                        <SelectItem value="gas">Gás</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cartao">Cartão Utilizado</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o cartão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Pagamento em Dinheiro</SelectItem>
                        {cartoes.map(cartao => (
                          <SelectItem key={cartao.id} value={cartao.numero}>
                            {cartao.numero} - {cartao.fornecedor}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numeroRecibo">Número do Recibo *</Label>
                  <Input id="numeroRecibo" placeholder="PU240620001" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea 
                    id="observacoes" 
                    placeholder="Observações sobre o abastecimento..." 
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  setIsDialogOpen(false);
                  toast({
                    title: "Abastecimento registrado",
                    description: "O abastecimento foi registrado com sucesso",
                  });
                }}>
                  Registrar Abastecimento
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
                <p className="text-sm text-muted-foreground">Gasto Total (Mês)</p>
                <p className="text-2xl font-bold">MT {(estatisticas.valorTotalMes / 1000).toFixed(1)}K</p>
                <p className="text-xs text-muted-foreground">{estatisticas.litrosTotalMes.toFixed(0)} litros</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Consumo Médio</p>
                <p className="text-2xl font-bold">{estatisticas.consumoMedio.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">km/litro</p>
              </div>
              <Gauge className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Preço Médio</p>
                <p className="text-2xl font-bold">MT {estatisticas.precoMedioLitro.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">por litro</p>
              </div>
              <Fuel className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo Cartões</p>
                <p className="text-2xl font-bold">MT {(estatisticas.saldoTotalCartoes / 1000).toFixed(1)}K</p>
                <p className="text-xs text-muted-foreground">{estatisticas.abastecimentosPendentes} pendentes</p>
              </div>
              <CreditCard className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="abastecimentos">Abastecimentos</TabsTrigger>
          <TabsTrigger value="eficiencia">Eficiência</TabsTrigger>
          <TabsTrigger value="cartoes">Cartões Combustível</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="abastecimentos">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por código, veículo, motorista, posto ou recibo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={veiculoFilter} onValueChange={setVeiculoFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {veiculos.map(veiculo => (
                        <SelectItem key={veiculo.id} value={veiculo.id}>
                          {veiculo.matricula}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={postoFilter} onValueChange={setPostoFilter}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Posto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="Puma">Puma</SelectItem>
                      <SelectItem value="Petromoc">Petromoc</SelectItem>
                      <SelectItem value="Shell">Shell</SelectItem>
                      <SelectItem value="Total">Total</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="aprovado">Aprovados</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dataFilter}
                        onSelect={setDataFilter}
                      />
                    </PopoverContent>
                  </Popover>

                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Posto</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead>Consumo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((abastecimento) => {
                      const eficienciaInfo = getEficienciaInfo(abastecimento.eficiencia || 'media');
                      const tipoInfo = getTipoCombustivelInfo(abastecimento.tipoCombustivel);
                      
                      return (
                        <TableRow key={abastecimento.id}>
                          <TableCell className="font-medium">{abastecimento.codigo}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{abastecimento.veiculoMatricula}</div>
                              <div className="text-sm text-muted-foreground">{abastecimento.motorista}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">{format(abastecimento.dataAbastecimento, 'dd/MM/yyyy', { locale: pt })}</div>
                              <div className="text-xs text-muted-foreground">{abastecimento.horaAbastecimento}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{abastecimento.postoCombustivel}</div>
                              <div className="text-xs text-muted-foreground">{abastecimento.numeroRecibo}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tipoInfo.color}`}>
                                {tipoInfo.label}
                              </span>
                              <div className="text-xs text-muted-foreground">{abastecimento.litrosAbastecidos}L</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{abastecimento.consumoPorKm?.toFixed(1)} km/L</div>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${eficienciaInfo.color}`}>
                                {eficienciaInfo.label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">MT {abastecimento.valorTotal.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">MT {abastecimento.precoLitro}/L</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {abastecimento.aprovado ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3" />
                                Aprovado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <Clock className="h-3 w-3" />
                                Pendente
                              </span>
                            )}
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
                                  <Link href={`/transporte/combustivel/${abastecimento.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver Detalhes
                                  </Link>
                                </DropdownMenuItem>
                                {!abastecimento.aprovado && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleAprovarAbastecimento(abastecimento)}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Aprovar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleReprovarAbastecimento(abastecimento)}>
                                      <XCircle className="h-4 w-4 mr-2" />
                                      Reprovar
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem asChild>
                                  <Link href={`/transporte/combustivel/${abastecimento.id}/editar`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <Receipt className="h-4 w-4 mr-2" />
                                  Ver Recibo
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
                          <Fuel className="h-12 w-12 opacity-50" />
                          <p>Nenhum abastecimento encontrado</p>
                          <p className="text-sm">Tente ajustar os filtros ou registrar um novo abastecimento</p>
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
        </TabsContent>

        <TabsContent value="eficiencia">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Eficiência por Veículo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {eficienciaVeiculos.map(veiculo => {
                    const eficienciaInfo = getEficienciaInfo(veiculo.ultimaEficiencia);
                    const isAcimaMedia = veiculo.consumoMedio > veiculo.metaConsumo;
                    
                    return (
                      <div key={veiculo.veiculoId} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4" />
                              <span className="font-medium">{veiculo.veiculoMatricula}</span>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${eficienciaInfo.color}`}>
                                {eficienciaInfo.label}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {veiculo.kmPercorridosMes.toLocaleString()} km este mês
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">{veiculo.consumoMedio.toFixed(1)} km/L</div>
                            <div className={`text-sm ${isAcimaMedia ? 'text-green-600' : 'text-red-600'}`}>
                              {isAcimaMedia ? '+' : ''}{veiculo.variacao.toFixed(1)}% vs meta
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Custo Total:</span>
                            <div className="font-medium">MT {veiculo.custoTotalMes.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Litros Consumidos:</span>
                            <div className="font-medium">{veiculo.litrosTotalMes.toFixed(1)}L</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Meta:</span>
                            <div className="font-medium">{veiculo.metaConsumo} km/L</div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Progresso vs Meta</span>
                            <span>{((veiculo.consumoMedio / veiculo.metaConsumo) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${isAcimaMedia ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(((veiculo.consumoMedio / veiculo.metaConsumo) * 100), 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Consumo vs Meta por Veículo</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    consumo: {
                      label: 'Consumo Atual',
                      color: 'hsl(var(--chart-1))',
                    },
                    meta: {
                      label: 'Meta',
                      color: 'hsl(var(--chart-2))',
                    },
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={consumoPorVeiculo}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="veiculo" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar dataKey="consumo" fill="#8884d8" name="Consumo (km/L)" />
                      <Bar dataKey="meta" fill="#82ca9d" name="Meta (km/L)" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cartoes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Cartões de Combustível
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {cartoes.map(cartao => {
                  const utilizacao = (cartao.saldoAtual / cartao.limiteCredito) * 100;
                  const proximoVencimento = cartao.dataVencimento < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  
                  return (
                    <div key={cartao.id} className={`p-4 border rounded-lg ${proximoVencimento ? 'border-orange-200 bg-orange-50' : ''}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            <span className="font-medium">{cartao.numero}</span>
                            <Badge variant={cartao.status === 'ativo' ? 'default' : 'destructive'}>
                              {cartao.status === 'ativo' ? 'Ativo' : cartao.status === 'bloqueado' ? 'Bloqueado' : 'Vencido'}
                            </Badge>
                            {proximoVencimento && (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Vence em breve
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {cartao.fornecedor} - Rede {cartao.tipoRede.charAt(0).toUpperCase() + cartao.tipoRede.slice(1)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Vencimento: {format(cartao.dataVencimento, 'dd/MM/yyyy', { locale: pt })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">MT {cartao.saldoAtual.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">
                            Limite: MT {cartao.limiteCredito.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Saldo Disponível</span>
                          <span>{utilizacao.toFixed(1)}% utilizado</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${utilizacao > 80 ? 'bg-red-500' : utilizacao > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${100 - utilizacao}%` }}
                          ></div>
                        </div>
                        
                        <div className="mt-3">
                          <div className="text-sm font-medium mb-1">Veículos Autorizados:</div>
                          <div className="flex flex-wrap gap-1">
                            {cartao.veiculosAutorizados.map(veiculo => (
                              <Badge key={veiculo} variant="outline" className="text-xs">
                                {veiculo}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Evolução de Gastos (6 meses)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      valor: {
                        label: 'Valor (MT)',
                        color: 'hsl(var(--chart-1))',
                      },
                      litros: {
                        label: 'Litros',
                        color: 'hsl(var(--chart-2))',
                      },
                    }}
                    className="h-[300px]"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={gastosUltimos6Meses}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="valor" 
                          stroke="#8884d8" 
                          strokeWidth={2}
                          name="Valor (MT)"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="litros" 
                          stroke="#82ca9d" 
                          strokeWidth={2}
                          name="Litros"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Métricas de Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <Gauge className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                        <h4 className="font-medium">Consumo Médio</h4>
                        <p className="text-2xl font-bold text-blue-600">{estatisticas.consumoMedio.toFixed(1)}</p>
                        <p className="text-sm text-muted-foreground">km/litro</p>
                      </div>
                      
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <Target className="h-8 w-8 mx-auto text-green-600 mb-2" />
                        <h4 className="font-medium">Eficiência Geral</h4>
                        <p className="text-2xl font-bold text-green-600">87%</p>
                        <p className="text-sm text-muted-foreground">vs meta</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Análise por Posto</h4>
                      {[
                        { posto: 'Puma Energy', gastos: 15400, economia: 5.2 },
                        { posto: 'Petromoc', gastos: 12800, economia: -2.1 },
                        { posto: 'Shell', gastos: 8900, economia: 8.5 },
                        { posto: 'Total', gastos: 5100, economia: 3.2 }
                      ].map((item, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <div>
                            <span className="font-medium">{item.posto}</span>
                            <div className="text-sm text-muted-foreground">MT {item.gastos.toLocaleString()}</div>
                          </div>
                          <div className={`text-sm font-medium ${item.economia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.economia > 0 ? '+' : ''}{item.economia}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recomendações de Otimização</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <Target className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-blue-900">Otimizar Rotas</h5>
                      <p className="text-sm text-blue-700">
                        Combine entregas para reduzir consumo de combustível em 15%.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <Zap className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-green-900">Treinamento de Condução</h5>
                      <p className="text-sm text-green-700">
                        Implemente programa de condução econômica para melhorar eficiência em 20%.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                    <CreditCard className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-yellow-900">Negociação com Postos</h5>
                      <p className="text-sm text-yellow-700">
                        Negocie desconto corporativo para reduzir custos em 8%.
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