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
  Package,
  Truck,
  User,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Phone,
  Mail,
  Navigation,
  Camera,
  FileSignature,
  Star,
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar as CalendarIcon,
  Filter,
  Download,
  RefreshCw,
  QrCode,
  Scan,
  Route,
  Timer,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Bell,
  Send,
  CheckSquare,
  Building,
  Home,
  Zap
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Entrega {
  id: string;
  codigo: string;
  pedidoId?: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone?: string;
  clienteEmail?: string;
  enderecoEntrega: EnderecoEntrega;
  produtos: ProdutoEntrega[];
  status: 'pendente' | 'agendada' | 'em_transito' | 'entregue' | 'falhada' | 'cancelada';
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  dataAgendada: Date;
  horaAgendada?: string;
  dataEntrega?: Date;
  tentativas: number;
  maxTentativas: number;
  motoristaId?: string;
  motoristaNome?: string;
  veiculoId?: string;
  veiculoMatricula?: string;
  rotaId?: string;
  rotaCodigo?: string;
  valorTotal: number;
  peso?: number;
  volume?: number;
  observacoes?: string;
  instrucoesEspeciais?: string;
  provaEntrega?: ProvaEntrega;
  avaliacaoCliente?: AvaliacaoEntrega;
  custoEntrega: number;
  tempoEstimado: number;
  tempoReal?: number;
  distancia?: number;
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
}

interface EnderecoEntrega {
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  provincia: string;
  codigoPostal?: string;
  coordenadas?: {
    latitude: number;
    longitude: number;
  };
  pontosReferencia?: string;
}

interface ProdutoEntrega {
  id: string;
  nome: string;
  codigo: string;
  quantidade: number;
  peso?: number;
  volume?: number;
  valor: number;
  fragil: boolean;
  perecivel: boolean;
  temperatura?: string;
}

interface ProvaEntrega {
  dataEntrega: Date;
  horaEntrega: string;
  recebidoPor: string;
  documentoRecebedor?: string;
  assinatura?: string;
  foto?: string;
  coordenadas?: {
    latitude: number;
    longitude: number;
  };
  observacoes?: string;
}

interface AvaliacaoEntrega {
  nota: number;
  comentario?: string;
  aspectos: {
    pontualidade: number;
    atendimento: number;
    condicaoProduto: number;
  };
  dataAvaliacao: Date;
}

