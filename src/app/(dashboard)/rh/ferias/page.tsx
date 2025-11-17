
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FeriasStorage, ColaboradorStorage } from '@/lib/storage/rh-storage';
import { Ferias, SolicitacaoFerias, Colaborador } from '@/types/rh';
import { Calendar, Plus, Check, X, Clock, User } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function FeriasPage() {
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedColaboradorId, setSelectedColaboradorId] = useState('');
  const [formData, setFormData] = useState({
    dataInicio: '',
    dataFim: '',
    tipo: 'integral' as const,
    observacoes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setFerias(FeriasStorage.getFerias());
    setColaboradores(ColaboradorStorage.getColaboradores());
  };

  const calcularDias = (inicio: string, fim: string): number => {
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    const diff = dataFim.getTime() - dataInicio.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleSolicitarFerias = () => {
    if (!selectedColaboradorId || !formData.dataInicio || !formData.dataFim) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const diasSolicitados = calcularDias(formData.dataInicio, formData.dataFim);
    let feriasColaborador = FeriasStorage.getFeriasByColaboradorId(selectedColaboradorId);

    if (!feriasColaborador) {
      const now = new Date().toISOString();
      const anoAtual = new Date().getFullYear();
      feriasColaborador = {
        id: Date.now().toString(),
        tenantId: 'default',
        colaboradorId: selectedColaboradorId,
        periodoAquisitivo: {
          inicio: `${anoAtual}-01-01`,
          fim: `${anoAtual}-12-31`
        },
        diasDisponiveis: 30,
        diasUsados: 0,
        diasPendentes: 0,
        solicitacoes: [],
        dataCriacao: now,
        dataAtualizacao: now
      };
      FeriasStorage.addFerias(feriasColaborador);
    }

    const novaSolicitacao: SolicitacaoFerias = {
      id: Date.now().toString(),
      feriasId: feriasColaborador.id,
      dataInicio: formData.dataInicio,
      dataFim: formData.dataFim,
      diasSolicitados,
      tipo: formData.tipo,
      status: 'pendente',
      observacoes: formData.observacoes,
      dataSolicitacao: new Date().toISOString()
    };

    const solicitacoesAtualizadas = [...feriasColaborador.solicitacoes, novaSolicitacao];
    const diasPendentesAtualizados = feriasColaborador.diasPendentes + diasSolicitados;

    FeriasStorage.updateFerias(feriasColaborador.id, {
      solicitacoes: solicitacoesAtualizadas,
      diasPendentes: diasPendentesAtualizados
    });

    toast.success('Solicitação de férias criada com sucesso!');
    setDialogOpen(false);
    setFormData({ dataInicio: '', dataFim: '', tipo: 'integral', observacoes: '' });
    setSelectedColaboradorId('');
    loadData();
  };

  const handleAprovarRejeitar = (feriasId: string, solicitacaoId: string, novoStatus: 'aprovada' | 'rejeitada', motivoRejeicao?: string) => {
    const feriasItem = ferias.find(f => f.id === feriasId);
    if (!feriasItem) return;

    const solicitacoesAtualizadas = feriasItem.solicitacoes.map(s => {
      if (s.id === solicitacaoId) {
        return {
          ...s,
          status: novoStatus,
          aprovadoPor: 'Admin',
          dataAprovacao: new Date().toISOString(),
          motivoRejeicao
        };
      }
      return s;
    });

    const solicitacao = feriasItem.solicitacoes.find(s => s.id === solicitacaoId);
    if (!solicitacao) return;

    let diasUsadosAtualizados = feriasItem.diasUsados;
    let diasPendentesAtualizados = feriasItem.diasPendentes - solicitacao.diasSolicitados;

    if (novoStatus === 'aprovada') {
      diasUsadosAtualizados += solicitacao.diasSolicitados;
    }

    FeriasStorage.updateFerias(feriasId, {
      solicitacoes: solicitacoesAtualizadas,
      diasUsados: diasUsadosAtualizados,
      diasPendentes: diasPendentesAtualizados
    });

    toast.success(`Solicitação ${novoStatus === 'aprovada' ? 'aprovada' : 'rejeitada'} com sucesso!`);
    loadData();
  };

  const getStatusBadge = (status: SolicitacaoFerias['status']) => {
    const variants: Record<SolicitacaoFerias['status'], { variant: any; label: string }> = {
      pendente: { variant: 'outline', label: 'Pendente' },
      aprovada: { variant: 'default', label: 'Aprovada' },
      rejeitada: { variant: 'destructive', label: 'Rejeitada' },
      cancelada: { variant: 'secondary', label: 'Cancelada' }
    };
    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getColaboradorNome = (colaboradorId: string) => {
    const colaborador = colaboradores.find(c => c.id === colaboradorId);
    return colaborador?.nome || 'Desconhecido';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Férias</h1>
          <p className="text-muted-foreground mt-1">
            Gerir solicitações e planeamento de férias
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Solicitação
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Solicitação de Férias</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Colaborador *</Label>
                <Select value={selectedColaboradorId} onValueChange={setSelectedColaboradorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o colaborador" />
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradores.filter(c => c.status === 'activo').map(colaborador => (
                      <SelectItem key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome} - {colaborador.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Início *</Label>
                  <Input
                    type="date"
                    value={formData.dataInicio}
                    onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Fim *</Label>
                  <Input
                    type="date"
                    value={formData.dataFim}
                    onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                  />
                </div>
              </div>

              {formData.dataInicio && formData.dataFim && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">
                    Total de dias: {calcularDias(formData.dataInicio, formData.dataFim)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={formData.tipo} onValueChange={(value: any) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="integral">Férias Integrais</SelectItem>
                    <SelectItem value="fracionada">Férias Fracionadas</SelectItem>
                    <SelectItem value="abono_pecuniario">Abono Pecuniário</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSolicitarFerias}>
                  Solicitar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Colaboradores</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{colaboradores.filter(c => c.status === 'activo').length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitações Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ferias.reduce((acc, f) => acc + f.solicitacoes.filter(s => s.status === 'pendente').length, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovadas Este Mês</CardTitle>
            <Check className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ferias.reduce((acc, f) => {
                const mesAtual = new Date().getMonth();
                return acc + f.solicitacoes.filter(s => {
                  if (s.status !== 'aprovada' || !s.dataAprovacao) return false;
                  return new Date(s.dataAprovacao).getMonth() === mesAtual;
                }).length;
              }, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Férias Agora</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {colaboradores.filter(c => c.status === 'ferias').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Solicitações de Férias</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data Solicitação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ferias.flatMap(f => 
                f.solicitacoes.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{getColaboradorNome(f.colaboradorId)}</TableCell>
                    <TableCell>
                      {new Date(s.dataInicio).toLocaleDateString('pt-PT')} - {new Date(s.dataFim).toLocaleDateString('pt-PT')}
                    </TableCell>
                    <TableCell>{s.diasSolicitados} dias</TableCell>
                    <TableCell className="capitalize">{s.tipo.replace('_', ' ')}</TableCell>
                    <TableCell>{getStatusBadge(s.status)}</TableCell>
                    <TableCell>{new Date(s.dataSolicitacao).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell className="text-right">
                      {s.status === 'pendente' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAprovarRejeitar(f.id, s.id, 'aprovada')}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAprovarRejeitar(f.id, s.id, 'rejeitada', 'Rejeitado pela gestão')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {ferias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma solicitação de férias encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
