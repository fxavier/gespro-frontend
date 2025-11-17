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
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  MapPin,
  Navigation,
  Clock,
  Package,
  Truck,
  User,
  AlertTriangle,
  CheckCircle,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Route,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Fuel,
  BarChart3,
  Calendar,
  RefreshCw,
  Download,
  Settings,
  Map,
  Target,
  Activity,
  Zap,
  Filter
} from 'lucide-react';
import Link from 'next/link';

interface Rota {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  origem: string;
  destino: string;
  pontos: PontoRota[];
  distanciaTotal: number;
  tempoEstimado: number;
  status: 'planejada' | 'ativa' | 'concluida' | 'cancelada' | 'pausada';
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  veiculoId?: string;
  veiculoMatricula?: string;
  motoristaId?: string;
  motoristaNome?: string;
  dataInicio?: Date;
  dataFim?: Date;
  dataPlanejada: Date;
  custoEstimado: number;
  custoReal?: number;
  combustivelEstimado: number;
  combustivelReal?: number;
  entregas: EntregaRota[];
  observacoes?: string;
  criadoEm: Date;
  criadoPor: string;
}

interface PontoRota {
  id: string;
  ordem: number;
  endereco: string;
  latitude?: number;
  longitude?: number;
  tempoParada: number;
  tipo: 'coleta' | 'entrega' | 'parada';
  clienteId?: string;
  clienteNome?: string;
  observacoes?: string;
  concluido: boolean;
  horaChegada?: Date;
  horaSaida?: Date;
}

interface EntregaRota {
  id: string;
  codigo: string;
  clienteNome: string;
  endereco: string;
  status: 'pendente' | 'em_transito' | 'entregue' | 'falhada';
  tentativas: number;
  peso?: number;
  volume?: number;
}

