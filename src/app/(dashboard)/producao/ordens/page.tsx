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
import { Progress } from '@/components/ui/progress';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Play,
  Pause,
  Square,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Package,
  Factory,
  User,
  Calendar,
  BarChart3,
  TrendingUp,
  Target,
  Timer,
  FileText,
  Printer,
  QrCode,
  ArrowUp,
  ArrowDown,
  Filter,
  Download,
  RefreshCw,
  Settings
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface MaterialNecessario {
  id: string;
  codigo: string;
  nome: string;
  quantidadeNecessaria: number;
  quantidadeReservada: number;
  quantidadeConsumida: number;
  unidadeMedida: string;
  custo: number;
  disponivel: boolean;
}

interface OperacaoOrdem {
  id: string;
  sequencia: number;
  nome: string;
  centroTrabalho: string;
  maquina?: string;
  operador?: string;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'pausada' | 'cancelada';
  tempoEstimado: number;
  tempoRealizado: number;
  dataInicio?: string;
  dataFim?: string;
  observacoes?: string;
  qualidadeAprovada: boolean;
}

interface OrdemProducao {
  id: string;
  numero: string;
  produto: string;
  codigoProduto: string;
  quantidade: number;
  unidadeMedida: string;
  status: 'planejada' | 'liberada' | 'em_producao' | 'concluida' | 'cancelada' | 'pausada';
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  dataPrevisaoInicio: string;
  dataPrevisaoFim: string;
  dataInicioReal?: string;
  dataFimReal?: string;
  roteiro: string;
  lote?: string;
  numeroSerie?: string;
  responsavel: string;
  observacoes?: string;
  materiaisNecessarios: MaterialNecessario[];
  operacoes: OperacaoOrdem[];
  custoEstimado: number;
  custoRealizado: number;
  progresso: number; // %
  eficiencia: number; // %
  qualidadeAprovada: boolean;
  pedidoVenda?: string;
  cliente?: string;
  criadoEm: string;
  criadoPor: string;
}

