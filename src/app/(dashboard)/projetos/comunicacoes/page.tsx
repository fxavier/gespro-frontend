'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Calendar, MessageSquare, PhoneCall, Video, Mail } from 'lucide-react';

const reunioes = [
  {
    id: 'reuniao-1',
    titulo: 'Kickoff Projeto Aurora',
    data: '2024-02-10T10:00:00',
    canal: 'Videoconferência',
    responsavel: 'Maria Santos',
    status: 'agendado',
  },
  {
    id: 'reuniao-2',
    titulo: 'Revisão Sprint 12',
    data: '2024-02-12T15:00:00',
    canal: 'Sala 2A',
    responsavel: 'Carlos Mendes',
    status: 'confirmado',
  },
  {
    id: 'reuniao-3',
    titulo: 'Alinhamento Cliente XPTO',
    data: '2024-02-13T09:30:00',
    canal: 'Teams',
    responsavel: 'Ana Costa',
    status: 'pendente',
  },
];

const comunicados = [
  { id: 'c1', titulo: 'Entrega da versão beta concluída', autor: 'PMO', data: '2024-02-05', tipo: 'status' },
  { id: 'c2', titulo: 'Nova política de commits e code review', autor: 'Tech Lead', data: '2024-02-04', tipo: 'processo' },
  { id: 'c3', titulo: 'Janela de deploy restrita (quinta-feira)', autor: 'DevOps', data: '2024-02-03', tipo: 'aviso' },
];

const canais = [
  { nome: 'Reuniões', icone: Calendar, cor: 'text-blue-600', descricao: 'Planeje cerimônias e checkpoints' },
  { nome: 'Chat do time', icone: MessageSquare, cor: 'text-green-600', descricao: 'Atualizações rápidas e dúvidas' },
  { nome: 'Chamadas', icone: PhoneCall, cor: 'text-orange-600', descricao: 'Escaladas e alinhamentos urgentes' },
  { nome: 'Email', icone: Mail, cor: 'text-purple-600', descricao: 'Comunicações formais e atas' },
  { nome: 'Vídeo', icone: Video, cor: 'text-pink-600', descricao: 'Demonstrações e treinamentos' },
];

const statusBadge = (status: string) => {
  switch (status) {
    case 'confirmado':
      return <Badge>Confirmado</Badge>;
    case 'agendado':
      return <Badge variant="secondary">Agendado</Badge>;
    default:
      return <Badge variant="destructive">Pendente</Badge>;
  }
};

export default function ComunicacoesPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Comunicações do Projeto</h1>
        <p className="text-muted-foreground mt-1">
          Centralize reuniões, comunicados e canais oficiais do time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {canais.map((canal) => {
          const Icon = canal.icone;
          return (
            <Card key={canal.nome}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${canal.cor}`} />
                  <span className="font-semibold text-sm">{canal.nome}</span>
                </div>
                <p className="text-xs text-muted-foreground">{canal.descricao}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reuniões e Cerimônias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reunioes.map((reuniao) => (
                  <TableRow key={reuniao.id}>
                    <TableCell className="font-medium">{reuniao.titulo}</TableCell>
                    <TableCell>{new Date(reuniao.data).toLocaleString('pt-MZ')}</TableCell>
                    <TableCell>{reuniao.canal}</TableCell>
                    <TableCell>{reuniao.responsavel}</TableCell>
                    <TableCell>{statusBadge(reuniao.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle>Comunicados recentes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Divulgações internas e externas ligadas ao projeto.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {comunicados.map((c) => (
            <div key={c.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{c.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.autor} • {new Date(c.data).toLocaleDateString('pt-MZ')}
                  </p>
                </div>
                <Badge variant="secondary" className="uppercase">
                  {c.tipo}
                </Badge>
              </div>
              <Separator className="mt-3" />
            </div>
          ))}
          <div className="flex justify-end">
            <Button variant="outline" size="sm">
              Ver histórico completo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
