'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { manutencoesMock } from '@/data/manutencoes';
import type { ManutencaoAtivo } from '@/types/inventario';
import {
  ArrowLeft,
  Wrench,
  Calendar,
  DollarSign,
  User,
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  XCircle,
  FileText,
  MessageSquare,
  Timer,
  Package
} from 'lucide-react';

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  agendada: { label: 'Agendada', variant: 'secondary' },
  em_andamento: { label: 'Em andamento', variant: 'default' },
  em_curso: { label: 'Em andamento', variant: 'default' },
  concluida: { label: 'Concluída', variant: 'default' },
  concluido: { label: 'Concluída', variant: 'default' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
  orcamento: { label: 'Em orçamento', variant: 'outline' }
};

const prioridadeColors: Record<string, string> = {
  baixa: 'bg-emerald-100 text-emerald-800',
  media: 'bg-blue-100 text-blue-800',
  alta: 'bg-orange-100 text-orange-800',
  critica: 'bg-red-100 text-red-800'
};

const formatDate = (value?: Date | string) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('pt-MZ');
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManutencaoDetalhePage({ params }: PageProps) {
  const { id } = await params;
  const manutencao = manutencoesMock.find((item) => item.id === id);

  if (!manutencao) {
    notFound();
  }

  const statusInfo = statusLabels[manutencao.status] ?? { label: manutencao.status, variant: 'outline' };
  const prioridadeClass = prioridadeColors[manutencao.prioridade ?? 'media'] ?? 'bg-slate-100 text-slate-800';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventario/manutencao">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">{manutencao.titulo}</h1>
            <Badge className={prioridadeClass}>Prioridade {manutencao.prioridade}</Badge>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-12">Ativo: {manutencao.ativoNome}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Gerar relatório
          </Button>
          <Button variant="outline">
            <MessageSquare className="h-4 w-4 mr-2" />
            Enviar atualização
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Tipo</p>
            <p className="text-2xl font-bold capitalize">{manutencao.tipo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Data agendada</p>
              <p className="text-xl font-semibold">{formatDate(manutencao.dataAgendada)}</p>
            </div>
            <Calendar className="h-6 w-6 text-blue-600" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Custo estimado</p>
            <p className="text-2xl font-bold">{manutencao.custoEstimado ? `MT ${manutencao.custoEstimado.toLocaleString('pt-MZ')}` : '-'}</p>
            {manutencao.custoReal && (
              <p className="text-xs text-muted-foreground">Custo real: MT {manutencao.custoReal.toLocaleString('pt-MZ')}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Responsável</p>
            <p className="text-xl font-semibold">{manutencao.responsavelNome}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Descrição da Manutenção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Resumo</p>
              <p>{manutencao.descricao}</p>
            </div>
            {manutencao.observacoes && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Observações</p>
                <p>{manutencao.observacoes}</p>
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Ativo</p>
                  <p className="font-semibold">{manutencao.ativoNome}</p>
                </div>
              </div>
              {manutencao.fornecedorNome && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-teal-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Fornecedor</p>
                    <p className="font-semibold">{manutencao.fornecedorNome}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Cronograma
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Início</span>
              <span className="font-semibold">{formatDate(manutencao.dataInicio)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Conclusão</span>
              <span className="font-semibold">{formatDate(manutencao.dataConclusao)}</span>
            </div>
            {manutencao.proximaManutencao && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Próxima manutenção</span>
                <span className="font-semibold">{formatDate(manutencao.proximaManutencao)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {manutencao.relatorio && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Relatório final
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{manutencao.relatorio}</p>
          </CardContent>
        </Card>
      )}

      {manutencao.motivoCancelamento && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Motivo do cancelamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{manutencao.motivoCancelamento}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