export default function EntregasPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos');
  const [dataFilter, setDataFilter] = useState<Date>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('lista');

  // Dados de exemplo
  const entregas: Entrega[] = [
    {
      id: '1',
      codigo: 'ENT-001',
      pedidoId: 'PED-001',
      clienteId: '1',
      clienteNome: 'João Silva',
      clienteTelefone: '+258 84 123 4567',
      clienteEmail: 'joao.silva@email.com',
      enderecoEntrega: {
        rua: 'Av. Julius Nyerere',
        numero: '1234',
        complemento: 'Apt 5B',
        bairro: 'Polana',
        cidade: 'Maputo',
        provincia: 'Maputo',
        codigoPostal: '1100',
        coordenadas: {
          latitude: -25.9692,
          longitude: 32.5732
        },
        pontosReferencia: 'Próximo ao Hotel Polana'
      },
      produtos: [
        {
          id: '1',
          nome: 'Computador Portátil',
          codigo: 'COMP-001',
          quantidade: 1,
          peso: 2.5,
          volume: 0.02,
          valor: 45000,
          fragil: true,
          perecivel: false
        },
        {
          id: '2',
          nome: 'Mouse Wireless',
          codigo: 'MOUS-001',
          quantidade: 1,
          peso: 0.1,
          volume: 0.001,
          valor: 850,
          fragil: false,
          perecivel: false
        }
      ],
      status: 'entregue',
      prioridade: 'alta',
      dataAgendada: new Date('2024-06-20'),
      horaAgendada: '14:00',
      dataEntrega: new Date('2024-06-20T14:30:00'),
      tentativas: 1,
      maxTentativas: 3,
      motoristaId: '1',
      motoristaNome: 'Carlos Santos',
      veiculoId: '1',
      veiculoMatricula: 'ABC-1234',
      rotaId: '1',
      rotaCodigo: 'RT-001',
      valorTotal: 45850,
      peso: 2.6,
      volume: 0.021,
      observacoes: 'Cliente solicitou entrega pela manhã',
      instrucoesEspeciais: 'Produto frágil - manuseio cuidadoso',
      provaEntrega: {
        dataEntrega: new Date('2024-06-20T14:30:00'),
        horaEntrega: '14:30',
        recebidoPor: 'João Silva',
        documentoRecebedor: 'BI 123456789',
        assinatura: 'data:image/base64,...',
        foto: 'data:image/base64,...',
        coordenadas: {
          latitude: -25.9692,
          longitude: 32.5732
        },
        observacoes: 'Entrega realizada com sucesso'
      },
      avaliacaoCliente: {
        nota: 5,
        comentario: 'Excelente serviço, muito pontual!',
        aspectos: {
          pontualidade: 5,
          atendimento: 5,
          condicaoProduto: 5
        },
        dataAvaliacao: new Date('2024-06-20T15:00:00')
      },
      custoEntrega: 250,
      tempoEstimado: 30,
      tempoReal: 25,
      distancia: 12.5,
      criadoEm: new Date('2024-06-19'),
      criadoPor: 'admin',
      atualizadoEm: new Date('2024-06-20T14:30:00')
    },
    {
      id: '2',
      codigo: 'ENT-002',
      pedidoId: 'PED-002',
      clienteId: '2',
      clienteNome: 'Maria Costa',
      clienteTelefone: '+258 82 987 6543',
      clienteEmail: 'maria.costa@email.com',
      enderecoEntrega: {
        rua: 'Rua da Resistência',
        numero: '567',
        bairro: 'Maxaquene',
        cidade: 'Maputo',
        provincia: 'Maputo',
        pontosReferencia: 'Casa azul com portão branco'
      },
      produtos: [
        {
          id: '3',
          nome: 'Medicamentos',
          codigo: 'MED-001',
          quantidade: 3,
          peso: 0.5,
          volume: 0.002,
          valor: 1250,
          fragil: false,
          perecivel: true,
          temperatura: '2-8°C'
        }
      ],
      status: 'em_transito',
      prioridade: 'urgente',
      dataAgendada: new Date('2024-06-20'),
      horaAgendada: '15:00',
      tentativas: 0,
      maxTentativas: 2,
      motoristaId: '2',
      motoristaNome: 'Ana Pereira',
      veiculoId: '2',
      veiculoMatricula: 'XYZ-5678',
      rotaId: '1',
      rotaCodigo: 'RT-001',
      valorTotal: 1250,
      peso: 0.5,
      volume: 0.002,
      instrucoesEspeciais: 'Medicamentos refrigerados - manter temperatura',
      custoEntrega: 180,
      tempoEstimado: 25,
      distancia: 8.3,
      criadoEm: new Date('2024-06-20'),
      criadoPor: 'admin'
    },
    {
      id: '3',
      codigo: 'ENT-003',
      pedidoId: 'PED-003',
      clienteId: '3',
      clienteNome: 'Empresa ABC Lda',
      clienteTelefone: '+258 21 123 456',
      clienteEmail: 'compras@empresaabc.co.mz',
      enderecoEntrega: {
        rua: 'Av. 25 de Setembro',
        numero: '890',
        complemento: 'Edifício Comercial, 3º andar',
        bairro: 'Baixa',
        cidade: 'Maputo',
        provincia: 'Maputo',
        pontosReferencia: 'Próximo ao Banco BCI'
      },
      produtos: [
        {
          id: '4',
          nome: 'Material de Escritório',
          codigo: 'ESC-001',
          quantidade: 50,
          peso: 25.0,
          volume: 0.5,
          valor: 8500,
          fragil: false,
          perecivel: false
        }
      ],
      status: 'agendada',
      prioridade: 'media',
      dataAgendada: new Date('2024-06-21'),
      horaAgendada: '09:00',
      tentativas: 0,
      maxTentativas: 3,
      valorTotal: 8500,
      peso: 25.0,
      volume: 0.5,
      observacoes: 'Entrega para departamento de compras',
      custoEntrega: 350,
      tempoEstimado: 45,
      distancia: 15.2,
      criadoEm: new Date('2024-06-20'),
      criadoPor: 'admin'
    },
    {
      id: '4',
      codigo: 'ENT-004',
      clienteId: '4',
      clienteNome: 'Sofia Nunes',
      clienteTelefone: '+258 87 555 1234',
      enderecoEntrega: {
        rua: 'Av. Vladimir Lenine',
        numero: '200',
        bairro: 'Sommerschield',
        cidade: 'Maputo',
        provincia: 'Maputo',
        pontosReferencia: 'Condomínio fechado, portaria'
      },
      produtos: [
        {
          id: '5',
          nome: 'Livros Técnicos',
          codigo: 'LIV-001',
          quantidade: 5,
          peso: 3.5,
          volume: 0.05,
          valor: 2750,
          fragil: false,
          perecivel: false
        }
      ],
      status: 'falhada',
      prioridade: 'baixa',
      dataAgendada: new Date('2024-06-19'),
      horaAgendada: '16:00',
      tentativas: 2,
      maxTentativas: 3,
      valorTotal: 2750,
      peso: 3.5,
      volume: 0.05,
      observacoes: 'Cliente não estava presente - segunda tentativa',
      custoEntrega: 200,
      tempoEstimado: 20,
      distancia: 7.8,
      criadoEm: new Date('2024-06-19'),
      criadoPor: 'admin'
    }
  ];

  const motoristas = [
    { id: '1', nome: 'Carlos Santos', status: 'disponivel' },
    { id: '2', nome: 'Ana Pereira', status: 'em_rota' },
    { id: '3', nome: 'José Manuel', status: 'disponivel' },
    { id: '4', nome: 'Maria Fernandes', status: 'descanso' }
  ];

  const veiculos = [
    { id: '1', matricula: 'ABC-1234', modelo: 'Toyota Hilux', status: 'disponivel' },
    { id: '2', matricula: 'XYZ-5678', modelo: 'Isuzu D-Max', status: 'em_rota' },
    { id: '3', matricula: 'VIP-0001', modelo: 'Mercedes Sprinter', status: 'disponivel' }
  ];

  const filteredEntregas = entregas.filter(entrega => {
    const matchesSearch = 
      entrega.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entrega.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entrega.enderecoEntrega.rua.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (entrega.motoristaNome && entrega.motoristaNome.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'todos' || entrega.status === statusFilter;
    const matchesPrioridade = prioridadeFilter === 'todos' || entrega.prioridade === prioridadeFilter;
    const matchesData = !dataFilter || 
      entrega.dataAgendada.toDateString() === dataFilter.toDateString();

    return matchesSearch && matchesStatus && matchesPrioridade && matchesData;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredEntregas, initialItemsPerPage: 10 });

  const getStatusInfo = (status: string) => {
    const statusMap = {
      pendente: { label: 'Pendente', icon: <Clock className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' },
      agendada: { label: 'Agendada', icon: <CalendarIcon className="h-3 w-3" />, color: 'bg-blue-100 text-blue-800' },
      em_transito: { label: 'Em Trânsito', icon: <Truck className="h-3 w-3" />, color: 'bg-yellow-100 text-yellow-800' },
      entregue: { label: 'Entregue', icon: <CheckCircle className="h-3 w-3" />, color: 'bg-green-100 text-green-800' },
      falhada: { label: 'Falhada', icon: <XCircle className="h-3 w-3" />, color: 'bg-red-100 text-red-800' },
      cancelada: { label: 'Cancelada', icon: <XCircle className="h-3 w-3" />, color: 'bg-gray-100 text-gray-800' }
    };
    return statusMap[status as keyof typeof statusMap] || statusMap.pendente;
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

  const handleMarcarEntregue = (entrega: Entrega) => {
    toast({
      title: "Entrega confirmada",
      description: `A entrega ${entrega.codigo} foi marcada como entregue`,
    });
  };

  const handleReagendarEntrega = (entrega: Entrega) => {
    toast({
      title: "Entrega reagendada",
      description: `A entrega ${entrega.codigo} foi reagendada`,
    });
  };

  const handleEnviarNotificacao = (entrega: Entrega) => {
    toast({
      title: "Notificação enviada",
      description: `Notificação de status enviada para ${entrega.clienteNome}`,
    });
  };

  // Estatísticas
  const estatisticas = {
    totalEntregas: entregas.length,
    entregasHoje: entregas.filter(e => 
      e.dataAgendada.toDateString() === new Date().toDateString()
    ).length,
    entregasEntregues: entregas.filter(e => e.status === 'entregue').length,
    entregasEmTransito: entregas.filter(e => e.status === 'em_transito').length,
    entregasPendentes: entregas.filter(e => e.status === 'pendente').length,
    entregasFalhadas: entregas.filter(e => e.status === 'falhada').length,
    taxaSucesso: (entregas.filter(e => e.status === 'entregue').length / entregas.length) * 100,
    tempoMedioEntrega: entregas.filter(e => e.tempoReal).reduce((acc, e) => acc + (e.tempoReal || 0), 0) / 
      Math.max(entregas.filter(e => e.tempoReal).length, 1),
    custoMedioEntrega: entregas.reduce((acc, e) => acc + e.custoEntrega, 0) / entregas.length,
    avaliacaoMedia: entregas.filter(e => e.avaliacaoCliente).reduce((acc, e) => acc + (e.avaliacaoCliente?.nota || 0), 0) / 
      Math.max(entregas.filter(e => e.avaliacaoCliente).length, 1)
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Entregas</h1>
          <p className="text-muted-foreground">Controle e acompanhamento de entregas em tempo real</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Entrega
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Criar Nova Entrega</DialogTitle>
                <DialogDescription>
                  Configure uma nova entrega para agendamento
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código *</Label>
                    <Input id="codigo" placeholder="ENT-XXX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pedido">Pedido</Label>
                    <Input id="pedido" placeholder="PED-XXX" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Informações do Cliente</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="clienteNome">Nome do Cliente *</Label>
                      <Input id="clienteNome" placeholder="Nome completo" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clienteTelefone">Telefone *</Label>
                      <Input id="clienteTelefone" placeholder="+258 XX XXX XXXX" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clienteEmail">Email</Label>
                    <Input id="clienteEmail" type="email" placeholder="cliente@email.com" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Endereço de Entrega</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="rua">Rua *</Label>
                      <Input id="rua" placeholder="Nome da rua" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numero">Número *</Label>
                      <Input id="numero" placeholder="123" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bairro">Bairro *</Label>
                      <Input id="bairro" placeholder="Nome do bairro" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cidade">Cidade *</Label>
                      <Select defaultValue="maputo">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="maputo">Maputo</SelectItem>
                          <SelectItem value="matola">Matola</SelectItem>
                          <SelectItem value="beira">Beira</SelectItem>
                          <SelectItem value="nampula">Nampula</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pontosReferencia">Pontos de Referência</Label>
                    <Textarea id="pontosReferencia" placeholder="Descrição de pontos de referência..." rows={2} />
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
                    <Label htmlFor="dataAgendada">Data Agendada *</Label>
                    <Input id="dataAgendada" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaAgendada">Hora Agendada</Label>
                    <Input id="horaAgendada" type="time" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valorTotal">Valor Total (MT) *</Label>
                    <Input id="valorTotal" type="number" placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custoEntrega">Custo de Entrega (MT)</Label>
                    <Input id="custoEntrega" type="number" placeholder="0.00" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea id="observacoes" placeholder="Instruções especiais, observações..." rows={3} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  setIsDialogOpen(false);
                  toast({
                    title: "Entrega criada",
                    description: "A nova entrega foi criada e está pendente de atribuição",
                  });
                }}>
                  Criar Entrega
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
                <p className="text-sm text-muted-foreground">Entregas Hoje</p>
                <p className="text-2xl font-bold">{estatisticas.entregasHoje}</p>
                <p className="text-xs text-muted-foreground">de {estatisticas.totalEntregas} total</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Sucesso</p>
                <p className="text-2xl font-bold">{estatisticas.taxaSucesso.toFixed(1)}%</p>
                <p className="text-xs text-green-600">
                  <TrendingUp className="h-3 w-3 inline mr-1" />
                  vs. mês anterior
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">{estatisticas.tempoMedioEntrega.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">minutos</p>
              </div>
              <Timer className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avaliação Média</p>
                <p className="text-2xl font-bold">{estatisticas.avaliacaoMedia.toFixed(1)}</p>
                <div className="flex items-center text-xs text-yellow-600">
                  <Star className="h-3 w-3 fill-current mr-1" />
                  de 5 estrelas
                </div>
              </div>
              <Star className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lista">Lista de Entregas</TabsTrigger>
          <TabsTrigger value="mapa">Rastreamento</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por código, cliente, endereço ou motorista..."
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
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="agendada">Agendadas</SelectItem>
                      <SelectItem value="em_transito">Em Trânsito</SelectItem>
                      <SelectItem value="entregue">Entregues</SelectItem>
                      <SelectItem value="falhada">Falhadas</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
                    <SelectTrigger className="w-[120px]">
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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Agendamento</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((entrega) => {
                      const statusInfo = getStatusInfo(entrega.status);
                      const prioridadeInfo = getPrioridadeInfo(entrega.prioridade);
                      
                      return (
                        <TableRow key={entrega.id}>
                          <TableCell className="font-medium">{entrega.codigo}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{entrega.clienteNome}</div>
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {entrega.clienteTelefone}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">{entrega.enderecoEntrega.rua}, {entrega.enderecoEntrega.numero}</div>
                              <div className="text-xs text-muted-foreground">{entrega.enderecoEntrega.bairro}, {entrega.enderecoEntrega.cidade}</div>
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
                              <div className="text-sm">{format(entrega.dataAgendada, 'dd/MM/yyyy', { locale: pt })}</div>
                              <div className="text-xs text-muted-foreground">{entrega.horaAgendada || '--:--'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="text-sm">{entrega.motoristaNome || 'Não atribuído'}</div>
                              <div className="text-xs text-muted-foreground">{entrega.veiculoMatricula || '--'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">MT {entrega.valorTotal.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">Frete: MT {entrega.custoEntrega}</div>
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
                                  <Link href={`/transporte/entregas/${entrega.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver Detalhes
                                  </Link>
                                </DropdownMenuItem>
                                {entrega.status === 'em_transito' && (
                                  <DropdownMenuItem onClick={() => handleMarcarEntregue(entrega)}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Marcar Entregue
                                  </DropdownMenuItem>
                                )}
                                {(entrega.status === 'pendente' || entrega.status === 'agendada') && (
                                  <DropdownMenuItem onClick={() => handleReagendarEntrega(entrega)}>
                                    <CalendarIcon className="h-4 w-4 mr-2" />
                                    Reagendar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleEnviarNotificacao(entrega)}>
                                  <Send className="h-4 w-4 mr-2" />
                                  Notificar Cliente
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/transporte/entregas/${entrega.id}/tracking`}>
                                    <Navigation className="h-4 w-4 mr-2" />
                                    Rastrear
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/transporte/entregas/${entrega.id}/editar`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <QrCode className="h-4 w-4 mr-2" />
                                  Gerar QR Code
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
                          <Package className="h-12 w-12 opacity-50" />
                          <p>Nenhuma entrega encontrada</p>
                          <p className="text-sm">Tente ajustar os filtros ou criar uma nova entrega</p>
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
                <Navigation className="h-5 w-5" />
                Rastreamento em Tempo Real
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Navigation className="h-16 w-16 mx-auto opacity-50 mb-4" />
                  <p className="text-lg font-medium">Mapa de Rastreamento</p>
                  <p>Visualização em tempo real das entregas em andamento</p>
                  <div className="grid grid-cols-2 gap-4 mt-6 max-w-md">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{estatisticas.entregasEmTransito}</div>
                      <div className="text-sm">Em Trânsito</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{estatisticas.entregasHoje}</div>
                      <div className="text-sm">Hoje</div>
                    </div>
                  </div>
                  <Button className="mt-4">
                    <Zap className="h-4 w-4 mr-2" />
                    Carregar Mapa
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <CheckSquare className="h-8 w-8 mx-auto text-green-600 mb-2" />
                    <h4 className="font-medium">Entregas Concluídas</h4>
                    <p className="text-2xl font-bold text-green-600">{estatisticas.entregasEntregues}</p>
                    <p className="text-sm text-muted-foreground">
                      {((estatisticas.entregasEntregues / estatisticas.totalEntregas) * 100).toFixed(1)}% do total
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <XCircle className="h-8 w-8 mx-auto text-red-600 mb-2" />
                    <h4 className="font-medium">Entregas Falhadas</h4>
                    <p className="text-2xl font-bold text-red-600">{estatisticas.entregasFalhadas}</p>
                    <p className="text-sm text-muted-foreground">
                      {((estatisticas.entregasFalhadas / estatisticas.totalEntregas) * 100).toFixed(1)}% do total
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Activity className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                    <h4 className="font-medium">Custo Médio</h4>
                    <p className="text-2xl font-bold text-blue-600">MT {estatisticas.custoMedioEntrega.toFixed(0)}</p>
                    <p className="text-sm text-muted-foreground">por entrega</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Performance por Período</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-3">Entregas por Status</h4>
                      <div className="space-y-2">
                        {[
                          { status: 'Entregues', valor: estatisticas.entregasEntregues, cor: 'bg-green-500' },
                          { status: 'Em Trânsito', valor: estatisticas.entregasEmTransito, cor: 'bg-yellow-500' },
                          { status: 'Pendentes', valor: estatisticas.entregasPendentes, cor: 'bg-blue-500' },
                          { status: 'Falhadas', valor: estatisticas.entregasFalhadas, cor: 'bg-red-500' }
                        ].map((item, index) => {
                          const percentual = (item.valor / estatisticas.totalEntregas) * 100;
                          return (
                            <div key={index} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${item.cor}`}></div>
                                <span className="text-sm">{item.status}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.valor}</span>
                                <span className="text-sm text-muted-foreground">({percentual.toFixed(1)}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-3">Métricas de Qualidade</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Taxa de Sucesso</span>
                          <span className="font-medium text-green-600">{estatisticas.taxaSucesso.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Tempo Médio de Entrega</span>
                          <span className="font-medium">{estatisticas.tempoMedioEntrega.toFixed(0)} min</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Avaliação Média</span>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{estatisticas.avaliacaoMedia.toFixed(1)}</span>
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Custo Médio</span>
                          <span className="font-medium">MT {estatisticas.custoMedioEntrega.toFixed(0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">Recomendações</h4>
                    <div className="grid gap-3">
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <h5 className="font-medium text-blue-900">Otimizar Rotas</h5>
                          <p className="text-sm text-blue-700">
                            Agrupe entregas próximas para reduzir tempo e custos em 15%.
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                        <Bell className="h-5 w-5 text-green-600 mt-0.5" />
                        <div>
                          <h5 className="font-medium text-green-900">Notificações Proativas</h5>
                          <p className="text-sm text-green-700">
                            Envie SMS automáticos para reduzir entregas falhadas em 25%.
                          </p>
                        </div>
                      </div>
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