export default function OrdensPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('todos');
  const [selectedOrdem, setSelectedOrdem] = useState<OrdemProducao | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Mock data
  const ordens: OrdemProducao[] = [
    {
      id: '1',
      numero: 'OP-2024-001',
      produto: 'Bolo de Chocolate Premium',
      codigoProduto: 'PROD-001',
      quantidade: 50,
      unidadeMedida: 'unidades',
      status: 'em_producao',
      prioridade: 'alta',
      dataPrevisaoInicio: '2024-10-20',
      dataPrevisaoFim: '2024-10-21',
      dataInicioReal: '2024-10-20',
      roteiro: 'ROT-001',
      lote: 'LOTE-2024-10-001',
      responsavel: 'Maria Santos',
      pedidoVenda: 'PV-2024-125',
      cliente: 'Padaria Central',
      custoEstimado: 6275.00,
      custoRealizado: 4850.00,
      progresso: 65,
      eficiencia: 88,
      qualidadeAprovada: false,
      criadoEm: '2024-10-19',
      criadoPor: 'admin',
      materiaisNecessarios: [
        {
          id: 'mat-1',
          codigo: 'MAT-001',
          nome: 'Farinha de Trigo',
          quantidadeNecessaria: 125,
          quantidadeReservada: 125,
          quantidadeConsumida: 80,
          unidadeMedida: 'kg',
          custo: 1250.00,
          disponivel: true
        },
        {
          id: 'mat-2',
          codigo: 'MAT-002',
          nome: 'Ovos Frescos',
          quantidadeNecessaria: 600,
          quantidadeReservada: 600,
          quantidadeConsumida: 390,
          unidadeMedida: 'unidades',
          custo: 1500.00,
          disponivel: true
        }
      ],
      operacoes: [
        {
          id: 'op-1',
          sequencia: 1,
          nome: 'Preparação de Ingredientes',
          centroTrabalho: 'Bancada Prep',
          operador: 'João Silva',
          status: 'concluida',
          tempoEstimado: 30,
          tempoRealizado: 28,
          dataInicio: '2024-10-20T08:00:00',
          dataFim: '2024-10-20T08:28:00',
          qualidadeAprovada: true
        },
        {
          id: 'op-2',
          sequencia: 2,
          nome: 'Mistura da Massa',
          centroTrabalho: 'Misturador Industrial',
          maquina: 'MIX-001',
          operador: 'Maria Costa',
          status: 'em_andamento',
          tempoEstimado: 60,
          tempoRealizado: 35,
          dataInicio: '2024-10-20T08:30:00',
          qualidadeAprovada: false
        },
        {
          id: 'op-3',
          sequencia: 3,
          nome: 'Cozimento',
          centroTrabalho: 'Forno Industrial',
          status: 'pendente',
          tempoEstimado: 120,
          tempoRealizado: 0,
          qualidadeAprovada: false
        }
      ]
    },
    {
      id: '2',
      numero: 'OP-2024-002',
      produto: 'Mesa de Escritório Executive',
      codigoProduto: 'PROD-002',
      quantidade: 10,
      unidadeMedida: 'unidades',
      status: 'planejada',
      prioridade: 'media',
      dataPrevisaoInicio: '2024-10-22',
      dataPrevisaoFim: '2024-10-25',
      roteiro: 'ROT-002',
      responsavel: 'Carlos Pereira',
      pedidoVenda: 'PV-2024-126',
      cliente: 'Empresa ABC Lda',
      custoEstimado: 28500.00,
      custoRealizado: 0,
      progresso: 0,
      eficiencia: 0,
      qualidadeAprovada: false,
      criadoEm: '2024-10-19',
      criadoPor: 'admin',
      materiaisNecessarios: [],
      operacoes: []
    }
  ];

  const filteredOrdens = ordens.filter(ordem => {
    const matchesSearch = ordem.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ordem.produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ordem.codigoProduto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || ordem.status === statusFilter;
    const matchesPrioridade = prioridadeFilter === 'todos' || ordem.prioridade === prioridadeFilter;
    
    return matchesSearch && matchesStatus && matchesPrioridade;
  });

  const { currentPage, totalPages, itemsPerPage, totalItems, paginatedData, handlePageChange, handleItemsPerPageChange } = 
    usePagination({ data: filteredOrdens, initialItemsPerPage: 10 });

  const getStatusBadge = (status: string) => {
    const variants = {
      planejada: 'secondary',
      liberada: 'outline',
      em_producao: 'default',
      concluida: 'default',
      cancelada: 'destructive',
      pausada: 'secondary'
    } as const;
    
    const colors = {
      planejada: 'bg-gray-100 text-gray-800',
      liberada: 'bg-blue-100 text-blue-800',
      em_producao: 'bg-green-100 text-green-800',
      concluida: 'bg-emerald-100 text-emerald-800',
      cancelada: 'bg-red-100 text-red-800',
      pausada: 'bg-yellow-100 text-yellow-800'
    };
    
    return (
      <Badge className={colors[status as keyof typeof colors]}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const colors = {
      baixa: 'bg-gray-100 text-gray-800',
      media: 'bg-yellow-100 text-yellow-800',
      alta: 'bg-orange-100 text-orange-800',
      urgente: 'bg-red-100 text-red-800'
    };
    
    return (
      <Badge className={colors[prioridade as keyof typeof colors]}>
        {prioridade}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planejada': return <Clock className="h-4 w-4 text-gray-500" />;
      case 'liberada': return <ArrowUp className="h-4 w-4 text-blue-500" />;
      case 'em_producao': return <Play className="h-4 w-4 text-green-500" />;
      case 'concluida': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'cancelada': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pausada': return <Pause className="h-4 w-4 text-yellow-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const calcularProgresso = (operacoes: OperacaoOrdem[]): number => {
    if (operacoes.length === 0) return 0;
    const concluidas = operacoes.filter(op => op.status === 'concluida').length;
    return Math.round((concluidas / operacoes.length) * 100);
  };

  const podeIniciar = (ordem: OrdemProducao): boolean => {
    return ordem.status === 'liberada' && 
           ordem.materiaisNecessarios.every(mat => mat.disponivel);
  };

  const podePausar = (ordem: OrdemProducao): boolean => {
    return ordem.status === 'em_producao';
  };

  const podeConcluir = (ordem: OrdemProducao): boolean => {
    return ordem.status === 'em_producao' && 
           ordem.progresso === 100 &&
           ordem.qualidadeAprovada;
  };

  const handleStatusChange = (ordemId: string, novoStatus: string) => {
    toast({
      title: "Status atualizado",
      description: `Ordem ${ordemId} alterada para ${novoStatus}`,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Ordens de Produção</h1>
          <p className="text-muted-foreground">Gestão e controlo das ordens de fabrico</p>
        </div>
        <Button asChild>
          <Link href="/producao/ordens/nova">
            <Plus className="mr-2 h-4 w-4" />
            Nova Ordem
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList>
          <TabsTrigger value="lista">Lista de Ordens</TabsTrigger>
          <TabsTrigger value="kanban">Quadro Kanban</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5" />
                Ordens de Produção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por número, produto ou código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Status</SelectItem>
                    <SelectItem value="planejada">Planejada</SelectItem>
                    <SelectItem value="liberada">Liberada</SelectItem>
                    <SelectItem value="em_producao">Em Produção</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="pausada">Pausada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
                  <SelectTrigger className="w-[150px]">
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
                      <TableHead>Ordem</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead>Previsão Início</TableHead>
                      <TableHead>Previsão Fim</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((ordem) => (
                      <TableRow key={ordem.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(ordem.status)}
                            <div>
                              <div className="font-medium">{ordem.numero}</div>
                              {ordem.lote && (
                                <div className="text-sm text-gray-500">Lote: {ordem.lote}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{ordem.produto}</div>
                            <div className="text-sm text-gray-500">{ordem.codigoProduto}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {ordem.quantidade} {ordem.unidadeMedida}
                        </TableCell>
                        <TableCell>{getStatusBadge(ordem.status)}</TableCell>
                        <TableCell>{getPrioridadeBadge(ordem.prioridade)}</TableCell>
                        <TableCell>
                          <div className="w-16">
                            <Progress value={ordem.progresso} className="h-2" />
                            <span className="text-xs text-gray-500">{ordem.progresso}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(ordem.dataPrevisaoInicio), 'dd/MM/yyyy', { locale: pt })}
                        </TableCell>
                        <TableCell>
                          {format(new Date(ordem.dataPrevisaoFim), 'dd/MM/yyyy', { locale: pt })}
                        </TableCell>
                        <TableCell>{ordem.responsavel}</TableCell>
                        <TableCell>{ordem.cliente || '-'}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => {
                                setSelectedOrdem(ordem);
                                setIsDialogOpen(true);
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {podeIniciar(ordem) && (
                                <DropdownMenuItem onClick={() => handleStatusChange(ordem.numero, 'em_producao')}>
                                  <Play className="mr-2 h-4 w-4 text-green-600" />
                                  Iniciar Produção
                                </DropdownMenuItem>
                              )}
                              {podePausar(ordem) && (
                                <DropdownMenuItem onClick={() => handleStatusChange(ordem.numero, 'pausada')}>
                                  <Pause className="mr-2 h-4 w-4 text-yellow-600" />
                                  Pausar
                                </DropdownMenuItem>
                              )}
                              {podeConcluir(ordem) && (
                                <DropdownMenuItem onClick={() => handleStatusChange(ordem.numero, 'concluida')}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                  Concluir
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Printer className="mr-2 h-4 w-4" />
                                Imprimir Ficha
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <QrCode className="mr-2 h-4 w-4" />
                                Gerar QR Code
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                Relatório
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

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

        <TabsContent value="kanban" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {['planejada', 'liberada', 'em_producao', 'concluida', 'pausada', 'cancelada'].map(status => (
              <Card key={status} className="h-96">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {getStatusIcon(status)}
                    {status.replace('_', ' ').toUpperCase()}
                  </CardTitle>
                  <Badge variant="secondary" className="w-fit">
                    {ordens.filter(o => o.status === status).length}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 overflow-y-auto">
                  {ordens
                    .filter(ordem => ordem.status === status)
                    .map(ordem => (
                      <div key={ordem.id} 
                           className="p-3 border rounded-lg bg-white hover:shadow-md transition-shadow cursor-pointer">
                        <div className="font-medium text-sm">{ordem.numero}</div>
                        <div className="text-xs text-gray-600 truncate">{ordem.produto}</div>
                        <div className="text-xs text-gray-500">
                          {ordem.quantidade} {ordem.unidadeMedida}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          {getPrioridadeBadge(ordem.prioridade)}
                          <div className="text-xs text-gray-500">
                            {ordem.progresso}%
                          </div>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Total Ordens</p>
                    <p className="text-2xl font-bold">2</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Em Produção</p>
                    <p className="text-2xl font-bold">1</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Eficiência Média</p>
                    <p className="text-2xl font-bold">88%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium">Concluídas Hoje</p>
                    <p className="text-2xl font-bold">0</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Detalhes da Ordem de Produção
            </DialogTitle>
            <DialogDescription>
              Informações completas da ordem e progresso das operações
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrdem && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium">Número</Label>
                  <p className="text-sm">{selectedOrdem.numero}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Produto</Label>
                  <p className="text-sm">{selectedOrdem.produto}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Quantidade</Label>
                  <p className="text-sm">{selectedOrdem.quantidade} {selectedOrdem.unidadeMedida}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedOrdem.status)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Prioridade</Label>
                  <div className="mt-1">
                    {getPrioridadeBadge(selectedOrdem.prioridade)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Progresso</Label>
                  <div className="mt-1">
                    <Progress value={selectedOrdem.progresso} className="h-2" />
                    <span className="text-xs text-gray-500">{selectedOrdem.progresso}%</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Eficiência</Label>
                  <p className="text-sm">{selectedOrdem.eficiencia}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Responsável</Label>
                  <p className="text-sm">{selectedOrdem.responsavel}</p>
                </div>
              </div>

              {selectedOrdem.operacoes.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-4 block">Operações</Label>
                  <div className="space-y-2">
                    {selectedOrdem.operacoes.map((operacao) => (
                      <div key={operacao.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-xs font-semibold">
                            {operacao.sequencia}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{operacao.nome}</p>
                            <p className="text-xs text-gray-600">{operacao.centroTrabalho}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right text-xs">
                            <p>Est: {operacao.tempoEstimado}min</p>
                            <p>Real: {operacao.tempoRealizado}min</p>
                          </div>
                          {getStatusBadge(operacao.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedOrdem.materiaisNecessarios.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-4 block">Materiais</Label>
                  <div className="space-y-2">
                    {selectedOrdem.materiaisNecessarios.map((material) => (
                      <div key={material.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{material.nome}</p>
                          <p className="text-xs text-gray-600">{material.codigo}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">
                            {material.quantidadeConsumida}/{material.quantidadeNecessaria} {material.unidadeMedida}
                          </p>
                          <div className="flex items-center gap-1">
                            {material.disponivel ? (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            )}
                            <span className="text-xs text-gray-500">
                              {material.disponivel ? 'Disponível' : 'Indisponível'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button>
              <Edit className="mr-2 h-4 w-4" />
              Editar Ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}