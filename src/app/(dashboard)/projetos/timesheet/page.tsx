
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Clock, Plus, Search, Filter, Edit, Trash2, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { TimesheetStorage, ProjetoStorage, TarefaStorage } from '@/lib/storage/projeto-storage';
import { RegistroTempo, Projeto, Tarefa } from '@/types/projeto';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

export default function TimesheetPage() {
  const [registros, setRegistros] = useState<RegistroTempo[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [filteredRegistros, setFilteredRegistros] = useState<RegistroTempo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [projetoFilter, setProjetoFilter] = useState<string>('todos');
  const [dataFilter, setDataFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRegistro, setEditingRegistro] = useState<RegistroTempo | null>(null);
  const [formData, setFormData] = useState({
    projetoId: '',
    tarefaId: '',
    data: new Date().toISOString().split('T')[0],
    horaInicio: '',
    horaFim: '',
    descricao: '',
    tipo: 'desenvolvimento' as RegistroTempo['tipo'],
    faturavel: true
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterRegistros();
  }, [registros, searchTerm, projetoFilter, dataFilter]);

  const loadData = () => {
    const registrosData = TimesheetStorage.getRegistros();
    const projetosData = ProjetoStorage.getProjetos();
    const tarefasData = TarefaStorage.getTarefas();
    setRegistros(registrosData);
    setProjetos(projetosData);
    setTarefas(tarefasData);
  };

  const filterRegistros = () => {
    let filtered = [...registros];

    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.projetoNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.tarefaTitulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (projetoFilter !== 'todos') {
      filtered = filtered.filter(r => r.projetoId === projetoFilter);
    }

    if (dataFilter) {
      filtered = filtered.filter(r => r.data === dataFilter);
    }

    filtered.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    setFilteredRegistros(filtered);
  };

  const calcularDuracao = (horaInicio: string, horaFim: string): number => {
    if (!horaInicio || !horaFim) return 0;
    const [hi, mi] = horaInicio.split(':').map(Number);
    const [hf, mf] = horaFim.split(':').map(Number);
    const inicio = hi * 60 + mi;
    const fim = hf * 60 + mf;
    return (fim - inicio) / 60;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.projetoId || !formData.data || !formData.horaInicio || !formData.horaFim) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const duracao = calcularDuracao(formData.horaInicio, formData.horaFim);
    if (duracao <= 0) {
      toast.error('Hora de fim deve ser maior que hora de início');
      return;
    }

    const projeto = projetos.find(p => p.id === formData.projetoId);
    const tarefa = formData.tarefaId ? tarefas.find(t => t.id === formData.tarefaId) : undefined;

    if (!projeto) {
      toast.error('Projeto não encontrado');
      return;
    }

    if (editingRegistro) {
      const updated = TimesheetStorage.updateRegistro(editingRegistro.id, {
        ...formData,
        projetoNome: projeto.nome,
        tarefaTitulo: tarefa?.titulo,
        duracaoHoras: duracao
      });
      if (updated) {
        toast.success('Registro atualizado com sucesso');
      }
    } else {
      const novoRegistro: RegistroTempo = {
        id: `time_${Date.now()}`,
        tenantId: 'tenant_1',
        projetoId: formData.projetoId,
        projetoNome: projeto.nome,
        tarefaId: formData.tarefaId || undefined,
        tarefaTitulo: tarefa?.titulo,
        usuarioId: 'user_1',
        usuarioNome: 'Usuário Atual',
        data: formData.data,
        horaInicio: formData.horaInicio,
        horaFim: formData.horaFim,
        duracaoHoras: duracao,
        descricao: formData.descricao,
        tipo: formData.tipo,
        faturavel: formData.faturavel,
        aprovado: false,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString()
      };
      TimesheetStorage.addRegistro(novoRegistro);
      toast.success('Registro criado com sucesso');
    }

    loadData();
    setIsDialogOpen(false);
    resetForm();
  };

  const handleEdit = (registro: RegistroTempo) => {
    setEditingRegistro(registro);
    setFormData({
      projetoId: registro.projetoId,
      tarefaId: registro.tarefaId || '',
      data: registro.data,
      horaInicio: registro.horaInicio,
      horaFim: registro.horaFim,
      descricao: registro.descricao || '',
      tipo: registro.tipo,
      faturavel: registro.faturavel
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    const success = TimesheetStorage.deleteRegistro(id);
    if (success) {
      toast.success('Registro excluído com sucesso');
      loadData();
    }
  };

  const handleAprovar = (id: string) => {
    const updated = TimesheetStorage.updateRegistro(id, {
      aprovado: true,
      aprovadoPorId: 'user_1',
      aprovadoPorNome: 'Gestor',
      dataAprovacao: new Date().toISOString()
    });
    if (updated) {
      toast.success('Registro aprovado com sucesso');
      loadData();
    }
  };

  const resetForm = () => {
    setEditingRegistro(null);
    setFormData({
      projetoId: '',
      tarefaId: '',
      data: new Date().toISOString().split('T')[0],
      horaInicio: '',
      horaFim: '',
      descricao: '',
      tipo: 'desenvolvimento',
      faturavel: true
    });
  };

  const tarefasFiltradas = formData.projetoId
    ? tarefas.filter(t => t.projetoId === formData.projetoId)
    : [];

  const totalHoras = filteredRegistros.reduce((sum, r) => sum + r.duracaoHoras, 0);
  const horasAprovadas = filteredRegistros.filter(r => r.aprovado).reduce((sum, r) => sum + r.duracaoHoras, 0);
  const horasFaturaveis = filteredRegistros.filter(r => r.faturavel).reduce((sum, r) => sum + r.duracaoHoras, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Timesheet</h1>
          <p className="text-muted-foreground">Registo de horas trabalhadas nos projetos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Registo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingRegistro ? 'Editar Registo' : 'Novo Registo de Tempo'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="projetoId">Projeto *</Label>
                  <Select value={formData.projetoId} onValueChange={(value) => setFormData({ ...formData, projetoId: value, tarefaId: '' })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projetos.map(projeto => (
                        <SelectItem key={projeto.id} value={projeto.id}>
                          {projeto.codigo} - {projeto.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tarefaId">Tarefa (Opcional)</Label>
                  <Select value={formData.tarefaId} onValueChange={(value) => setFormData({ ...formData, tarefaId: value })} disabled={!formData.projetoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma tarefa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {tarefasFiltradas.map(tarefa => (
                        <SelectItem key={tarefa.id} value={tarefa.id}>
                          {tarefa.codigo} - {tarefa.titulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data">Data *</Label>
                  <Input
                    id="data"
                    type="date"
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horaInicio">Hora Início *</Label>
                  <Input
                    id="horaInicio"
                    type="time"
                    value={formData.horaInicio}
                    onChange={(e) => setFormData({ ...formData, horaInicio: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="horaFim">Hora Fim *</Label>
                  <Input
                    id="horaFim"
                    type="time"
                    value={formData.horaFim}
                    onChange={(e) => setFormData({ ...formData, horaFim: e.target.value })}
                    required
                  />
                </div>
              </div>

              {formData.horaInicio && formData.horaFim && (
                <div className="text-sm text-muted-foreground">
                  Duração: {calcularDuracao(formData.horaInicio, formData.horaFim).toFixed(2)} horas
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Atividade</Label>
                <Select value={formData.tipo} onValueChange={(value: RegistroTempo['tipo']) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desenvolvimento">Desenvolvimento</SelectItem>
                    <SelectItem value="reuniao">Reunião</SelectItem>
                    <SelectItem value="documentacao">Documentação</SelectItem>
                    <SelectItem value="teste">Teste</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descreva o trabalho realizado"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="faturavel"
                  checked={formData.faturavel}
                  onCheckedChange={(checked) => setFormData({ ...formData, faturavel: checked as boolean })}
                />
                <Label htmlFor="faturavel" className="cursor-pointer">
                  Horas faturáveis
                </Label>
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingRegistro ? 'Atualizar' : 'Criar'} Registo
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Horas</p>
                <p className="text-3xl font-bold">{totalHoras.toFixed(1)}h</p>
              </div>
              <Clock className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Horas Aprovadas</p>
                <p className="text-3xl font-bold">{horasAprovadas.toFixed(1)}h</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Horas Faturáveis</p>
                <p className="text-3xl font-bold">{horasFaturaveis.toFixed(1)}h</p>
              </div>
              <Calendar className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Registos</p>
                <p className="text-3xl font-bold">{filteredRegistros.length}</p>
              </div>
              <Clock className="h-10 w-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar registos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={projetoFilter} onValueChange={setProjetoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Projetos</SelectItem>
                {projetos.map(projeto => (
                  <SelectItem key={projeto.id} value={projeto.id}>
                    {projeto.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dataFilter}
              onChange={(e) => setDataFilter(e.target.value)}
              placeholder="Data"
            />
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setProjetoFilter('todos');
                setDataFilter('');
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Tarefa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Horário</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRegistros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum registo encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredRegistros.map((registro) => (
                  <TableRow key={registro.id}>
                    <TableCell>
                      {new Date(registro.data).toLocaleDateString('pt-PT')}
                    </TableCell>
                    <TableCell className="font-medium">{registro.projetoNome}</TableCell>
                    <TableCell>{registro.tarefaTitulo || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{registro.tipo}</Badge>
                    </TableCell>
                    <TableCell>
                      {registro.horaInicio} - {registro.horaFim}
                    </TableCell>
                    <TableCell className="font-medium">
                      {registro.duracaoHoras.toFixed(2)}h
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {registro.aprovado ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Aprovado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                        {registro.faturavel && (
                          <Badge variant="outline">Faturável</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!registro.aprovado && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAprovar(registro.id)}
                            title="Aprovar"
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(registro)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(registro.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
