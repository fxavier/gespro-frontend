
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TarefaStorage } from '@/lib/storage/projeto-storage';
import { ProjetoStorage } from '@/lib/storage/projeto-storage';
import { Tarefa, Projeto } from '@/types/projeto';
import { Plus, Search, Filter, Edit, Trash2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePagination } from '@/hooks/usePagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function TarefasContent() {
  const searchParams = useSearchParams();
  const projetoId = searchParams.get('projetoId');
  
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [filteredTarefas, setFilteredTarefas] = useState<Tarefa[]>([]);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>('');
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'tarefa' as const,
    prioridade: 'media' as const,
    dataFimPrevista: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    horasEstimadas: '0',
  });

  const { currentPage, itemsPerPage, totalPages, paginatedData, handlePageChange } = usePagination({
    data: filteredTarefas,
    initialItemsPerPage: 10,
  });

  useEffect(() => {
    const data = TarefaStorage.getTarefas();
    if (projetoId) {
      const filtered = data.filter(t => t.projetoId === projetoId);
      setTarefas(filtered);
      const proj = ProjetoStorage.getProjetoById(projetoId);
      setProjeto(proj);
    } else {
      setTarefas(data);
    }
    setLoading(false);
  }, [projetoId]);

  useEffect(() => {
    let filtered = tarefas;

    if (searchTerm) {
      filtered = filtered.filter(t =>
        t.titulo.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (prioridadeFilter) {
      filtered = filtered.filter(t => t.prioridade === prioridadeFilter);
    }

    setFilteredTarefas(filtered);
    handlePageChange(1);
  }, [searchTerm, statusFilter, prioridadeFilter, tarefas, handlePageChange]);

  const handleAddTarefa = () => {
    if (!formData.titulo || !projetoId) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const novaTarefa: Tarefa = {
      id: `tarefa_${Date.now()}`,
      tenantId: 'default',
      projetoId: projetoId,
      projetoNome: projeto?.nome || '',
      codigo: `TASK-${Date.now()}`,
      titulo: formData.titulo,
      descricao: formData.descricao,
      tipo: formData.tipo,
      status: 'a_fazer',
      prioridade: formData.prioridade,
      dataFimPrevista: formData.dataFimPrevista,
      horasEstimadas: parseFloat(formData.horasEstimadas) || 0,
      horasTrabalhadas: 0,
      progresso: 0,
      criadoPorId: 'user_1',
      criadoPorNome: 'Usuário',
      dataCriacao: new Date().toISOString(),
      dataAtualizacao: new Date().toISOString(),
    };

    TarefaStorage.addTarefa(novaTarefa);
    setTarefas(TarefaStorage.getTarefas().filter(t => t.projetoId === projetoId));
    setOpenDialog(false);
    setFormData({
      titulo: '',
      descricao: '',
      tipo: 'tarefa',
      prioridade: 'media',
      dataFimPrevista: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      horasEstimadas: '0',
    });
    toast.success('Tarefa criada com sucesso');
  };

  const handleDeleteTarefa = (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta tarefa?')) {
      TarefaStorage.deleteTarefa(id);
      setTarefas(TarefaStorage.getTarefas().filter(t => t.projetoId === projetoId));
      toast.success('Tarefa deletada com sucesso');
    }
  };

  const handleUpdateStatus = (id: string, newStatus: string) => {
    TarefaStorage.updateTarefa(id, { status: newStatus as any });
    setTarefas(TarefaStorage.getTarefas().filter(t => t.projetoId === projetoId));
    toast.success('Status atualizado com sucesso');
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      a_fazer: { variant: 'secondary', label: 'A Fazer' },
      em_progresso: { variant: 'default', label: 'Em Progresso' },
      em_revisao: { variant: 'default', label: 'Em Revisão' },
      bloqueada: { variant: 'destructive', label: 'Bloqueada' },
      concluida: { variant: 'default', label: 'Concluída' },
      cancelada: { variant: 'secondary', label: 'Cancelada' }
    };
    return badges[status] || badges.a_fazer;
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const badges: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      baixa: { variant: 'secondary', label: 'Baixa' },
      media: { variant: 'default', label: 'Média' },
      alta: { variant: 'destructive', label: 'Alta' },
      critica: { variant: 'destructive', label: 'Crítica' }
    };
    return badges[prioridade] || badges.media;
  };

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          Tarefas {projeto && `- ${projeto.nome}`}
        </h1>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Tarefa</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input
                  id="titulo"
                  value={formData.titulo}
                  onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Título da tarefa"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descrição da tarefa"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo">Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(value) => setFormData(prev => ({ ...prev, tipo: value as any }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tarefa">Tarefa</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="melhoria">Melhoria</SelectItem>
                      <SelectItem value="documentacao">Documentação</SelectItem>
                      <SelectItem value="teste">Teste</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prioridade">Prioridade</Label>
                  <Select value={formData.prioridade} onValueChange={(value) => setFormData(prev => ({ ...prev, prioridade: value as any }))}>
                    <SelectTrigger>
                      <SelectValue />
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
                  <Label htmlFor="dataFimPrevista">Data de Conclusão</Label>
                  <Input
                    id="dataFimPrevista"
                    type="date"
                    value={formData.dataFimPrevista}
                    onChange={(e) => setFormData(prev => ({ ...prev, dataFimPrevista: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horasEstimadas">Horas Estimadas</Label>
                  <Input
                    id="horasEstimadas"
                    type="number"
                    value={formData.horasEstimadas}
                    onChange={(e) => setFormData(prev => ({ ...prev, horasEstimadas: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>

              <Button onClick={handleAddTarefa} className="w-full">
                Criar Tarefa
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tarefas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos os status</SelectItem>
                <SelectItem value="a_fazer">A Fazer</SelectItem>
                <SelectItem value="em_progresso">Em Progresso</SelectItem>
                <SelectItem value="em_revisao">Em Revisão</SelectItem>
                <SelectItem value="bloqueada">Bloqueada</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as prioridades</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tarefas ({filteredTarefas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {paginatedData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhuma tarefa encontrada</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Conclusão</TableHead>
                      <TableHead>Horas</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((tarefa) => (
                      <TableRow key={tarefa.id}>
                        <TableCell className="font-medium">{tarefa.codigo}</TableCell>
                        <TableCell>{tarefa.titulo}</TableCell>
                        <TableCell className="capitalize">{tarefa.tipo}</TableCell>
                        <TableCell>
                          <Select value={tarefa.status} onValueChange={(value) => handleUpdateStatus(tarefa.id, value)}>
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="a_fazer">A Fazer</SelectItem>
                              <SelectItem value="em_progresso">Em Progresso</SelectItem>
                              <SelectItem value="em_revisao">Em Revisão</SelectItem>
                              <SelectItem value="bloqueada">Bloqueada</SelectItem>
                              <SelectItem value="concluida">Concluída</SelectItem>
                              <SelectItem value="cancelada">Cancelada</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getPrioridadeBadge(tarefa.prioridade).variant as any}>
                            {getPrioridadeBadge(tarefa.prioridade).label}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(tarefa.dataFimPrevista).toLocaleDateString('pt-PT')}</TableCell>
                        <TableCell>{tarefa.horasEstimadas}h</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTarefa(tarefa.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
