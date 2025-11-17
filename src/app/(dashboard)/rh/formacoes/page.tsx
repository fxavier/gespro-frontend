
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FormacaoStorage } from '@/lib/storage/rh-storage';
import { Formacao } from '@/types/rh';
import { GraduationCap, Plus, Users, Clock, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function FormacoesPage() {
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setFormacoes(FormacaoStorage.getFormacoes());
  };

  const getStatusBadge = (status: Formacao['status']) => {
    const variants: Record<Formacao['status'], { variant: any; label: string }> = {
      planejada: { variant: 'outline', label: 'Planeada' },
      em_andamento: { variant: 'secondary', label: 'Em Andamento' },
      concluida: { variant: 'default', label: 'Concluída' },
      cancelada: { variant: 'destructive', label: 'Cancelada' }
    };
    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getModalidadeLabel = (modalidade: Formacao['modalidade']) => {
    const labels: Record<Formacao['modalidade'], string> = {
      presencial: 'Presencial',
      online: 'Online',
      hibrido: 'Híbrido'
    };
    return labels[modalidade];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Formações</h1>
          <p className="text-muted-foreground mt-1">
            Planeamento e acompanhamento de formações
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Formação
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Formações</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formacoes.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formacoes.filter(f => f.status === 'em_andamento').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formacoes.filter(f => f.status === 'concluida').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Participantes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formacoes.reduce((acc, f) => acc + f.vagasOcupadas, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Formações Registadas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Instrutor</TableHead>
                <TableHead>Modalidade</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Vagas</TableHead>
                <TableHead>Carga Horária</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formacoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma formação encontrada
                  </TableCell>
                </TableRow>
              ) : (
                formacoes.map((formacao) => (
                  <TableRow key={formacao.id}>
                    <TableCell className="font-medium">{formacao.titulo}</TableCell>
                    <TableCell>{formacao.categoria}</TableCell>
                    <TableCell>{formacao.instrutor}</TableCell>
                    <TableCell>{getModalidadeLabel(formacao.modalidade)}</TableCell>
                    <TableCell>
                      {new Date(formacao.dataInicio).toLocaleDateString('pt-PT')} - {new Date(formacao.dataFim).toLocaleDateString('pt-PT')}
                    </TableCell>
                    <TableCell>
                      {formacao.vagasOcupadas}/{formacao.vagasDisponiveis}
                    </TableCell>
                    <TableCell>{formacao.cargaHoraria}h</TableCell>
                    <TableCell>{getStatusBadge(formacao.status)}</TableCell>
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