export default function RotasPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('lista');

  // Dados de exemplo
  const rotas: Rota[] = [
    {
      id: '1',
      codigo: 'RT-001',
      nome: 'Rota Centro-Norte',
      descricao: 'Entregas na zona central e norte da cidade',
      origem: 'Armazém Central - Av. Julius Nyerere',
      destino: 'Zona Norte - Bairro de Sommerschield',
      pontos: [
        {
          id: '1',
          ordem: 1,
          endereco: 'Av. Julius Nyerere, 1234',
          tempoParada: 15,
          tipo: 'entrega',
          clienteId: '1',
          clienteNome: 'João Silva',
          concluido: true,
          horaChegada: new Date('2024-06-20T08:30:00'),
          horaSaida: new Date('2024-06-20T08:45:00')
        },
        {
          id: '2',
          ordem: 2,
          endereco: 'Rua da Resistência, 567',
          tempoParada: 20,
          tipo: 'entrega',
          clienteId: '2',
          clienteNome: 'Maria Costa',
          concluido: true,
          horaChegada: new Date('2024-06-20T09:15:00'),
          horaSaida: new Date('2024-06-20T09:35:00')
        },
        {
          id: '3',
          ordem: 3,
          endereco: 'Av. 25 de Setembro, 890',
          tempoParada: 30,
          tipo: 'entrega',
          clienteId: '3',
          clienteNome: 'Empresa ABC Lda',
          concluido: false
        }
      ],
      distanciaTotal: 45.5,
      tempoEstimado: 240,
      status: 'ativa',
      prioridade: 'alta',
      veiculoId: '1',
      veiculoMatricula: 'ABC-1234',
      motoristaId: '1',
      motoristaNome: 'Carlos Santos',
      dataInicio: new Date('2024-06-20T08:00:00'),
      dataPlanejada: new Date('2024-06-20'),
      custoEstimado: 1250,
      combustivelEstimado: 18.5,
      entregas: [
        {
          id: '1',
          codigo: 'ENT-001',
          clienteNome: 'João Silva',
          endereco: 'Av. Julius Nyerere, 1234',
          status: 'entregue',
          tentativas: 1,
          peso: 5.5,
          volume: 0.2
        },
        {
          id: '2',
          codigo: 'ENT-002',
          clienteNome: 'Maria Costa',
          endereco: 'Rua da Resistência, 567',
          status: 'entregue',
          tentativas: 1,
          peso: 3.2,
          volume: 0.15
        },
        {
          id: '3',
          codigo: 'ENT-003',
          clienteNome: 'Empresa ABC Lda',
          endereco: 'Av. 25 de Setembro, 890',
          status: 'em_transito',
          tentativas: 0,
          peso: 12.8,
          volume: 0.45
        }
      ],
      criadoEm: new Date('2024-06-19'),
      criadoPor: 'admin'
    },
    {
      id: '2',
      codigo: 'RT-002',
      nome: 'Rota Matola-Maputo',
      descricao: 'Coletas e entregas entre Matola e Maputo',
      origem: 'Matola - Zona Industrial',
      destino: 'Maputo - Centro da Cidade',
      pontos: [
        {
          id: '4',
          ordem: 1,
          endereco: 'Matola - Fábrica XYZ',
          tempoParada: 45,
          tipo: 'coleta',
          clienteId: '4',
          clienteNome: 'Fábrica XYZ',
          concluido: false
        },
        {
          id: '5',
          ordem: 2,
          endereco: 'Av. Vladimir Lenine, 200',
          tempoParada: 20,
          tipo: 'entrega',
          clienteId: '5',
          clienteNome: 'Loja Central',
          concluido: false
        }
      ],
      distanciaTotal: 32.0,
      tempoEstimado: 180,
      status: 'planejada',
      prioridade: 'media',
      dataPlanejada: new Date('2024-06-21'),
      custoEstimado: 980,
      combustivelEstimado: 14.2,
      entregas: [
        {
          id: '4',
          codigo: 'ENT-004',
          clienteNome: 'Loja Central',
          endereco: 'Av. Vladimir Lenine, 200',
          status: 'pendente',
          tentativas: 0,
          peso: 8.5,
          volume: 0.3
        }
      ],
      criadoEm: new Date('2024-06-19'),
      criadoPor: 'admin'
    },
    {
      id: '3',
      codigo: 'RT-003',
      nome: 'Rota Expressa Sul',
      descricao: 'Entrega urgente zona sul',
      origem: 'Armazém Central',
      destino: 'Catembe',
      pontos: [
        {
          id: '6',
          ordem: 1,
          endereco: 'Catembe - Porto de Pesca',
          tempoParada: 30,
          tipo: 'entrega',
          clienteId: '6',
          clienteNome: 'Pescadores Unidos',
          concluido: true,
          horaChegada: new Date('2024-06-19T14:30:00'),
          horaSaida: new Date('2024-06-19T15:00:00')
        }
      ],
      distanciaTotal: 28.5,
      tempoEstimado: 120,
      status: 'concluida',
      prioridade: 'urgente',
      veiculoId: '2',
      veiculoMatricula: 'XYZ-5678',
      motoristaId: '2',
      motoristaNome: 'Ana Pereira',
      dataInicio: new Date('2024-06-19T13:30:00'),
      dataFim: new Date('2024-06-19T15:30:00'),
      dataPlanejada: new Date('2024-06-19'),
      custoEstimado: 750,
      custoReal: 720,
      combustivelEstimado: 12.0,
      combustivelReal: 11.5,
      entregas: [
        {
          id: '5',
          codigo: 'ENT-005',
          clienteNome: 'Pescadores Unidos',
          endereco: 'Catembe - Porto de Pesca',
          status: 'entregue',
          tentativas: 1,
          peso: 25.0,
          volume: 1.2
        }
      ],
      criadoEm: new Date('2024-06-19'),
      criadoPor: 'admin'
    },
    {
      id: '4',
      codigo: 'RT-004',
      nome: 'Rota Especial Cliente VIP',
      descricao: 'Atendimento exclusivo cliente premium',
      origem: 'Armazém Especial',
      destino: 'Polana Cimento',
      pontos: [
        {
          id: '7',
          ordem: 1,
          endereco: 'Polana Cimento - Escritório Principal',
          tempoParada: 60,
          tipo: 'entrega',
          clienteId: '7',
          clienteNome: 'Cliente VIP Premium',
          concluido: false
        }
      ],
      distanciaTotal: 15.2,
      tempoEstimado: 90,
      status: 'pausada',
      prioridade: 'alta',
      veiculoId: '3',
      veiculoMatricula: 'VIP-0001',
      motoristaId: '3',
      motoristaNome: 'José Manuel',
      dataInicio: new Date('2024-06-20T10:00:00'),
      dataPlanejada: new Date('2024-06-20'),
      custoEstimado: 450,
      combustivelEstimado: 6.8,
      entregas: [
        {
          id: '6',
          codigo: 'ENT-006',
          clienteNome: 'Cliente VIP Premium',
          endereco: 'Polana Cimento - Escritório Principal',
          status: 'em_transito',
          tentativas: 0,
          peso: 2.5,
          volume: 0.05
        }
      ],
      observacoes: 'Cliente VIP - Requer tratamento especial e confirmação de entrega',
      criadoEm: new Date('2024-06-20'),
      criadoPor: 'admin'
    }
  ];

  const veiculos = [
    { id: '1', matricula: 'ABC-1234', modelo: 'Toyota Hilux', status: 'disponivel' },
    { id: '2', matricula: 'XYZ-5678', modelo: 'Isuzu D-Max', status: 'em_rota' },
    { id: '3', matricula: 'VIP-0001', modelo: 'Mercedes Sprinter', status: 'disponivel' },
    { id: '4', matricula: 'DEF-9012', modelo: 'Ford Ranger', status: 'manutencao' }
  ];

  const motoristas = [
    { id: '1', nome: 'Carlos Santos', status: 'disponivel' },
    { id: '2', nome: 'Ana Pereira', status: 'em_rota' },
    { id: '3', nome: 'José Manuel', status: 'disponivel' },
    { id: '4', nome: 'Maria Fernandes', status: 'descanso' }
  ];

  const filteredRotas = rotas.filter(rota => {
    const matchesSearch = 
      rota.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rota.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rota.origem.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rota.destino.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rota.motoristaNome && rota.motoristaNome.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'todos' || rota.status === statusFilter;
    const matchesPrioridade = prioridadeFilter === 'todos' || rota.prioridade === prioridadeFilter;

    return matchesSearch && matchesStatus && matchesPrioridade;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredRotas, initialItemsPerPage: 10 });

  const getStatusInfo = (status: string) => {
    const statusMap = {
      planejada: { label: 'Planejada', icon: <Calendar className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
      ativa: { label: 'Ativa', icon: <PlayCircle className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
      pausada: { label: 'Pausada', icon: <PauseCircle className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
      concluida: { label: 'Concluída', icon: <CheckCircle className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
      cancelada: { label: 'Cancelada', icon: <StopCircle className="h-3 w-3" />, color: 'bg-red-100 text-red-800' }
    };
    return statusMap[status as keyof typeof statusMap] || statusMap.planejada;
  };

  const getPrioridadeInfo = (prioridade: string) => {
    const prioridadeMap = {
      baixa: { label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
      media: { label: 'Média', color: 'bg-blue-100 text-blue-800' },
      alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
      urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800' }
    };
    return prioridadeMap[prioridade as keyof typeof prioridadeMap] || prioridadeMap.media;
  };

  const handleIniciarRota = (rota: Rota) => {
    toast({
      title: "Rota iniciada",
      description: `A rota "${rota.nome}" foi iniciada`,
    });
  };

  const handlePausarRota = (rota: Rota) => {
    toast({
      title: "Rota pausada",
      description: `A rota "${rota.nome}" foi pausada`,
    });
  };

  const handleConcluirRota = (rota: Rota) => {
    toast({
      title: "Rota concluída",
      description: `A rota "${rota.nome}" foi marcada como concluída`,
    });
  };

  const handleOtimizarRotas = () => {
    toast({
      title: "Otimização iniciada",
      description: "O sistema está otimizando as rotas baseado no tráfego atual",
    });
  };

  // Estatísticas
  const estatisticas = {
    totalRotas: rotas.length,
    rotasAtivas: rotas.filter(r => r.status === 'ativa').length,
    rotasPlanejadas: rotas.filter(r => r.status === 'planejada').length,
    rotasConcluidas: rotas.filter(r => r.status === 'concluida').length,
    distanciaTotal: rotas.reduce((acc, r) => acc + r.distanciaTotal, 0),
    custoTotal: rotas.reduce((acc, r) => acc + (r.custoReal || r.custoEstimado), 0),
    combustivelTotal: rotas.reduce((acc, r) => acc + (r.combustivelReal || r.combustivelEstimado), 0),
    eficienciaMedia: rotas.filter(r => r.custoReal).reduce((acc, r) => 
      acc + ((r.custoEstimado / (r.custoReal || r.custoEstimado)) * 100), 0) / 
      Math.max(rotas.filter(r => r.custoReal).length, 1)
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Rotas</h1>
          <p className="text-muted-foreground">Planeamento e otimização de rotas de transporte</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOtimizarRotas}>
            <Settings className="h-4 w-4 mr-2" />
            Otimizar Rotas
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Rota
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Criar Nova Rota</DialogTitle>
                <DialogDescription>
                  Configure uma nova rota de transporte
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código *</Label>
                    <Input id="codigo" placeholder="RT-XXX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome da Rota *</Label>
                    <Input id="nome" placeholder="Rota Centro-Norte" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea id="descricao" placeholder="Descrição da rota..." rows={2} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="origem">Origem *</Label>
                    <Input id="origem" placeholder="Endereço de origem" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destino">Destino *</Label>
                    <Input id="destino" placeholder="Endereço de destino" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prioridade">Prioridade *</Label>
                    <Select defaultValue="media">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="veiculo">Veículo</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar veículo" />
                      </SelectTrigger>
                      <SelectContent>
                        {veiculos.filter(v => v.status === 'disponivel').map(veiculo => (
                          <SelectItem key={veiculo.id} value={veiculo.id}>
                            {veiculo.matricula} - {veiculo.modelo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="motorista">Motorista</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar motorista" />
                      </SelectTrigger>
                      <SelectContent>
                        {motoristas.filter(m => m.status === 'disponivel').map(motorista => (
                          <SelectItem key={motorista.id} value={motorista.id}>
                            {motorista.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataPlanejada">Data Planejada *</Label>
                    <Input id="dataPlanejada" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaInicio">Hora de Início</Label>
                    <Input id="horaInicio" type="time" defaultValue="08:00" />
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
                    title: "Rota criada",
                    description: "A nova rota foi criada e está pronta para planeamento",
                  });
                }}>
                  Criar Rota
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
                <p className="text-sm text-muted-foreground">Rotas Ativas</p>
                <p className="text-2xl font-bold">{estatisticas.rotasAtivas}</p>
                <p className="text-xs text-muted-foreground">de {estatisticas.totalRotas} total</p>
              </div>
              <Route className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Distância Total</p>
                <p className="text-2xl font-bold">{estatisticas.distanciaTotal.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">km hoje</p>
              </div>
              <Navigation className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Custo Total</p>
                <p className="text-2xl font-bold">MT {(estatisticas.custoTotal / 1000).toFixed(1)}K</p>
                <p className="text-xs text-muted-foreground">estimado/real</p>
              </div>
              <DollarSign className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Eficiência</p>
                <p className="text-2xl font-bold">{estatisticas.eficienciaMedia.toFixed(1)}%</p>
                <p className="text-xs text-green-600">
                  <TrendingUp className="h-3 w-3 inline mr-1" />
                  vs. meta
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de Rotas</TabsTrigger>
          <TabsTrigger value="mapa">Visualização no Mapa</TabsTrigger>
          <TabsTrigger value="otimizacao">Otimização</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por nome, código, origem, destino ou motorista..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="planejada">Planejadas</SelectItem>
                      <SelectItem value="ativa">Ativas</SelectItem>
                      <SelectItem value="pausada">Pausadas</SelectItem>
                      <SelectItem value="concluida">Concluídas</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Prioridade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      <SelectItem value="urgente">Urgente</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="baixa">Baixa</SelectItem>
                    </SelectContent>
                  </Select>

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
                    <TableHead>Nome da Rota</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Veículo/Motorista</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Distância</TableHead>
                    <TableHead>Custo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((rota) => {
                      const statusInfo = getStatusInfo(rota.status);
                      const prioridadeInfo = getPrioridadeInfo(rota.prioridade);
                      const pontosCompletos = rota.pontos.filter(p => p.concluido).length;
                      const progresso = (pontosCompletos / rota.pontos.length) * 100;
                      
                      return (
                        <TableRow key={rota.id}>
                          <TableCell className="font-medium">{rota.codigo}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{rota.nome}</div>
                              <div className="text-sm text-muted-foreground">
                                {rota.origem} → {rota.destino}
                              </div>
                            </div>
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
                              <div className="flex items-center gap-1 text-sm">
                                <Truck className="h-3 w-3" />
                                {rota.veiculoMatricula || 'Não atribuído'}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <User className="h-3 w-3" />
                                {rota.motoristaNome || 'Não atribuído'}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{pontosCompletos}/{rota.pontos.length}</span>
                                <span>{progresso.toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-green-600 h-2 rounded-full" 
                                  style={{ width: `${progresso}%` }}
                                ></div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{rota.distanciaTotal} km</div>
                              <div className="text-muted-foreground">{rota.tempoEstimado} min</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>MT {(rota.custoReal || rota.custoEstimado).toLocaleString()}</div>
                              <div className="text-muted-foreground">{rota.combustivelEstimado.toFixed(1)}L</div>
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
                                  <Link href={`/transporte/rotas/${rota.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver Detalhes
                                  </Link>
                                </DropdownMenuItem>
                                {rota.status === 'planejada' && (
                                  <DropdownMenuItem onClick={() => handleIniciarRota(rota)}>
                                    <PlayCircle className="h-4 w-4 mr-2" />
                                    Iniciar Rota
                                  </DropdownMenuItem>
                                )}
                                {rota.status === 'ativa' && (
                                  <>
                                    <DropdownMenuItem onClick={() => handlePausarRota(rota)}>
                                      <PauseCircle className="h-4 w-4 mr-2" />
                                      Pausar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConcluirRota(rota)}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Concluir
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem asChild>
                                  <Link href={`/transporte/rotas/${rota.id}/tracking`}>
                                    <Navigation className="h-4 w-4 mr-2" />
                                    Rastreamento
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/transporte/rotas/${rota.id}/editar`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <Map className="h-4 w-4 mr-2" />
                                  Ver no Mapa
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
                          <Route className="h-12 w-12 opacity-50" />
                          <p>Nenhuma rota encontrada</p>
                          <p className="text-sm">Tente ajustar os filtros ou criar uma nova rota</p>
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

        <TabsContent value="mapa">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="h-5 w-5" />
                Visualização no Mapa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Map className="h-16 w-16 mx-auto opacity-50 mb-4" />
                  <p className="text-lg font-medium">Mapa Interativo</p>
                  <p>Visualização das rotas, veículos e pontos de entrega em tempo real</p>
                  <Button className="mt-4">
                    <Zap className="h-4 w-4 mr-2" />
                    Carregar Mapa
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="otimizacao">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Otimização de Rotas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <Target className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                          <h4 className="font-medium">Economia Projetada</h4>
                          <p className="text-2xl font-bold text-green-600">18.5%</p>
                          <p className="text-sm text-muted-foreground">em combustível</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <Clock className="h-8 w-8 mx-auto text-orange-600 mb-2" />
                          <h4 className="font-medium">Tempo Reduzido</h4>
                          <p className="text-2xl font-bold text-blue-600">42 min</p>
                          <p className="text-sm text-muted-foreground">por rota</p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <TrendingUp className="h-8 w-8 mx-auto text-green-600 mb-2" />
                          <h4 className="font-medium">Eficiência</h4>
                          <p className="text-2xl font-bold text-purple-600">+23%</p>
                          <p className="text-sm text-muted-foreground">melhoria</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Sugestões de Otimização</h4>
                    
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                        <Target className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <h5 className="font-medium text-blue-900">Reagrupamento de Entregas</h5>
                          <p className="text-sm text-blue-700">
                            Combine 3 entregas na zona norte numa única rota para economizar 25 km.
                          </p>
                        </div>
                        <Button size="sm" variant="outline">
                          Aplicar
                        </Button>
                      </div>
                      
                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <Clock className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <h5 className="font-medium text-green-900">Horário Otimizado</h5>
                          <p className="text-sm text-green-700">
                            Altere o horário de saída para 07:30 para evitar trânsito intenso.
                          </p>
                        </div>
                        <Button size="sm" variant="outline">
                          Aplicar
                        </Button>
                      </div>
                      
                      <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                        <Fuel className="h-5 w-5 text-yellow-600 mt-0.5" />
                        <div>
                          <h5 className="font-medium text-yellow-900">Posto de Combustível</h5>
                          <p className="text-sm text-yellow-700">
                            Inclua parada no Posto Shell - 5% desconto para empresas.
                          </p>
                        </div>
                        <Button size="sm" variant="outline">
                          Aplicar
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleOtimizarRotas}>
                        <Settings className="h-4 w-4 mr-2" />
                        Aplicar Todas as Otimizações
                      </Button>
                      <Button variant="outline">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Recalcular
                      </Button>
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