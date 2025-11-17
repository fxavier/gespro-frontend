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
  Wrench,
  Truck,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  DollarSign,
  FileText,
  User,
  Package,
  Activity,
  TrendingUp,
  TrendingDown,
  Settings,
  Filter,
  Download,
  RefreshCw,
  Bell,
  Target,
  Fuel,
  Gauge,
  Zap,
  Wrench as Tool,
  ShoppingCart,
  Timer,
  MapPin,
  Phone
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Manutencao {
  id: string;
  codigo: string;
  veiculoId: string;
  veiculoMatricula: string;
  veiculoModelo: string;
  tipo: 'preventiva' | 'corretiva' | 'preditiva' | 'emergencia';
  status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada' | 'pendente_pecas';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  dataAgendada: Date;
  dataInicio?: Date;
  dataConclusao?: Date;
  kmAtual: number;
  kmProxima?: number;
  oficina: string;
  mecanicoResponsavel?: string;
  telefoneOficina?: string;
  servicos: ServicoManutencao[];
  pecas: PecaManutencao[];
  custoMaoObra: number;
  custoPecas: number;
  custoTotal: number;
  tempoEstimado: number;
  tempoReal?: number;
  observacoes?: string;
  problemaRelatado?: string;
  diagnostico?: string;
  recomendacoes?: string;
  garantia?: {
    prazo: number;
    descricao: string;
  };
  anexos?: string[];
  proximaManutencao?: {
    km: number;
    data: Date;
    tipo: string;
  };
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
}

interface ServicoManutencao {
  id: string;
  nome: string;
  descricao: string;
  categoria: 'motor' | 'freios' | 'suspensao' | 'eletrica' | 'carroceria' | 'outro';
  custo: number;
  tempo: number;
  concluido: boolean;
  observacoes?: string;
}

interface PecaManutencao {
  id: string;
  nome: string;
  codigo: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  fornecedor?: string;
  garantia?: number;
  original: boolean;
  status: 'solicitada' | 'em_transito' | 'disponivel' | 'instalada';
}

interface Veiculo {
  id: string;
  matricula: string;
  modelo: string;
  marca: string;
  ano: number;
  kmAtual: number;
  status: 'disponivel' | 'em_rota' | 'manutencao' | 'inativo';
}

