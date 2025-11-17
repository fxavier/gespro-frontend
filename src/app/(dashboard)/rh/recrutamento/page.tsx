
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VagaEmpregoStorage } from '@/lib/storage/rh-storage';
import { VagaEmprego } from '@/types/rh';
import { Target, Plus, Briefcase, Users, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function RecrutamentoPage() {
  const [vagas, setVagas] = useState<VagaEmprego[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setVagas(VagaEmpregoStorage.getVagas());
  };

  const getStatusBadge = (status: VagaEmprego['status']) => {
    const variants: Record<VagaEmprego['status'], { variant: any; label: string }> = {
      aberta: { variant: 'default', label: 'Aberta' },
      em_andamento: { variant: 'secondary', label: 'Em Andamento' },
      fechada: { variant: 'outline', label: 'Fechada' },
      cancelada: { variant: 'destructive', label: 'Cancelada' }
    };
    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTipoContratoLabel = (tipo: VagaEmprego['tipoContrato']) => {
    const labels: Record<VagaEmprego['tipoContrato'], string> = {
      efectivo: 'Efetivo',
      termo_certo: 'Termo Certo',
      estagio: 'Estágio',
      temporario: 'Temporário'
    };
    return labels[tipo];
  };

  const totalCandidaturas = vagas.reduce((acc, v) => acc + v.candidaturas.length, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Recrutamento e Seleção</h1>
          <p className="text-muted-foreground mt-1">
            Gerir vagas e processos de recrutamento
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Vaga
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vagas Abertas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vagas.filter(v => v.status === 'aberta').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Vagas</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vagas.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Candidaturas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCandidaturas}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vagas Fechadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vagas.filter(v => v.status === 'fechada').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vagas de Emprego</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Tipo Contrato</TableHead>
                <TableHead>Nº Vagas</TableHead>
                <TableHead>Candidaturas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Data Abertura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vagas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma vaga encontrada
                  </TableCell>
                </TableRow>
              ) : (
                vagas.map((vaga) => (
                  <TableRow key={vaga.id}>
                    <TableCell className="font-medium">{vaga.titulo}</TableCell>
                    <TableCell>{vaga.departamento}</TableCell>
                    <TableCell>{vaga.cargo}</TableCell>
                    <TableCell>{getTipoContratoLabel(vaga.tipoContrato)}</TableCell>
                    <TableCell>{vaga.numeroVagas}</TableCell>
                    <TableCell>{vaga.candidaturas.length}</TableCell>
                    <TableCell>{getStatusBadge(vaga.status)}</TableCell>
                    <TableCell>{new Date(vaga.dataAbertura).toLocaleDateString('pt-PT')}</TableCell>
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
