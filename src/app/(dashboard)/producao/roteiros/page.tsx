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
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Copy,
  Settings,
  Factory,
  Clock,
  Users,
  Wrench,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  ArrowRight,
  ArrowDown,
  Calculator,
  BarChart3,
  TrendingUp,
  Target,
  Timer,
  Cog,
  User,
  DollarSign,
  Activity,
  Filter,
  Download,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';

interface Operacao {
  id: string;
  sequencia: number;
  nome: string;
  descricao: string;
  centroTrabalho: string;
  maquina?: string;
  operador?: string;
  tempoPreparacao: number; // minutos
  tempoOperacao: number; // minutos por unidade
  tempoLimpeza: number; // minutos
  custoHora: number;
  eficienciaEsperada: number; // %
  dependencias: string[]; // IDs das operações anteriores
  paralela: boolean;
  obrigatoria: boolean;
  instrucoes?: string;
  ferramentasNecessarias: string[];
  qualificacoesRequeridas: string[];
  status: 'ativo' | 'inativo' | 'em_revisao';
}

interface RoteiroProducao {
  id: string;
  codigo: string;
  nome: string;
  produto: string;
  versao: string;
  status: 'rascunho' | 'ativo' | 'inativo' | 'substituido';
  categoria: string;
  tempoTotalEstimado: number;
  custoTotalEstimado: number;
  eficienciaGlobal: number;
  operacoes: Operacao[];
  responsavel: string;
  dataCriacao: string;
  dataAtualizacao: string;
  observacoes?: string;
  aprovadoPor?: string;
  dataAprovacao?: string;
}

