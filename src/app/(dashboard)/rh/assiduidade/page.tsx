
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AssiduidadeStorage, ColaboradorStorage } from '@/lib/storage/rh-storage';
import { RegistroAssiduidade, Colaborador } from '@/types/rh';
import { Calendar, Clock, TrendingUp, Users, Plus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AssiduidadePage() {
  const [registros, setRegistros] = useState<RegistroAssiduidade[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setRegistros(AssiduidadeStorage.getRegistros());
    setColaboradores(ColaboradorStorage.getColaboradores());
  };

  const getColaboradorNome = (colaboradorId: string) => {
    const colaborador = colaboradores.find(c => c.id === colaboradorId);
    return colaborador?.nome || 'Desconhecido';
  };

  const getTipoBadge = (tipo: RegistroAssiduidade['tipo']) => {
    const variants: Record<RegistroAssiduidade['tipo'], { variant: any; label: string }> = {
      normal: { variant: 'default', label: 'Normal' },
      feriado: { variant: 'secondary', label: 'Feriado' },
      fim_semana: { variant: 'outline', label: 'Fim de Semana' },
      ferias: { variant: 'outline', label: 'Férias' },
      ausencia: { variant: 'destructive', label: 'Ausência' }
    };
    const config = variants[tipo];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const mediaHorasTrabalhadas = registros.length > 0
    ? (registros.reduce((acc, r) => acc + r.horasTrabalhadas, 0) / registros.length).toFixed(2)
    : '0.00';

  const totalHorasExtras = registros.reduce((acc, r) => acc + r.horasExtras, 0);
  const totalAtrasos = registros.reduce((acc, r) => acc + r.atrasos, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Controlo de Assiduidade</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhamento de presença e pontualidade
          </p>
        </div>
        <Button asChild>
          <Link href="/rh/assiduidade/novo">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registos Hoje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {registros.filter(r => r.data === new Date().toISOString().split('T')[0]).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média Horas/Dia</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mediaHorasTrabalhadas}h</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Horas Extras</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHorasExtras}h</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Atrasos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAtrasos} min</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registos de Assiduidade</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Horas Trabalhadas</TableHead>
                <TableHead>Horas Extras</TableHead>
                <TableHead>Atrasos</TableHead>
                <TableHead>Tipo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum registo de assiduidade encontrado
                  </TableCell>
                </TableRow>
              ) : (
                registros.slice(0, 50).map((registro) => (
                  <TableRow key={registro.id}>
                    <TableCell>{new Date(registro.data).toLocaleDateString('pt-PT')}</TableCell>
                    <TableCell className="font-medium">{getColaboradorNome(registro.colaboradorId)}</TableCell>
                    <TableCell>{registro.entrada}</TableCell>
                    <TableCell>{registro.saida}</TableCell>
                    <TableCell>{registro.horasTrabalhadas}h</TableCell>
                    <TableCell>{registro.horasExtras > 0 ? `${registro.horasExtras}h` : '-'}</TableCell>
                    <TableCell>{registro.atrasos > 0 ? `${registro.atrasos} min` : '-'}</TableCell>
                    <TableCell>{getTipoBadge(registro.tipo)}</TableCell>
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
