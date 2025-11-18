'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  ClipboardList,
  QrCode,
  Scan,
  User,
  Package,
  MapPin,
  FileSpreadsheet,
  Download,
  PlayCircle,
  PauseCircle,
  StopCircle,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { InventarioFisico, StatusInventarioFisico } from '@/types/inventario';
import { inventariosFisicosMock } from '@/data/inventarios-fisicos';

export default function InventarioFisicoPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusInventarioFisico | 'todos'>('todos');
  const [localizacaoFilter, setLocalizacaoFilter] = useState<string>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('inventarios');

  // Dados de exemplo
  const inventarios: InventarioFisico[] = inventariosFisicosMock;


  const localizacoes = [
    { id: '1', nome: 'Armazém Principal' },
    { id: '2', nome: 'Escritório Central' },
    { id: '3', nome: 'Departamento de TI' },
    { id: '6', nome: 'Sala de Conferências' }
  ];

  const filteredInventarios = inventarios.filter(inventario => {
    const matchesSearch = 
      inventario.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inventario.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inventario.responsavelNome && inventario.responsavelNome.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'todos' || inventario.status === statusFilter;
    const matchesLocalizacao = localizacaoFilter === 'todos' || inventario.localizacaoId === localizacaoFilter;

    return matchesSearch && matchesStatus && matchesLocalizacao;
  });

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredInventarios, initialItemsPerPage: 10 });

  const getStatusInfo = (status: StatusInventarioFisico) => {
    const statusMap = {
      agendado: { 
        label: 'Agendado', 
        icon: <Calendar className="h-3 w-3" />, 
        color: 'bg-blue-100 text-blue-800' 
      },
      em_andamento: { 
        label: 'Em Andamento', 
        icon: <PlayCircle className="h-3 w-3" />, 
        color: 'bg-yellow-100 text-yellow-800' 
      },
      pausado: { 
        label: 'Pausado', 
        icon: <PauseCircle className="h-3 w-3" />, 
        color: 'bg-orange-100 text-orange-800' 
      },
      concluido: { 
        label: 'Concluído', 
        icon: <CheckCircle className="h-3 w-3" />, 
        color: 'bg-green-100 text-green-800' 
      },
      cancelado: { 
        label: 'Cancelado', 
        icon: <XCircle className="h-3 w-3" />, 
        color: 'bg-red-100 text-red-800' 
      }
    };
    return statusMap[status];
  };

  const handleIniciarInventario = (inventario: InventarioFisico) => {
    toast({
      title: "Inventário iniciado",
      description: `O inventário "${inventario.titulo}" foi iniciado`,
    });
  };

  const handlePausarInventario = (inventario: InventarioFisico) => {
    toast({
      title: "Inventário pausado",
      description: `O inventário "${inventario.titulo}" foi pausado`,
    });
  };

  const handleConcluirInventario = (inventario: InventarioFisico) => {
    toast({
      title: "Inventário concluído",
      description: `O inventário "${inventario.titulo}" foi marcado como concluído`,
    });
  };

  const handleCancelarInventario = (inventario: InventarioFisico) => {
    toast({
      title: "Inventário cancelado",
      description: `O inventário "${inventario.titulo}" foi cancelado`,
      variant: "destructive"
    });
  };

  const handleExportarRelatorio = () => {
    toast({
      title: "Exportando relatório",
      description: "O relatório de inventário físico será baixado em breve",
    });
  };

  // Estatísticas
  const estatisticas = {
    totalInventarios: inventarios.length,
    emAndamento: inventarios.filter(i => i.status === 'em_andamento').length,
    concluidos: inventarios.filter(i => i.status === 'concluido').length,
    totalDivergencias: inventarios.reduce((acc, i) => acc + i.divergenciasEncontradas, 0),
    acuracidadeMedia: inventarios
      .filter(i => i.status === 'concluido')
      .reduce((acc, i) => acc + ((i.totalItens - i.divergenciasEncontradas) / i.totalItens * 100), 0) / 
      Math.max(inventarios.filter(i => i.status === 'concluido').length, 1)
  };

  // Dados para contagem em tempo real
  const contagemAtual = inventarios.find(i => i.status === 'em_andamento');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Inventário Físico</h1>
          <p className="text-muted-foreground">Controle e auditoria física dos ativos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportarRelatorio}>
            <Download className="h-4 w-4 mr-2" />
            Relatório
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Inventário
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Criar Inventário Físico</DialogTitle>
                <DialogDescription>
                  Configure um novo inventário ou auditoria física
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código *</Label>
                    <Input id="codigo" placeholder="INV-2024-XXX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="titulo">Título *</Label>
                    <Input id="titulo" placeholder="Título do inventário" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea id="descricao" placeholder="Descrição detalhada do inventário" rows={3} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataInicio">Data de Início *</Label>
                    <Input id="dataInicio" type="date" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataPrevista">Data Prevista Conclusão *</Label>
                    <Input id="dataPrevista" type="date" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="responsavel">Responsável *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Carlos Fernandes</SelectItem>
                        <SelectItem value="2">Maria Santos</SelectItem>
                        <SelectItem value="3">João Silva</SelectItem>
                        <SelectItem value="5">Sofia Nunes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="localizacao">Localização</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Todas ou específica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Todas as localizações</SelectItem>
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
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea id="observacoes" placeholder="Observações e instruções especiais" rows={2} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => {
                  setIsDialogOpen(false);
                  toast({
                    title: "Inventário criado",
                    description: "O inventário físico foi criado e agendado",
                  });
                }}>
                  Criar Inventário
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{estatisticas.totalInventarios}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
                <p className="text-2xl font-bold">{estatisticas.emAndamento}</p>
              </div>
              <PlayCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Concluídos</p>
                <p className="text-2xl font-bold">{estatisticas.concluidos}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Divergências</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.totalDivergencias}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Acurácia Média</p>
                <p className="text-2xl font-bold text-green-600">
                  {estatisticas.acuracidadeMedia.toFixed(1)}%
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventarios">Inventários</TabsTrigger>
          <TabsTrigger value="contagem" disabled={!contagemAtual}>
            Contagem em Tempo Real
            {contagemAtual && (
              <Badge variant="secondary" className="ml-2">
                {contagemAtual.itensContados}/{contagemAtual.totalItens}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventarios">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por título, código ou responsável..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="agendado">Agendados</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="pausado">Pausados</SelectItem>
                      <SelectItem value="concluido">Concluídos</SelectItem>
                      <SelectItem value="cancelado">Cancelados</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={localizacaoFilter} onValueChange={setLocalizacaoFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Localização" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todas</SelectItem>
                      {localizacoes.map(localizacao => (
                        <SelectItem key={localizacao.id} value={localizacao.id}>
                          {localizacao.nome}
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
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Progresso</TableHead>
                    <TableHead>Divergências</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length > 0 ? (
                    paginatedData.map((inventario) => {
                      const statusInfo = getStatusInfo(inventario.status);
                      const progresso = (inventario.itensContados / inventario.totalItens) * 100;
                      const isPrazoVencido = inventario.dataPrevistaConclusao < new Date() && inventario.status !== 'concluido' && inventario.status !== 'cancelado';
                      
                      return (
                        <TableRow key={inventario.id} className={isPrazoVencido ? 'bg-red-50' : ''}>
                          <TableCell className="font-medium">{inventario.codigo}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{inventario.titulo}</div>
                              <div className="text-sm text-muted-foreground">
                                {inventario.dataInicio.toLocaleDateString('pt-PT')} - {inventario.dataPrevistaConclusao.toLocaleDateString('pt-PT')}
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
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{inventario.localizacaoNome}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>{inventario.itensContados}/{inventario.totalItens}</span>
                                <span>{progresso.toFixed(0)}%</span>
                              </div>
                              <Progress value={progresso} className="h-2" />
                            </div>
                          </TableCell>
                          <TableCell>
                            {inventario.divergenciasEncontradas > 0 ? (
                              <Badge variant="destructive">
                                {inventario.divergenciasEncontradas}
                              </Badge>
                            ) : (
                              <Badge variant="default">0</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{inventario.responsavelNome}</span>
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
                                  <Link href={`/inventario/fisico/${inventario.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Ver Detalhes
                                  </Link>
                                </DropdownMenuItem>
                                {inventario.status === 'agendado' && (
                                  <DropdownMenuItem onClick={() => handleIniciarInventario(inventario)}>
                                    <PlayCircle className="h-4 w-4 mr-2" />
                                    Iniciar
                                  </DropdownMenuItem>
                                )}
                                {inventario.status === 'em_andamento' && (
                                  <>
                                    <DropdownMenuItem onClick={() => handlePausarInventario(inventario)}>
                                      <PauseCircle className="h-4 w-4 mr-2" />
                                      Pausar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleConcluirInventario(inventario)}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Concluir
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem asChild>
                                  <Link href={`/inventario/fisico/${inventario.id}/contagem`}>
                                    <Scan className="h-4 w-4 mr-2" />
                                    Contagem
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/inventario/fisico/${inventario.id}/editar`}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                                  Relatório
                                </DropdownMenuItem>
                                {(inventario.status === 'agendado' || inventario.status === 'pausado') && (
                                  <DropdownMenuItem 
                                    onClick={() => handleCancelarInventario(inventario)}
                                    className="text-destructive"
                                  >
                                    <StopCircle className="h-4 w-4 mr-2" />
                                    Cancelar
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <ClipboardList className="h-12 w-12 opacity-50" />
                          <p>Nenhum inventário encontrado</p>
                          <p className="text-sm">Tente ajustar os filtros ou criar um novo inventário</p>
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

        <TabsContent value="contagem">
          {contagemAtual ? (
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PlayCircle className="h-5 w-5 text-green-600" />
                    {contagemAtual.titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{contagemAtual.totalItens}</div>
                      <div className="text-sm text-muted-foreground">Total de Itens</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{contagemAtual.itensContados}</div>
                      <div className="text-sm text-muted-foreground">Contados</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{contagemAtual.itensPendentes}</div>
                      <div className="text-sm text-muted-foreground">Pendentes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{contagemAtual.divergenciasEncontradas}</div>
                      <div className="text-sm text-muted-foreground">Divergências</div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Progresso da Contagem</span>
                      <span>{((contagemAtual.itensContados / contagemAtual.totalItens) * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={(contagemAtual.itensContados / contagemAtual.totalItens) * 100} className="h-3" />
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button asChild>
                      <Link href={`/inventario/fisico/${contagemAtual.id}/contagem`}>
                        <Scan className="h-4 w-4 mr-2" />
                        Continuar Contagem
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={() => handlePausarInventario(contagemAtual)}>
                      <PauseCircle className="h-4 w-4 mr-2" />
                      Pausar
                    </Button>
                    <Button variant="outline" onClick={() => handleConcluirInventario(contagemAtual)}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Concluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto opacity-50 mb-4" />
                  <p>Nenhuma contagem em andamento</p>
                  <p className="text-sm">Inicie um inventário para usar esta funcionalidade</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