export default function ManutencaoPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [veiculoFilter, setVeiculoFilter] = useState<string>('todos');
  const [dataFilter, setDataFilter] = useState<Date>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('lista');

  // Dados de exemplo
  const veiculos: Veiculo[] = [
    {
      id: '1',
      matricula: 'ABC-1234',
      modelo: 'Hilux',
      marca: 'Toyota',
      ano: 2022,
      kmAtual: 35000,
      status: 'disponivel'
    },
    {
      id: '2',
      matricula: 'XYZ-5678',
      modelo: 'D-Max',
      marca: 'Isuzu',
      ano: 2021,
      kmAtual: 42000,
      status: 'manutencao'
    },
    {
      id: '3',
      matricula: 'VIP-0001',
      modelo: 'Sprinter',
      marca: 'Mercedes',
      ano: 2023,
      kmAtual: 18000,
      status: 'disponivel'
    }
  ];

  const manutencoes: Manutencao[] = [
    {
      id: '1',
      codigo: 'MAN-001',
      veiculoId: '1',
      veiculoMatricula: 'ABC-1234',
      veiculoModelo: 'Toyota Hilux',
      tipo: 'preventiva',
      status: 'agendada',
      prioridade: 'media',
      dataAgendada: new Date('2024-06-25'),
      kmAtual: 35000,
      kmProxima: 40000,
      oficina: 'Toyota Service Center',
      mecanicoResponsavel: 'José António',
      telefoneOficina: '+258 21 123 456',
      servicos: [
        {
          id: '1',
          nome: 'Troca de Óleo',
          descricao: 'Troca de óleo do motor e filtro',
          categoria: 'motor',
          custo: 1500,
          tempo: 60,
          concluido: false
        },
        {
          id: '2',
          nome: 'Revisão dos Freios',
          descricao: 'Inspeção e ajuste do sistema de freios',
          categoria: 'freios',
          custo: 800,
          tempo: 90,
          concluido: false
        }
      ],
      pecas: [
        {
          id: '1',
          nome: 'Filtro de Óleo',
          codigo: 'FO-TOY-001',
          quantidade: 1,
          valorUnitario: 250,
          valorTotal: 250,
          fornecedor: 'Toyota Parts',
          garantia: 6,
          original: true,
          status: 'disponivel'
        },
        {
          id: '2',
          nome: 'Óleo Motor 5W-30',
          codigo: 'OM-TOY-002',
          quantidade: 5,
          valorUnitario: 180,
          valorTotal: 900,
          fornecedor: 'Toyota Parts',
          original: true,
          status: 'disponivel'
        }
      ],
      custoMaoObra: 2300,
      custoPecas: 1150,
      custoTotal: 3450,
      tempoEstimado: 150,
      observacoes: 'Manutenção preventiva aos 35.000km',
      proximaManutencao: {
        km: 40000,
        data: new Date('2024-09-25'),
        tipo: 'Revisão 40.000km'
      },
      criadoEm: new Date('2024-06-20'),
      criadoPor: 'admin'
    },
    {
      id: '2',
      codigo: 'MAN-002',
      veiculoId: '2',
      veiculoMatricula: 'XYZ-5678',
      veiculoModelo: 'Isuzu D-Max',
      tipo: 'corretiva',
      status: 'em_andamento',
      prioridade: 'alta',
      dataAgendada: new Date('2024-06-22'),
      dataInicio: new Date('2024-06-22T08:00:00'),
      kmAtual: 42000,
      oficina: 'Isuzu Motors Maputo',
      mecanicoResponsavel: 'Carlos Macamo',
      telefoneOficina: '+258 21 987 654',
      problemaRelatado: 'Ruído estranho no motor e perda de potência',
      diagnostico: 'Problema na bomba de combustível e filtros entupidos',
      servicos: [
        {
          id: '3',
          nome: 'Substituição Bomba Combustível',
          descricao: 'Troca da bomba de combustível defeituosa',
          categoria: 'motor',
          custo: 2500,
          tempo: 180,
          concluido: false
        },
        {
          id: '4',
          nome: 'Troca Filtros Combustível',
          descricao: 'Substituição dos filtros de combustível',
          categoria: 'motor',
          custo: 400,
          tempo: 45,
          concluido: true
        }
      ],
      pecas: [
        {
          id: '3',
          nome: 'Bomba de Combustível',
          codigo: 'BC-ISU-001',
          quantidade: 1,
          valorUnitario: 4500,
          valorTotal: 4500,
          fornecedor: 'Isuzu Parts',
          garantia: 12,
          original: true,
          status: 'instalada'
        }
      ],
      custoMaoObra: 2900,
      custoPecas: 4500,
      custoTotal: 7400,
      tempoEstimado: 225,
      tempoReal: 180,
      observacoes: 'Reparação urgente - veículo parado',
      recomendacoes: 'Verificar qualidade do combustível utilizado',
      criadoEm: new Date('2024-06-21'),
      criadoPor: 'admin',
      atualizadoEm: new Date('2024-06-22T14:00:00')
    },
    {
      id: '3',
      codigo: 'MAN-003',
      veiculoId: '1',
      veiculoMatricula: 'ABC-1234',
      veiculoModelo: 'Toyota Hilux',
      tipo: 'preventiva',
      status: 'concluida',
      prioridade: 'media',
      dataAgendada: new Date('2024-05-15'),
      dataInicio: new Date('2024-05-15T09:00:00'),
      dataConclusao: new Date('2024-05-15T12:30:00'),
      kmAtual: 30000,
      oficina: 'Toyota Service Center',
      mecanicoResponsavel: 'José António',
      servicos: [
        {
          id: '5',
          nome: 'Revisão 30.000km',
          descricao: 'Revisão completa aos 30.000km',
          categoria: 'motor',
          custo: 2800,
          tempo: 210,
          concluido: true,
          observacoes: 'Todos os itens verificados e aprovados'
        }
      ],
      pecas: [
        {
          id: '4',
          nome: 'Kit Filtros',
          codigo: 'KF-TOY-001',
          quantidade: 1,
          valorUnitario: 850,
          valorTotal: 850,
          fornecedor: 'Toyota Parts',
          original: true,
          status: 'instalada'
        }
      ],
      custoMaoObra: 2800,
      custoPecas: 850,
      custoTotal: 3650,
      tempoEstimado: 210,
      tempoReal: 210,
      garantia: {
        prazo: 6,
        descricao: 'Garantia de 6 meses ou 10.000km para serviços realizados'
      },
      proximaManutencao: {
        km: 35000,
        data: new Date('2024-08-15'),
        tipo: 'Revisão 35.000km'
      },
      criadoEm: new Date('2024-05-10'),
      criadoPor: 'admin',
      atualizadoEm: new Date('2024-05-15T12:30:00')
    },
    {
      id: '4',
      codigo: 'MAN-004',
      veiculoId: '3',
      veiculoMatricula: 'VIP-0001',
      veiculoModelo: 'Mercedes Sprinter',
      tipo: 'emergencia',
      status: 'pendente_pecas',
      prioridade: 'critica',
      dataAgendada: new Date('2024-06-23'),
      dataInicio: new Date('2024-06-23T14:00:00'),
      kmAtual: 18000,
      oficina: 'Mercedes Service Maputo',
      mecanicoResponsavel: 'Fernando Silva',
      telefoneOficina: '+258 21 555 777',
      problemaRelatado: 'Veículo não liga - suspeita de problema elétrico',
      diagnostico: 'Alternador queimado e bateria descarregada',
      servicos: [
        {
          id: '6',
          nome: 'Substituição Alternador',
          descricao: 'Troca do alternador queimado',
          categoria: 'eletrica',
          custo: 1800,
          tempo: 120,
          concluido: false
        },
        {
          id: '7',
          nome: 'Troca de Bateria',
          descricao: 'Instalação de nova bateria',
          categoria: 'eletrica',
          custo: 600,
          tempo: 30,
          concluido: true
        }
      ],
      pecas: [
        {
          id: '5',
          nome: 'Alternador',
          codigo: 'ALT-MER-001',
          quantidade: 1,
          valorUnitario: 8500,
          valorTotal: 8500,
          fornecedor: 'Mercedes Parts',
          garantia: 24,
          original: true,
          status: 'solicitada'
        }
      ],
      custoMaoObra: 2400,
      custoPecas: 8500,
      custoTotal: 10900,
      tempoEstimado: 150,
      observacoes: 'Aguardando peça original da Mercedes - ETA 3 dias',
      criadoEm: new Date('2024-06-23'),
      criadoPor: 'admin'
    }
  ];

  const oficinas = [
    { id: '1', nome: 'Toyota Service Center', especialidade: 'Toyota', telefone: '+258 21 123 456' },
    { id: '2', nome: 'Isuzu Motors Maputo', especialidade: 'Isuzu', telefone: '+258 21 987 654' },
    { id: '3', nome: 'Mercedes Service Maputo', especialidade: 'Mercedes', telefone: '+258 21 555 777' },
    { id: '4', nome: 'Oficina Multimarca Central', especialidade: 'Geral', telefone: '+258 84 999 888' }
  ];

  const filteredManutencoes = manutencoes.filter(manutencao => {
    const matchesSearch = 
      manutencao.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manutencao.veiculoMatricula.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manutencao.veiculoModelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manutencao.oficina.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (manutencao.mecanicoResponsavel && manutencao.mecanicoResponsavel.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'todos' || manutencao.status === statusFilter;
    const matchesTipo = tipoFilter === 'todos' || manutencao.tipo === tipoFilter;
    const matchesVeiculo = veiculoFilter === 'todos' || manutencao.veiculoId === veiculoFilter;
    const matchesData = !dataFilter || 
      manutencao.dataAgendada.toDateString() === dataFilter.toDateString();

    return matchesSearch && matchesStatus && matchesTipo && matchesVeiculo && matchesData;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredManutencoes, initialItemsPerPage: 10 });

  const getStatusInfo = (status: string) => {
    const statusMap = {
      agendada: { label: 'Agendada', icon: <CalendarIcon className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
      em_andamento: { label: 'Em Andamento', icon: <Settings className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
      concluida: { label: 'Concluída', icon: <CheckCircle className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
      cancelada: { label: 'Cancelada', icon: <XCircle className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
      pendente_pecas: { label: 'Pendente Peças', icon: <Package className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800' }
    };
    return statusMap[status as keyof typeof statusMap] || statusMap.agendada;
  };

  const getTipoInfo = (tipo: string) => {
    const tipoMap = {
      preventiva: { label: 'Preventiva', color: 'bg-blue-100 text-blue-800' },
      corretiva: { label: 'Corretiva', color: 'bg-yellow-100 text-yellow-800' },
      preditiva: { label: 'Preditiva', color: 'bg-green-100 text-green-800' },
      emergencia: { label: 'Emergência', color: 'bg-red-100 text-red-800' }
    };
    return tipoMap[tipo as keyof typeof tipoMap] || tipoMap.preventiva;
  };

  const getPrioridadeInfo = (prioridade: string) => {
    const prioridadeMap = {
      baixa: { label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
      media: { label: 'Média', color: 'bg-blue-100 text-blue-800' },
      alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
      critica: { label: 'Crítica', color: 'bg-red-100 text-red-800' }
    };
    return prioridadeMap[prioridade as keyof typeof prioridadeMap] || prioridadeMap.media;
  };

  const handleIniciarManutencao = (manutencao: Manutencao) => {
    toast({
      title: "Manutenção iniciada",
      description: `A manutenção ${manutencao.codigo} foi iniciada`,
    });
  };

  const handleConcluirManutencao = (manutencao: Manutencao) => {
    toast({
      title: "Manutenção concluída",
      description: `A manutenção ${manutencao.codigo} foi marcada como concluída`,
    });
  };

  const handleGerarAlerta = () => {
    toast({
      title: "Alertas gerados",
      description: "Alertas de manutenção preventiva foram enviados",
    });
  };

  // Estatísticas
  const estatisticas = {
    totalManutencoes: manutencoes.length,
    manutencoesPendentes: manutencoes.filter(m => m.status === 'agendada').length,
    manutencaoesAndamento: manutencoes.filter(m => m.status === 'em_andamento').length,
    veiculosManutencao: new Set(manutencoes.filter(m => m.status === 'em_andamento').map(m => m.veiculoId)).size,
    custoTotalMes: manutencoes.filter(m => 
      m.dataConclusao && m.dataConclusao.getMonth() === new Date().getMonth()
    ).reduce((acc, m) => acc + m.custoTotal, 0),
    tempoMedioReparo: manutencoes.filter(m => m.tempoReal).reduce((acc, m) => acc + (m.tempoReal || 0), 0) / 
      Math.max(manutencoes.filter(m => m.tempoReal).length, 1),
    eficienciaPreventiva: (manutencoes.filter(m => m.tipo === 'preventiva').length / manutencoes.length) * 100,
    alertasVencimento: veiculos.filter(v => v.kmAtual % 5000 <= 500).length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Manutenção</h1>
          <p className="text-muted-foreground">Controlo e agendamento de manutenções da frota</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGerarAlerta}>
            <Bell className="h-4 w-4 mr-2" />
            Gerar Alertas
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Manutenção
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Agendar Nova Manutenção</DialogTitle>
                <DialogDescription>
                  Configure uma nova manutenção para um veículo da frota
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código *</Label>
                    <Input id="codigo" placeholder="MAN-XXX" />
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
                            {veiculo.matricula} - {veiculo.marca} {veiculo.modelo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo de Manutenção *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preventiva">Preventiva</SelectItem>
                        <SelectItem value="corretiva">Corretiva</SelectItem>
                        <SelectItem value="preditiva">Preditiva</SelectItem>
                        <SelectItem value="emergencia">Emergência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prioridade">Prioridade *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a prioridade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="critica">Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataAgendada">Data Agendada *</Label>
                    <Input id="dataAgendada" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="kmAtual">KM Atual *</Label>
                    <Input id="kmAtual" type="number" placeholder="35000" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oficina">Oficina *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a oficina" />
                    </SelectTrigger>
                    <SelectContent>
                      {oficinas.map(oficina => (
                        <SelectItem key={oficina.id} value={oficina.id}>
                          {oficina.nome} - {oficina.especialidade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="problemaRelatado">Problema Relatado</Label>
                  <Textarea 
                    id="problemaRelatado" 
                    placeholder="Descreva o problema ou serviços necessários..." 
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="custoEstimado">Custo Estimado (MT)</Label>
                    <Input id="custoEstimado" type="number" placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tempoEstimado">Tempo Estimado (min)</Label>
                    <Input id="tempoEstimado" type="number" placeholder="120" />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  setIsDialogOpen(false);
                  toast({
                    title: "Manutenção agendada",
                    description: "A manutenção foi agendada com sucesso",
                  });
                }}>
                  Agendar Manutenção
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
                <p className="text-sm text-muted-foreground">Manutenções Pendentes</p>
                <p className="text-2xl font-bold">{estatisticas.manutencoesPendentes}</p>
                <p className="text-xs text-muted-foreground">agendadas</p>
              </div>
              <CalendarIcon className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
                <p className="text-2xl font-bold">{estatisticas.manutencaoesAndamento}</p>
                <p className="text-xs text-muted-foreground">{estatisticas.veiculosManutencao} veículos</p>
              </div>
              <Settings className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Custo Total (Mês)</p>
                <p className="text-2xl font-bold">MT {(estatisticas.custoTotalMes / 1000).toFixed(1)}K</p>
                <p className="text-xs text-muted-foreground">este mês</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertas de Vencimento</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.alertasVencimento}</p>
                <p className="text-xs text-muted-foreground">requerem atenção</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de Manutenções</TabsTrigger>
          <TabsTrigger value="alertas">Alertas Preventivos</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por código, veículo, oficina ou mecânico..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="agendada">Agendadas</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="concluida">Concluídas</SelectItem>
                      <SelectItem value="pendente_pecas">Pendente Peças</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={tipoFilter} onValueChange={setTipoFilter}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="preventiva">Preventiva</SelectItem>
                      <SelectItem value="corretiva">Corretiva</SelectItem>
                      <SelectItem value="preditiva">Preditiva</SelectItem>
                      <SelectItem value="emergencia">Emergência</SelectItem>
                    </SelectContent>
                  </Select>

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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Data Agendada</TableHead>
                    <TableHead>Oficina</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((manutencao) => {
                      const statusInfo = getStatusInfo(manutencao.status);
                      const tipoInfo = getTipoInfo(manutencao.tipo);
                      const prioridadeInfo = getPrioridadeInfo(manutencao.prioridade);
                      
                      return (
                        <TableRow key={manutencao.id}>
                          <TableCell className="font-medium">{manutencao.codigo}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{manutencao.veiculoMatricula}</div>
                              <div className="text-sm text-muted-foreground">{manutencao.veiculoModelo}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${tipoInfo.color}`}>
                              {tipoInfo.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                              {statusInfo.icon}
                              {statusInfo.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${prioridadeInfo.color}`}>
                              {prioridadeInfo.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">{format(manutencao.dataAgendada, 'dd/MM/yyyy', { locale: pt })}</div>
                              <div className="text-xs text-muted-foreground">{manutencao.kmAtual.toLocaleString()} km</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{manutencao.oficina}</div>
                              <div className="text-xs text-muted-foreground">{manutencao.mecanicoResponsavel || 'Não atribuído'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">MT {manutencao.custoTotal.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">
                                {manutencao.tempoReal ? `${manutencao.tempoReal}min` : `~${manutencao.tempoEstimado}min`}
                              </div>
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
                                  <Link href={`/transporte/manutencao/${manutencao.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver Detalhes
                                  </Link>
                                </DropdownMenuItem>
                                {manutencao.status === 'agendada' && (
                                  <DropdownMenuItem onClick={() => handleIniciarManutencao(manutencao)}>
                                    <Settings className="h-4 w-4 mr-2" />
                                    Iniciar Manutenção
                                  </DropdownMenuItem>
                                )}
                                {manutencao.status === 'em_andamento' && (
                                  <DropdownMenuItem onClick={() => handleConcluirManutencao(manutencao)}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Concluir
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem asChild>
                                  <Link href={`/transporte/manutencao/${manutencao.id}/editar`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <Phone className="h-4 w-4 mr-2" />
                                  Ligar Oficina
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <FileText className="h-4 w-4 mr-2" />
                                  Gerar Relatório
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
                          <Wrench className="h-12 w-12 opacity-50" />
                          <p>Nenhuma manutenção encontrada</p>
                          <p className="text-sm">Tente ajustar os filtros ou agendar uma nova manutenção</p>
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

        <TabsContent value="alertas">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Alertas Preventivos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {veiculos.map(veiculo => {
                    const proximaManutencao = Math.ceil(veiculo.kmAtual / 5000) * 5000;
                    const kmRestantes = proximaManutencao - veiculo.kmAtual;
                    const urgencia = kmRestantes <= 500 ? 'alta' : kmRestantes <= 1000 ? 'media' : 'baixa';
                    
                    const corAlerta = urgencia === 'alta' ? 'bg-red-50 border-red-200' : 
                                     urgencia === 'media' ? 'bg-yellow-50 border-yellow-200' : 
                                     'bg-blue-50 border-blue-200';
                    
                    return (
                      <div key={veiculo.id} className={`p-4 rounded-lg border ${corAlerta}`}>
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4" />
                              <span className="font-medium">{veiculo.matricula} - {veiculo.marca} {veiculo.modelo}</span>
                              <Badge variant={urgencia === 'alta' ? 'destructive' : urgencia === 'media' ? 'default' : 'secondary'}>
                                {urgencia === 'alta' ? 'Urgente' : urgencia === 'media' ? 'Atenção' : 'Normal'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              KM Atual: {veiculo.kmAtual.toLocaleString()} | Próxima revisão: {proximaManutencao.toLocaleString()} km
                            </div>
                            <div className="text-sm">
                              <span className={urgencia === 'alta' ? 'text-red-600 font-medium' : urgencia === 'media' ? 'text-yellow-600' : 'text-blue-600'}>
                                Faltam {kmRestantes.toLocaleString()} km para próxima manutenção
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              <CalendarIcon className="h-4 w-4 mr-1" />
                              Agendar
                            </Button>
                            <Button size="sm" variant="outline">
                              <Bell className="h-4 w-4 mr-1" />
                              Alertar
                            </Button>
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Progresso até próxima manutenção</span>
                            <span>{(((proximaManutencao - 5000) / 5000) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${urgencia === 'alta' ? 'bg-red-500' : urgencia === 'media' ? 'bg-yellow-500' : 'bg-blue-500'}`}
                              style={{ width: `${((veiculo.kmAtual - (proximaManutencao - 5000)) / 5000) * 100}%` }}
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
                <CardTitle>Plano de Manutenção Preventiva</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <Target className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                      <h4 className="font-medium">Taxa Preventiva</h4>
                      <p className="text-2xl font-bold text-blue-600">{estatisticas.eficienciaPreventiva.toFixed(1)}%</p>
                      <p className="text-sm text-muted-foreground">vs. corretiva</p>
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <Timer className="h-8 w-8 mx-auto text-green-600 mb-2" />
                      <h4 className="font-medium">Tempo Médio</h4>
                      <p className="text-2xl font-bold text-green-600">{estatisticas.tempoMedioReparo.toFixed(0)} min</p>
                      <p className="text-sm text-muted-foreground">por manutenção</p>
                    </div>
                    
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <Activity className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                      <h4 className="font-medium">Disponibilidade</h4>
                      <p className="text-2xl font-bold text-purple-600">
                        {(((veiculos.length - estatisticas.veiculosManutencao) / veiculos.length) * 100).toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground">da frota</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Custos por Tipo de Manutenção</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { tipo: 'Preventiva', custo: 15400, cor: 'bg-blue-500' },
                      { tipo: 'Corretiva', custo: 28600, cor: 'bg-yellow-500' },
                      { tipo: 'Emergência', custo: 12300, cor: 'bg-red-500' },
                      { tipo: 'Preditiva', custo: 8200, cor: 'bg-green-500' }
                    ].map((item, index) => {
                      const total = 64500;
                      const percentual = (item.custo / total) * 100;
                      return (
                        <div key={index} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">{item.tipo}</span>
                            <span className="text-sm">MT {item.custo.toLocaleString()} ({percentual.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${item.cor}`}
                              style={{ width: `${percentual}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance da Frota</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {veiculos.map((veiculo, index) => {
                      const manutencaoesVeiculo = manutencoes.filter(m => m.veiculoId === veiculo.id);
                      const custoTotal = manutencaoesVeiculo.reduce((acc, m) => acc + m.custoTotal, 0);
                      const disponibilidade = veiculo.status === 'manutencao' ? 75 : 95;
                      
                      return (
                        <div key={veiculo.id} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-medium">{veiculo.matricula}</span>
                              <span className="text-sm text-muted-foreground ml-2">{veiculo.marca} {veiculo.modelo}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">MT {custoTotal.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">{disponibilidade}% disponível</div>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${disponibilidade >= 90 ? 'bg-green-500' : disponibilidade >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${disponibilidade}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
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
                      <h5 className="font-medium text-blue-900">Aumentar Manutenção Preventiva</h5>
                      <p className="text-sm text-blue-700">
                        Aumente a frequência de manutenções preventivas para reduzir custos de emergência em 30%.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <Zap className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-green-900">Negociação com Fornecedores</h5>
                      <p className="text-sm text-green-700">
                        Considere contratos de manutenção com desconto para reduzir custos em 15%.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                    <Tool className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-yellow-900">Treinamento de Motoristas</h5>
                      <p className="text-sm text-yellow-700">
                        Implemente programa de condução econômica para reduzir desgaste dos veículos.
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