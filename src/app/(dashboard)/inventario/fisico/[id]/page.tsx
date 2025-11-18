import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { inventariosFisicosMock } from '@/data/inventarios-fisicos';
import type { InventarioFisico } from '@/types/inventario';
import {
  ArrowLeft,
  ClipboardList,
  Calendar,
  MapPin,
  Users,
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  StopCircle,
  RefreshCw,
  FileText,
  BarChart3,
  Activity
} from 'lucide-react';

const statusConfig: Record<InventarioFisico['status'], { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: React.ComponentType<{ className?: string }> }> = {
  agendado: { label: 'Agendado', variant: 'secondary', icon: Calendar },
  em_andamento: { label: 'Em andamento', variant: 'default', icon: RefreshCw },
  concluido: { label: 'Concluído', variant: 'default', icon: CheckCircle },
  cancelado: { label: 'Cancelado', variant: 'destructive', icon: StopCircle }
};

const formatDate = (value?: Date | string) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('pt-MZ');
};

interface PageProps {
  params: { id: string };
}

export default function InventarioFisicoDetalhePage({ params }: PageProps) {
  const inventario = inventariosFisicosMock.find((item) => item.id === params.id);

  if (!inventario) {
    notFound();
  }

  const statusInfo = statusConfig[inventario.status];
  const progresso = Math.round((inventario.itensContados / inventario.totalItens) * 100);

  const divergencias = inventario.divergenciasEncontradas
    ? Array.from({ length: inventario.divergenciasEncontradas }).map((_, index) => ({
        id: `DIV-${inventario.codigo}-${index + 1}`,
        descricao: 'Item divergente identificado durante a contagem',
        responsavel: inventario.responsavelNome,
        status: index % 2 === 0 ? 'Resolvida' : 'Em análise'
      }))
    : [];

  const tarefas = [
    { etapa: 'Planeamento', responsavel: inventario.responsavelNome, status: 'Concluído', data: inventario.dataInicio },
    {
      etapa: 'Contagem física',
      responsavel: 'Equipa de Inventário',
      status: inventario.status === 'concluido' ? 'Concluído' : inventario.status === 'agendado' ? 'Pendente' : 'Em andamento',
      data: inventario.dataInicio
    },
    {
      etapa: 'Análise de divergências',
      responsavel: 'Controladoria',
      status: inventario.status === 'concluido' ? 'Concluído' : 'Pendente',
      data: inventario.dataPrevistaConclusao
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventario/fisico">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">{inventario.titulo}</h1>
            <Badge variant={statusInfo.variant} className="flex items-center gap-1">
              <statusInfo.icon className="h-4 w-4" />
              {statusInfo.label}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 ml-12">Código {inventario.codigo}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Gerar Relatório
          </Button>
          <Button variant="outline">
            <BarChart3 className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Progresso</p>
            <p className="text-2xl font-bold">{progresso}%</p>
            <Progress value={progresso} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Itens contados</p>
            <p className="text-2xl font-bold">{inventario.itensContados}/{inventario.totalItens}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Itens pendentes</p>
            <p className="text-2xl font-bold">{inventario.itensPendentes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Divergências</p>
            <p className="text-2xl font-bold">{inventario.divergenciasEncontradas}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Informações Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Descrição</p>
                <p>{inventario.descricao}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Localização</p>
                <p className="font-semibold">{inventario.localizacaoNome}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p className="font-semibold">{inventario.responsavelNome}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Data prevista</p>
                  <p className="font-semibold">{formatDate(inventario.dataPrevistaConclusao)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Cronograma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarefas.map((tarefa) => (
                  <TableRow key={tarefa.etapa}>
                    <TableCell className="font-medium">{tarefa.etapa}</TableCell>
                    <TableCell>{tarefa.responsavel}</TableCell>
                    <TableCell>
                      <Badge variant={tarefa.status === 'Concluído' ? 'default' : tarefa.status === 'Em andamento' ? 'secondary' : 'outline'}>
                        {tarefa.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(tarefa.data)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Divergências
          </CardTitle>
        </CardHeader>
        <CardContent>
          {divergencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma divergência registada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {divergencias.map((div) => (
                  <TableRow key={div.id}>
                    <TableCell className="font-medium">{div.id}</TableCell>
                    <TableCell>{div.descricao}</TableCell>
                    <TableCell>
                      <Badge variant={div.status === 'Resolvida' ? 'default' : 'secondary'}>{div.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {inventario.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{inventario.observacoes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
