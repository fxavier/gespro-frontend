import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { movimentacoesMock } from '@/data/movimentacoes';
import type { MovimentacaoAtivo } from '@/types/inventario';
import {
  ArrowLeft,
  ArrowRightLeft,
  MapPin,
  User,
  Calendar,
  ClipboardList,
  FileText,
  AlertCircle,
  CheckCircle,
  Truck,
  Package,
  Printer,
  Download
} from 'lucide-react';

const tipoConfig: Record<MovimentacaoAtivo['tipo'], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  entrada: { label: 'Entrada', icon: Package },
  saida: { label: 'Saída', icon: Download },
  transferencia: { label: 'Transferência', icon: ArrowRightLeft },
  emprestimo: { label: 'Empréstimo', icon: ClipboardList },
  devolucao: { label: 'Devolução', icon: Printer },
  baixa: { label: 'Baixa', icon: AlertCircle },
  ajuste: { label: 'Ajuste', icon: CheckCircle }
};

const formatDateTime = (value?: Date | string) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('pt-MZ');
};

interface PageProps {
  params: { id: string };
}

export default function MovimentacaoDetalhePage({ params }: PageProps) {
  const movimentacao = movimentacoesMock.find((item) => item.id === params.id);

  if (!movimentacao) {
    notFound();
  }

  const tipoInfo = tipoConfig[movimentacao.tipo];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/inventario/movimentacoes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">Movimentação {movimentacao.guiaMovimentacao ?? `#${movimentacao.id}`}</h1>
            <Badge variant={movimentacao.confirmada ? 'default' : 'secondary'} className="flex items-center gap-1">
              {movimentacao.confirmada ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {movimentacao.confirmada ? 'Confirmada' : 'Pendente'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 ml-12">{tipoInfo.label} do ativo {movimentacao.ativoNome}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Gerar guia
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Ativo movimentado</p>
            <p className="text-xl font-semibold">{movimentacao.ativoNome}</p>
            <p className="text-sm text-muted-foreground">ID #{movimentacao.ativoId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Data da movimentação</p>
              <p className="text-lg font-semibold">{formatDateTime(movimentacao.dataMovimentacao)}</p>
            </div>
            <Calendar className="h-6 w-6 text-blue-600" />
          </CardContent>
        </Card>
        {movimentacao.dataPrevisaoDevolucao && (
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Previsão de devolução</p>
                <p className="text-lg font-semibold">{formatDateTime(movimentacao.dataPrevisaoDevolucao)}</p>
              </div>
              <Truck className="h-6 w-6 text-emerald-600" />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Origens e Destinos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Origem</p>
                <p className="font-semibold">{movimentacao.localizacaoOrigemNome ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Destino</p>
                <p className="font-semibold">{movimentacao.localizacaoDestinoNome ?? '-'}</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Responsável origem</p>
                  <p className="font-semibold">{movimentacao.responsavelOrigemNome ?? '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Responsável destino</p>
                  <p className="font-semibold">{movimentacao.responsavelDestinoNome ?? '-'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Informações da Movimentação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tipo</span>
              <div className="flex items-center gap-2">
                <tipoInfo.icon className="h-4 w-4" />
                <span className="font-semibold">{tipoInfo.label}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Guia de movimentação</span>
              <span className="font-semibold">{movimentacao.guiaMovimentacao ?? '-'}</span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Motivo</p>
              <p>{movimentacao.motivo}</p>
            </div>
            {movimentacao.observacoes && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Observações</p>
                <p>{movimentacao.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria e Confirmação</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Criado por</p>
            <p className="font-semibold">{movimentacao.criadoPor}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(movimentacao.criadoEm)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Responsável pela confirmação</p>
            <p className="font-semibold">{movimentacao.confirmdadaPor ?? '-'}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(movimentacao.dataConfirmacao)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={movimentacao.confirmada ? 'default' : 'secondary'}>
              {movimentacao.confirmada ? 'Confirmada' : 'Pendente'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
