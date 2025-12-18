'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, ListChecks, Beaker, ShieldCheck } from 'lucide-react';

const checklists = [
  { id: 'cl1', nome: 'Checklist de entrega', dono: 'QA', status: 'em_andamento', progresso: 70 },
  { id: 'cl2', nome: 'Revisão de requisitos', dono: 'PO', status: 'concluido', progresso: 100 },
  { id: 'cl3', nome: 'Preparação de testes', dono: 'QA', status: 'pendente', progresso: 15 },
];

const testes = [
  { id: 't1', tipo: 'Unitário', execucoes: 240, sucesso: 231 },
  { id: 't2', tipo: 'Integrado', execucoes: 98, sucesso: 90 },
  { id: 't3', tipo: 'E2E', execucoes: 45, sucesso: 37 },
];

export default function QualidadePage() {
  const coberturaMedia = Math.round(
    testes.reduce((acc, t) => acc + (t.sucesso / Math.max(t.execucoes, 1)) * 100, 0) / testes.length
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return <Badge>Concluído</Badge>;
      case 'em_andamento':
        return <Badge variant="secondary">Em andamento</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Qualidade do Projeto</h1>
          <p className="text-muted-foreground mt-1">
            Planos de teste, checklists e indicadores de qualidade.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="h-4 w-4" />
          Cobertura média {coberturaMedia}%
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Beaker className="h-4 w-4" />
              Execuções de teste
            </p>
            <p className="text-3xl font-bold">
              {testes.reduce((acc, t) => acc + t.execucoes, 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Taxa de sucesso
            </p>
            <p className="text-3xl font-bold">{coberturaMedia}%</p>
            <Progress value={coberturaMedia} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Checklists ativos
            </p>
            <p className="text-3xl font-bold">{checklists.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Checklists de qualidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {checklists.map((cl) => (
            <div key={cl.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{cl.nome}</p>
                  <p className="text-xs text-muted-foreground">Responsável: {cl.dono}</p>
                </div>
                {statusBadge(cl.status)}
              </div>
              <Progress value={cl.progresso} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultados de testes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Execuções</TableHead>
                  <TableHead>Sucesso</TableHead>
                  <TableHead>Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testes.map((t) => {
                  const taxa = Math.round((t.sucesso / Math.max(t.execucoes, 1)) * 100);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.tipo}</TableCell>
                      <TableCell>{t.execucoes}</TableCell>
                      <TableCell>{t.sucesso}</TableCell>
                      <TableCell>
                        <Badge variant={taxa >= 90 ? 'default' : taxa >= 70 ? 'secondary' : 'destructive'}>
                          {taxa}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
