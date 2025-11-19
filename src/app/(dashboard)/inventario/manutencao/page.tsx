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
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from '@/components/ui/use-toast';
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Eye,
  Trash2,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  User,
  Package,
  Wrench,
  DollarSign,
  FileText,
  Download,
  PlayCircle,
  StopCircle,
  Settings
} from 'lucide-react';
import Link from 'next/link';
import { ManutencaoAtivo, StatusManutencao, TipoManutencao } from '@/types/inventario';
import { manutencoesMock } from '@/data/manutencoes';

export default function ManutencaoPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<TipoManutencao | 'todos'>('todos');
  const [statusFilter, setStatusFilter] = useState<StatusManutencao | 'todos'>('todos');
  const [prioridadeFilter, setPrioridadeFilter] = useState<'todos' | 'baixa' | 'media' | 'alta' | 'critica'>('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Dados de exemplo
  const manutencoes: ManutencaoAtivo[] = manutencoesMock;


  const filteredManutencoes = manutencoes.filter(manutencao => {
    const matchesSearch = 
      manutencao.ativoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manutencao.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (manutencao.responsavelNome && manutencao.responsavelNome.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTipo = tipoFilter === 'todos' || manutencao.tipo === tipoFilter;
    const matchesStatus = statusFilter === 'todos' || manutencao.status === statusFilter;
    const matchesPrioridade = prioridadeFilter === 'todos' || manutencao.prioridade === prioridadeFilter;

    return matchesSearch && matchesTipo && matchesStatus && matchesPrioridade;
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

  const getStatusInfo = (status: StatusManutencao) => {
    const statusMap = {
      agendada: { 
        label: 'Agendada', 
        icon: <Calendar className="h-3 w-3" />, 
        color: 'bg-blue-100 text-blue-800' 
      },
      em_andamento: { 
        label: 'Em andamento', 
        icon: <PlayCircle className="h-3 w-3" />, 
        color: 'bg-yellow-100 text-yellow-800' 
      },
      em_curso: {
        label: 'Em curso',
        icon: <PlayCircle className="h-3 w-3" />,
        color: 'bg-yellow-100 text-yellow-800'
      },
      orcamento: { 
        label: 'Orçamento', 
        icon: <DollarSign className="h-3 w-3" />, 
        color: 'bg-purple-100 text-purple-800' 
      },
      concluida: { 
        label: 'Concluída', 
        icon: <CheckCircle className="h-3 w-3" />, 
        color: 'bg-green-100 text-green-800' 
      },
      cancelada: { 
        label: 'Cancelada', 
        icon: <XCircle className="h-3 w-3" />, 
        color: 'bg-red-100 text-red-800' 
      }
    };
    return statusMap[status];
  };

  const getPrioridadeInfo = (prioridade?: string) => {
    const prioridadeMap = {
      baixa: { label: 'Baixa', color: 'bg-gray-100 text-gray-800' },
      media: { label: 'Média', color: 'bg-blue-100 text-blue-800' },
      alta: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
      critica: { label: 'Crítica', color: 'bg-red-100 text-red-800' }
    };
    const key = prioridade as keyof typeof prioridadeMap | undefined;
    return key ? prioridadeMap[key] : prioridadeMap.media;
  };

  const getTipoInfo = (tipo: TipoManutencao) => {
    return tipo === 'preventiva' 
      ? { label: 'Preventiva', icon: <Calendar className="h-3 w-3" />, color: 'bg-green-100 text-green-800' }
      : { label: 'Corretiva', icon: <Wrench className="h-3 w-3" />, color: 'bg-orange-100 text-orange-800' };
  };

  const handleIniciarManutencao = (manutencao: ManutencaoAtivo) => {
    toast({
      title: "Manutenção iniciada",
      description: `A manutenção "${manutencao.titulo}" foi iniciada`,
    });
  };

  const handleConcluirManutencao = (manutencao: ManutencaoAtivo) => {
    toast({
      title: "Manutenção concluída",
      description: `A manutenção "${manutencao.titulo}" foi marcada como concluída`,
    });
  };

  const handleCancelarManutencao = (manutencao: ManutencaoAtivo) => {
    toast({
      title: "Manutenção cancelada",
      description: `A manutenção "${manutencao.titulo}" foi cancelada`,
      variant: "destructive"
    });
  };

  const handleExportarRelatorio = () => {
    toast({
      title: "Exportando relatório",
      description: "O relatório de manutenções será baixado em breve",
    });
  };

  // Estatísticas rápidas
  const estatisticas = {
    totalManutencoes: manutencoes.length,
    agendadas: manutencoes.filter(m => m.status === 'agendada').length,
    emAndamento: manutencoes.filter(m => m.status === 'em_andamento').length,
    vencidas: manutencoes.filter(m => 
      m.status === 'agendada' && 
      m.dataAgendada < new Date()
    ).length,
    custoTotalMes: manutencoes
      .filter(m => m.custoReal && 
        m.dataConclusao && 
        m.dataConclusao.getMonth() === new Date().getMonth())
      .reduce((acc, m) => acc + (m.custoReal || 0), 0)
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Manutenção</h1>
          <p className="text-muted-foreground">Controle preventivo e corretivo dos ativos</p>
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
                Nova Manutenção
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Agendar Manutenção</DialogTitle>
                <DialogDescription>
                  Configure os detalhes da manutenção do ativo
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ativo">Ativo *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o ativo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Computador Dell OptiPlex 3090</SelectItem>
                        <SelectItem value="2">Portátil Lenovo ThinkPad E15</SelectItem>
                        <SelectItem value="3">Toyota Hilux 2022</SelectItem>
                        <SelectItem value="4">Impressora HP LaserJet Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo *</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de manutenção" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="preventiva">Preventiva</SelectItem>
                        <SelectItem value="corretiva">Corretiva</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="titulo">Título *</Label>
                  <Input id="titulo" placeholder="Título da manutenção" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea id="descricao" placeholder="Descreva os trabalhos a realizar" rows={3} />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="dataAgendada">Data Agendada *</Label>
                    <Input id="dataAgendada" type="date" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="responsavel">Responsável</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Carlos Fernandes</SelectItem>
                        <SelectItem value="2">Maria Santos</SelectItem>
                        <SelectItem value="3">João Silva</SelectItem>
                        <SelectItem value="7">Equipe de Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custoEstimado">Custo Estimado (MT)</Label>
                    <Input id="custoEstimado" type="number" placeholder="0.00" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fornecedor">Fornecedor (Opcional)</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Dell Moçambique</SelectItem>
                      <SelectItem value="2">Lenovo Store</SelectItem>
                      <SelectItem value="3">Toyota Moçambique</SelectItem>
                      <SelectItem value="4">HP Store</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea id="observacoes" placeholder="Observações adicionais" rows={2} />
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

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{estatisticas.totalManutencoes}</p>
              </div>
              <Settings className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Agendadas</p>
                <p className="text-2xl font-bold">{estatisticas.agendadas}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-600" />
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
                <p className="text-sm text-muted-foreground">Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.vencidas}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Custo Mês</p>
                <p className="text-2xl font-bold">
                  MT {(estatisticas.custoTotalMes / 1000).toFixed(0)}K
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por ativo, título ou responsável..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={tipoFilter} onValueChange={(value: any) => setTipoFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="preventiva">Preventiva</SelectItem>
                  <SelectItem value="corretiva">Corretiva</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="agendada">Agendadas</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="orcamento">Orçamento</SelectItem>
                  <SelectItem value="concluida">Concluídas</SelectItem>
                  <SelectItem value="cancelada">Canceladas</SelectItem>
                </SelectContent>
              </Select>

              <Select value={prioridadeFilter} onValueChange={(value: any) => setPrioridadeFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Data Agendada</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length > 0 ? (
                paginatedData.map((manutencao) => {
                  const statusInfo = getStatusInfo(manutencao.status);
                  const prioridadeInfo = getPrioridadeInfo(manutencao.prioridade);
                  const tipoInfo = getTipoInfo(manutencao.tipo);
                  const isVencida = manutencao.status === 'agendada' && manutencao.dataAgendada < new Date();
                  
                  return (
                    <TableRow key={manutencao.id} className={isVencida ? 'bg-red-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{manutencao.ativoNome}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{manutencao.titulo}</div>
                          {manutencao.descricao && (
                            <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {manutencao.descricao}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${tipoInfo.color}`}>
                          {tipoInfo.icon}
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
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${prioridadeInfo.color}`}>
                          {prioridadeInfo.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-sm ${isVencida ? 'text-red-600 font-medium' : ''}`}>
                            {manutencao.dataAgendada.toLocaleDateString('pt-PT')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {manutencao.responsavelNome ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{manutencao.responsavelNome}</span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {manutencao.custoReal ? (
                            <div className="text-sm font-medium">
                              MT {manutencao.custoReal.toLocaleString()}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Est: MT {(manutencao.custoEstimado || 0).toLocaleString()}
                            </div>
                          )}
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
                              <Link href={`/inventario/manutencao/${manutencao.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            {manutencao.status === 'agendada' && (
                              <DropdownMenuItem onClick={() => handleIniciarManutencao(manutencao)}>
                                <PlayCircle className="h-4 w-4 mr-2" />
                                Iniciar
                              </DropdownMenuItem>
                            )}
                            {manutencao.status === 'em_andamento' && (
                              <DropdownMenuItem onClick={() => handleConcluirManutencao(manutencao)}>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Concluir
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild>
                              <Link href={`/inventario/manutencao/${manutencao.id}/editar`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <FileText className="h-4 w-4 mr-2" />
                              Relatório
                            </DropdownMenuItem>
                            {(manutencao.status === 'agendada' || manutencao.status === 'orcamento') && (
                              <DropdownMenuItem 
                                onClick={() => handleCancelarManutencao(manutencao)}
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
    </div>
  );
}
