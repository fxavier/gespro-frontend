'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ShieldAlert, Activity, AlertTriangle } from 'lucide-react';

const riscos = [
  {
    id: 'r1',
    titulo: 'Atraso na entrega do fornecedor',
    categoria: 'Fornecedor',
    probabilidade: 0.6,
    impacto: 0.7,
    responsavel: 'Carlos Mendes',
    status: 'monitorar',
    plano: 'Contrato com multa e fornecedor backup',
  },
  {
    id: 'r2',
    titulo: 'Rotatividade da equipa',
    categoria: 'Pessoas',
    probabilidade: 0.4,
    impacto: 0.8,
    responsavel: 'Ana Costa',
    status: 'mitigar',
    plano: 'Plano de retenção e documentação contínua',
  },
  {
    id: 'r3',
    titulo: 'Falha crítica em produção',
    categoria: 'Tecnologia',
    probabilidade: 0.3,
    impacto: 0.9,
    responsavel: 'João Silva',
    status: 'mitigar',
    plano: 'Estratégia de rollback e testes automatizados',
  },
];

const calcularScore = (prob: number, impacto: number) => Math.round(prob * impacto * 100);

const statusVariant = (status: string) => {
  switch (status) {
    case 'mitigar':
      return { label: 'Mitigação', variant: 'default' as const };
    case 'monitorar':
      return { label: 'Monitorar', variant: 'secondary' as const };
    default:
      return { label: 'Ação imediata', variant: 'destructive' as const };
  }
};

export default function RiscosPage() {
  const riscoAlto = riscos.filter((r) => calcularScore(r.probabilidade, r.impacto) >= 60).length;
  const riscoMedio = riscos.filter((r) => {
    const s = calcularScore(r.probabilidade, r.impacto);
    return s >= 30 && s < 60;
  }).length;
  const riscoBaixo = riscos.length - riscoAlto - riscoMedio;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Riscos</h1>
          <p className="text-muted-foreground mt-1">
            Registo centralizado de riscos, plano de ação e responsáveis.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <ShieldAlert className="h-4 w-4" />
          {riscos.length} riscos ativos
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Riscos Altos
            </p>
            <p className="text-3xl font-bold text-red-600">{riscoAlto}</p>
            <Progress value={(riscoAlto / riscos.length) * 100} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              Riscos Médios
            </p>
            <p className="text-3xl font-bold text-amber-600">{riscoMedio}</p>
            <Progress value={(riscoMedio / riscos.length) * 100} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-green-600" />
              Riscos Baixos
            </p>
            <p className="text-3xl font-bold text-green-600">{riscoBaixo}</p>
            <Progress value={(riscoBaixo / riscos.length) * 100} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registo de riscos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Risco</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riscos.map((risco) => {
                  const score = calcularScore(risco.probabilidade, risco.impacto);
                  const badge = statusVariant(risco.status);
                  return (
                    <TableRow key={risco.id}>
                      <TableCell className="font-medium">{risco.titulo}</TableCell>
                      <TableCell>{risco.categoria}</TableCell>
                      <TableCell>
                        <Badge variant={score >= 60 ? 'destructive' : score >= 30 ? 'secondary' : 'default'}>
                          {score}%
                        </Badge>
                      </TableCell>
                      <TableCell>{risco.responsavel}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">{risco.plano}</TableCell>
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
