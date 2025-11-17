
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AusenciaStorage, ColaboradorStorage } from '@/lib/storage/rh-storage';
import { Ausencia, Colaborador } from '@/types/rh';
import { Plus, Check, X, UserX, FileText } from 'lucide-react';
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

export default function AusenciasPage() {
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    colaboradorId: '',
    tipo: 'falta' as Ausencia['tipo'],
    dataInicio: '',
    dataFim: '',
    justificada: false,
    justificativa: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setAusencias(AusenciaStorage.getAusencias());
    setColaboradores(ColaboradorStorage.getColaboradores());
  };

  const calcularDias = (inicio: string, fim: string): number => {
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    const diff = dataFim.getTime() - dataInicio.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleRegistrarAusencia = () => {
    if (!formData.colaboradorId || !formData.dataInicio || !formData.dataFim) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const diasAusencia = calcularDias(formData.dataInicio, formData.dataFim);
    const now = new Date().toISOString();

    const novaAusencia: Ausencia = {
      id: Date.now().toString(),
      tenantId: 'default',
      colaboradorId: formData.colaboradorId,
      tipo: formData.tipo,
      dataInicio: formData.dataInicio,
      dataFim: formData.dataFim,
      diasAusencia,
      justificada: formData.justificada,
      justificativa: formData.justificativa,
      anexos: [],
      status: 'pendente',
      dataCriacao: now,
      dataAtualizacao: now
    };

    AusenciaStorage.addAusencia(novaAusencia);
    toast.success('Ausência registrada com sucesso!');
    setDialogOpen(false);
    setFormData({
      colaboradorId: '',
      tipo: 'falta',
      dataInicio: '',
      dataFim: '',
      justificada: false,
      justificativa: ''
    });
    loadData();
  };

  const handleAprovarRejeitar = (id: string, novoStatus: 'aprovada' | 'rejeitada') => {
    AusenciaStorage.updateAusencia(id, {
      status: novoStatus,
      aprovadoPor: 'Admin',
      dataAprovacao: new Date().toISOString()
    });
    toast.success(`Ausência ${novoStatus === 'aprovada' ? 'aprovada' : 'rejeitada'} com sucesso!`);
    loadData();
  };

  const getStatusBadge = (status: Ausencia['status']) => {
    const variants: Record<Ausencia['status'], { variant: any; label: string }> = {
      pendente: { variant: 'outline', label: 'Pendente' },
      aprovada: { variant: 'default', label: 'Aprovada' },
      rejeitada: { variant: 'destructive', label: 'Rejeitada' }
    };
    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTipoLabel = (tipo: Ausencia['tipo']) => {
    const labels: Record<Ausencia['tipo'], string> = {
      falta: 'Falta',
      atestado_medico: 'Atestado Médico',
      licenca_maternidade: 'Licença Maternidade',
      licenca_paternidade: 'Licença Paternidade',
      licenca_sem_vencimento: 'Licença Sem Vencimento',
      licenca_nojo: 'Licença Nojo',
      licenca_casamento: 'Licença Casamento',
      outro: 'Outro'
    };
    return labels[tipo];
  };

  const getColaboradorNome = (colaboradorId: string) => {
    const colaborador = colaboradores.find(c => c.id === colaboradorId);
    return colaborador?.nome || 'Desconhecido';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Ausências</h1>
          <p className="text-muted-foreground mt-1">
            Registar e gerir ausências dos colaboradores
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Registar Ausência
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registar Nova Ausência</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Colaborador *</Label>
                <Select value={formData.colaboradorId} onValueChange={(value) => setFormData({ ...formData, colaboradorId: value })}>
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

              <div className="space-y-2">
                <Label>Tipo de Ausência *</Label>
                <Select value={formData.tipo} onValueChange={(value: any) => setFormData({ ...formData, tipo: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="falta">Falta</SelectItem>
                    <SelectItem value="atestado_medico">Atestado Médico</SelectItem>
                    <SelectItem value="licenca_maternidade">Licença Maternidade</SelectItem>
                    <SelectItem value="licenca_paternidade">Licença Paternidade</SelectItem>
                    <SelectItem value="licenca_sem_vencimento">Licença Sem Vencimento</SelectItem>
                    <SelectItem value="licenca_nojo">Licença Nojo</SelectItem>
                    <SelectItem value="licenca_casamento">Licença Casamento</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
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

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.justificada}
                  onChange={(e) => setFormData({ ...formData, justificada: e.target.checked })}
                  className="rounded"
                />
                <Label>Ausência Justificada</Label>
              </div>

              <div className="space-y-2">
                <Label>Justificativa</Label>
                <Textarea
                  value={formData.justificativa}
                  onChange={(e) => setFormData({ ...formData, justificativa: e.target.value })}
                  rows={3}
                  placeholder="Descreva o motivo da ausência..."
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleRegistrarAusencia}>
                  Registar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Ausências</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ausencias.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ausencias.filter(a => a.status === 'pendente').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovadas</CardTitle>
            <Check className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ausencias.filter(a => a.status === 'aprovada').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejeitadas</CardTitle>
            <X className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ausencias.filter(a => a.status === 'rejeitada').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registo de Ausências</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Dias</TableHead>
                <TableHead>Justificada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ausencias.map((ausencia) => (
                <TableRow key={ausencia.id}>
                  <TableCell className="font-medium">{getColaboradorNome(ausencia.colaboradorId)}</TableCell>
                  <TableCell>{getTipoLabel(ausencia.tipo)}</TableCell>
                  <TableCell>
                    {new Date(ausencia.dataInicio).toLocaleDateString('pt-PT')} - {new Date(ausencia.dataFim).toLocaleDateString('pt-PT')}
                  </TableCell>
                  <TableCell>{ausencia.diasAusencia} dias</TableCell>
                  <TableCell>
                    {ausencia.justificada ? (
                      <Badge variant="default">Sim</Badge>
                    ) : (
                      <Badge variant="secondary">Não</Badge>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(ausencia.status)}</TableCell>
                  <TableCell className="text-right">
                    {ausencia.status === 'pendente' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleAprovarRejeitar(ausencia.id, 'aprovada')}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAprovarRejeitar(ausencia.id, 'rejeitada')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {ausencias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhuma ausência registrada
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
