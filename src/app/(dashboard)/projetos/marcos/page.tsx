'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Flag, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

const marcos = [
  { id: 'm1', nome: 'Kickoff aprovado', dataPrevista: '2024-02-05', dataReal: '2024-02-04', status: 'concluido', progresso: 100 },
  { id: 'm2', nome: 'MVP entregue', dataPrevista: '2024-02-28', dataReal: undefined, status: 'em_andamento', progresso: 60 },
  { id: 'm3', nome: 'Homologação', dataPrevista: '2024-03-15', dataReal: undefined, status: 'pendente', progresso: 20 },
  { id: 'm4', nome: 'Go-live', dataPrevista: '2024-03-30', dataReal: undefined, status: 'pendente', progresso: 10 },
];

const statusBadge = (status: string) => {
  switch (status) {
    case 'concluido':
      return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Concluído</Badge>;
    case 'em_andamento':
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Em andamento</Badge>;
    default:
      return <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" /> Pendente</Badge>;
  }
};

export default function MarcosPage() {
  const totalConcluidos = marcos.filter((m) => m.status === 'concluido').length;
  const percentual = Math.round((totalConcluidos / marcos.length) * 100);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marcos e Milestones</h1>
          <p className="text-muted-foreground mt-1">Acompanhe os marcos-chave do projeto.</p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Flag className="h-4 w-4" />
          {percentual}% concluído
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marco</TableHead>
                  <TableHead>Previsto</TableHead>
                  <TableHead>Real</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progresso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marcos.map((marco) => (
                  <TableRow key={marco.id}>
                    <TableCell className="font-medium">{marco.nome}</TableCell>
                    <TableCell>{new Date(marco.dataPrevista).toLocaleDateString('pt-MZ')}</TableCell>
                    <TableCell>
                      {marco.dataReal ? new Date(marco.dataReal).toLocaleDateString('pt-MZ') : '-'}
                    </TableCell>
                    <TableCell>{statusBadge(marco.status)}</TableCell>
                    <TableCell className="min-w-[160px]">
                      <Progress value={marco.progresso} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