export default function RoteirosPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [selectedRoteiro, setSelectedRoteiro] = useState<RoteiroProducao | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedOperations, setExpandedOperations] = useState<Set<string>>(new Set());

  // Mock data
  const roteiros: RoteiroProducao[] = [
    {
      id: '1',
      codigo: 'ROT-001',
      nome: 'Produção de Bolo de Chocolate',
      produto: 'Bolo de Chocolate Premium',
      versao: 'v2.1',
      status: 'ativo',
      categoria: 'Padaria',
      tempoTotalEstimado: 180,
      custoTotalEstimado: 45.50,
      eficienciaGlobal: 85,
      responsavel: 'Maria Santos',
      dataCriacao: '2024-01-15',
      dataAtualizacao: '2024-10-15',
      aprovadoPor: 'João Silva',
      dataAprovacao: '2024-01-20',
      operacoes: [
        {
          id: 'op-1',
          sequencia: 1,
          nome: 'Preparação de Ingredientes',
          descricao: 'Separação e pesagem de todos os ingredientes',
          centroTrabalho: 'Bancada Prep',
          operador: 'Operador A',
          tempoPreparacao: 10,
          tempoOperacao: 15,
          tempoLimpeza: 5,
          custoHora: 120.00,
          eficienciaEsperada: 90,
          dependencias: [],
          paralela: false,
          obrigatoria: true,
          ferramentasNecessarias: ['Balança Digital', 'Tigelas', 'Medidores'],
          qualificacoesRequeridas: ['Básico Padaria'],
          status: 'ativo'
        },
        {
          id: 'op-2',
          sequencia: 2,
          nome: 'Mistura da Massa',
          descricao: 'Misturar ingredientes secos e líquidos',
          centroTrabalho: 'Misturador Industrial',
          maquina: 'MIX-001',
          operador: 'Operador B',
          tempoPreparacao: 5,
          tempoOperacao: 20,
          tempoLimpeza: 10,
          custoHora: 150.00,
          eficienciaEsperada: 95,
          dependencias: ['op-1'],
          paralela: false,
          obrigatoria: true,
          ferramentasNecessarias: ['Misturador', 'Raspadores'],
          qualificacoesRequeridas: ['Operação Equipamentos'],
          status: 'ativo'
        },
        {
          id: 'op-3',
          sequencia: 3,
          nome: 'Cozimento',
          descricao: 'Assar a massa no forno industrial',
          centroTrabalho: 'Forno Industrial',
          maquina: 'FORNO-001',
          operador: 'Operador C',
          tempoPreparacao: 15,
          tempoOperacao: 45,
          tempoLimpeza: 15,
          custoHora: 200.00,
          eficienciaEsperada: 88,
          dependencias: ['op-2'],
          paralela: false,
          obrigatoria: true,
          ferramentasNecessarias: ['Formas', 'Termômetro'],
          qualificacoesRequeridas: ['Operação Forno', 'Controle Temperatura'],
          status: 'ativo'
        },
        {
          id: 'op-4',
          sequencia: 4,
          nome: 'Resfriamento',
          descricao: 'Resfriamento controlado do produto',
          centroTrabalho: 'Câmara Fria',
          tempoPreparacao: 5,
          tempoOperacao: 60,
          tempoLimpeza: 5,
          custoHora: 80.00,
          eficienciaEsperada: 98,
          dependencias: ['op-3'],
          paralela: false,
          obrigatoria: true,
          ferramentasNecessarias: [],
          qualificacoesRequeridas: [],
          status: 'ativo'
        },
        {
          id: 'op-5',
          sequencia: 5,
          nome: 'Decoração e Acabamento',
          descricao: 'Aplicação de cobertura e decoração final',
          centroTrabalho: 'Bancada Decoração',
          operador: 'Confeiteiro',
          tempoPreparacao: 10,
          tempoOperacao: 25,
          tempoLimpeza: 10,
          custoHora: 180.00,
          eficienciaEsperada: 75,
          dependencias: ['op-4'],
          paralela: false,
          obrigatoria: false,
          ferramentasNecessarias: ['Bicos de Confeitar', 'Espátulas'],
          qualificacoesRequeridas: ['Confeitaria', 'Decoração'],
          status: 'ativo'
        }
      ]
    },
    {
      id: '2',
      codigo: 'ROT-002',
      nome: 'Montagem Mesa Executive',
      produto: 'Mesa de Escritório Executive',
      versao: 'v1.0',
      status: 'ativo',
      categoria: 'Móveis',
      tempoTotalEstimado: 480,
      custoTotalEstimado: 180.00,
      eficienciaGlobal: 92,
      responsavel: 'Carlos Pereira',
      dataCriacao: '2024-02-10',
      dataAtualizacao: '2024-10-10',
      operacoes: [
        {
          id: 'op-21',
          sequencia: 1,
          nome: 'Corte de Peças',
          descricao: 'Corte das pranchas MDF conforme especificação',
          centroTrabalho: 'Serralheria',
          maquina: 'SERRA-001',
          tempoPreparacao: 20,
          tempoOperacao: 60,
          tempoLimpeza: 10,
          custoHora: 150.00,
          eficienciaEsperada: 95,
          dependencias: [],
          paralela: false,
          obrigatoria: true,
          ferramentasNecessarias: ['Serra Circular', 'Gabaritos'],
          qualificacoesRequeridas: ['Operação Serra', 'Segurança'],
          status: 'ativo'
        }
      ]
    }
  ];

  const filteredRoteiros = roteiros.filter(roteiro => {
    const matchesSearch = roteiro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         roteiro.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         roteiro.produto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'todos' || roteiro.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const { currentPage, totalPages, itemsPerPage, totalItems, paginatedData, handlePageChange, handleItemsPerPageChange } = 
    usePagination({ data: filteredRoteiros, initialItemsPerPage: 10 });

  const getStatusBadge = (status: string) => {
    const variants = {
      ativo: 'default',
      rascunho: 'secondary',
      inativo: 'destructive',
      substituido: 'outline',
      em_revisao: 'secondary'
    } as const;
    
    return <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>{status}</Badge>;
  };

  const getEficienciaColor = (eficiencia: number) => {
    if (eficiencia >= 90) return 'text-green-600';
    if (eficiencia >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const toggleExpandedOperation = (id: string) => {
    const newExpanded = new Set(expandedOperations);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedOperations(newExpanded);
  };

  const calcularCustoOperacao = (operacao: Operacao): number => {
    const tempoTotal = operacao.tempoPreparacao + operacao.tempoOperacao + operacao.tempoLimpeza;
    return (tempoTotal / 60) * operacao.custoHora;
  };

  const renderFluxoOperacoes = (operacoes: Operacao[]) => {
    return (
      <div className="space-y-4">
        {operacoes
          .sort((a, b) => a.sequencia - b.sequencia)
          .map((operacao, index) => (
            <div key={operacao.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full font-semibold">
                    {operacao.sequencia}
                  </div>
                  <div>
                    <h4 className="font-semibold">{operacao.nome}</h4>
                    <p className="text-sm text-gray-600">{operacao.centroTrabalho}</p>
                  </div>
                  {!operacao.obrigatoria && (
                    <Badge variant="outline" className="text-xs">Opcional</Badge>
                  )}
                  {operacao.paralela && (
                    <Badge variant="secondary" className="text-xs">Paralela</Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="font-medium">{operacao.tempoOperacao} min</p>
                    <p className="text-gray-500">MT {calcularCustoOperacao(operacao).toFixed(2)}</p>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpandedOperation(operacao.id)}
                  >
                    {expandedOperations.has(operacao.id) ? 
                      <ArrowDown className="h-4 w-4" /> : 
                      <ArrowRight className="h-4 w-4" />
                    }
                  </Button>
                </div>
              </div>

              {expandedOperations.has(operacao.id) && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <Label className="text-xs text-gray-500">Preparação</Label>
                      <p className="font-medium">{operacao.tempoPreparacao} min</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Operação</Label>
                      <p className="font-medium">{operacao.tempoOperacao} min</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Limpeza</Label>
                      <p className="font-medium">{operacao.tempoLimpeza} min</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Eficiência</Label>
                      <p className={`font-medium ${getEficienciaColor(operacao.eficienciaEsperada)}`}>
                        {operacao.eficienciaEsperada}%
                      </p>
                    </div>
                  </div>

                  {operacao.descricao && (
                    <div>
                      <Label className="text-xs text-gray-500">Descrição</Label>
                      <p className="text-sm mt-1">{operacao.descricao}</p>
                    </div>
                  )}

                  {operacao.ferramentasNecessarias.length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-500">Ferramentas Necessárias</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {operacao.ferramentasNecessarias.map((ferramenta, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {ferramenta}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {operacao.qualificacoesRequeridas.length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-500">Qualificações Requeridas</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {operacao.qualificacoesRequeridas.map((qualificacao, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {qualificacao}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {operacao.maquina && (
                    <div>
                      <Label className="text-xs text-gray-500">Máquina</Label>
                      <p className="text-sm mt-1 flex items-center gap-1">
                        <Cog className="h-3 w-3" />
                        {operacao.maquina}
                      </p>
                    </div>
                  )}

                  {operacao.operador && (
                    <div>
                      <Label className="text-xs text-gray-500">Operador</Label>
                      <p className="text-sm mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {operacao.operador}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {index < operacoes.length - 1 && (
                <div className="flex justify-center mt-4">
                  <ArrowDown className="h-5 w-5 text-gray-400" />
                </div>
              )}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Roteiros de Produção</h1>
          <p className="text-muted-foreground">Gestão de processos e operações produtivas</p>
        </div>
        <Button asChild>
          <Link href="/producao/roteiros/novo">
            <Plus className="mr-2 h-4 w-4" />
            Novo Roteiro
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="lista" className="w-full">
        <TabsList>
          <TabsTrigger value="lista">Lista de Roteiros</TabsTrigger>
          <TabsTrigger value="fluxo">Visualização em Fluxo</TabsTrigger>
          <TabsTrigger value="capacidade">Análise de Capacidade</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Roteiros de Produção
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por roteiro, produto ou código..."
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
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="em_revisao">Em Revisão</SelectItem>
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
                      <TableHead>Roteiro</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Versão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Tempo Total</TableHead>
                      <TableHead>Custo Estimado</TableHead>
                      <TableHead>Eficiência</TableHead>
                      <TableHead>Operações</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((roteiro) => (
                      <TableRow key={roteiro.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{roteiro.nome}</div>
                            <div className="text-sm text-gray-500">{roteiro.codigo}</div>
                          </div>
                        </TableCell>
                        <TableCell>{roteiro.produto}</TableCell>
                        <TableCell>{roteiro.versao}</TableCell>
                        <TableCell>{getStatusBadge(roteiro.status)}</TableCell>
                        <TableCell>{roteiro.categoria}</TableCell>
                        <TableCell>{roteiro.tempoTotalEstimado} min</TableCell>
                        <TableCell>MT {roteiro.custoTotalEstimado.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className={getEficienciaColor(roteiro.eficienciaGlobal)}>
                            {roteiro.eficienciaGlobal}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {roteiro.operacoes.length} operações
                          </Badge>
                        </TableCell>
                        <TableCell>{roteiro.responsavel}</TableCell>
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
                                setSelectedRoteiro(roteiro);
                                setIsDialogOpen(true);
                              }}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Calculator className="mr-2 h-4 w-4" />
                                Recalcular Tempos
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Play className="mr-2 h-4 w-4" />
                                Simular Produção
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

        <TabsContent value="fluxo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Fluxo de Operações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedRoteiro ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                    <Factory className="h-8 w-8 text-blue-600" />
                    <div>
                      <h3 className="font-semibold text-lg">{selectedRoteiro.nome}</h3>
                      <p className="text-sm text-gray-600">
                        {selectedRoteiro.produto} - {selectedRoteiro.versao}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-medium">
                        Tempo Total: {selectedRoteiro.tempoTotalEstimado} min
                      </p>
                      <p className="text-sm text-gray-600">
                        Custo: MT {selectedRoteiro.custoTotalEstimado.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  {renderFluxoOperacoes(selectedRoteiro.operacoes)}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Selecione um roteiro para visualizar o fluxo de operações</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacidade" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Tempo Médio por Produto</p>
                    <p className="text-2xl font-bold">2.8h</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-500" />
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
                  <DollarSign className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Custo Médio</p>
                    <p className="text-2xl font-bold">MT 112</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Total Roteiros</p>
                    <p className="text-2xl font-bold">47</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Roteiros Ativos</p>
                    <p className="text-2xl font-bold">38</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Operações Totais</p>
                    <p className="text-2xl font-bold">234</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium">Centros de Trabalho</p>
                    <p className="text-2xl font-bold">12</p>
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
              <Settings className="h-5 w-5" />
              Detalhes do Roteiro
            </DialogTitle>
            <DialogDescription>
              Visualização completa do roteiro de produção e operações
            </DialogDescription>
          </DialogHeader>
          
          {selectedRoteiro && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium">Roteiro</Label>
                  <p className="text-sm">{selectedRoteiro.nome}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Código</Label>
                  <p className="text-sm">{selectedRoteiro.codigo}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Produto</Label>
                  <p className="text-sm">{selectedRoteiro.produto}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedRoteiro.status)}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Tempo Total</Label>
                  <p className="text-sm font-medium">{selectedRoteiro.tempoTotalEstimado} min</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Custo Total</Label>
                  <p className="text-sm font-medium">MT {selectedRoteiro.custoTotalEstimado.toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Eficiência Global</Label>
                  <p className={`text-sm font-medium ${getEficienciaColor(selectedRoteiro.eficienciaGlobal)}`}>
                    {selectedRoteiro.eficienciaGlobal}%
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Operações</Label>
                  <p className="text-sm">{selectedRoteiro.operacoes.length} operações</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium mb-4 block">Fluxo de Operações</Label>
                {renderFluxoOperacoes(selectedRoteiro.operacoes)}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Fechar
            </Button>
            <Button>
              <Edit className="mr-2 h-4 w-4" />
              Editar Roteiro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}