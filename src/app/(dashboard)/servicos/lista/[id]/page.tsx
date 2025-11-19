'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  ShieldCheck,
  Star,
  Tag,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { ServicoStorage, AgendamentoServicoStorage } from '@/lib/storage/servico-storage';
import type { Servico, AgendamentoServico } from '@/types/servico';
import { formatCurrency } from '@/lib/format-currency';

const diaSemanaLabels: Record<string, string> = {
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

const tipoServicoLabels: Record<Servico['tipoServico'], string> = {
  instalacao: 'Instalação',
  manutencao: 'Manutenção',
  reparacao: 'Reparação',
  consultoria: 'Consultoria',
  limpeza: 'Limpeza',
  transporte: 'Transporte',
  outro: 'Outro',
};

const nivelTecnicoLabels: Record<Exclude<Servico['nivelTecnicoRequerido'], undefined>, string> = {
  basico: 'Básico',
  intermediario: 'Intermédio',
  avancado: 'Avançado',
};

const statusAgendamentoLabels: Record<AgendamentoServico['status'], string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
};

const statusAgendamentoStyles: Record<AgendamentoServico['status'], string> = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmado: 'bg-blue-100 text-blue-800 border-blue-200',
  em_andamento: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  concluido: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  cancelado: 'bg-red-100 text-red-800 border-red-200',
  nao_compareceu: 'bg-orange-100 text-orange-800 border-orange-200',
};

const formatarDuracao = (minutos: number) => {
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  if (horas > 0) {
    return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
  }
  return `${mins}min`;
};

export default function DetalhesServicoPage() {
  const params = useParams();
  const router = useRouter();
  const [servico, setServico] = useState<Servico | null>(null);
  const [agendamentos, setAgendamentos] = useState<AgendamentoServico[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const servicoId = useMemo(() => {
    if (!params?.id) return null;
    return Array.isArray(params.id) ? params.id[0] : (params.id as string);
  }, [params]);

  useEffect(() => {
    if (!servicoId) {
      setIsLoading(false);
      return;
    }

    const dadosServico = ServicoStorage.getServicoById(servicoId);
    setServico(dadosServico);

    if (dadosServico) {
      const agds = AgendamentoServicoStorage.getAgendamentos()
        .filter((agendamento) => agendamento.servicoId === dadosServico.id)
        .sort((a, b) => new Date(a.dataAgendamento).getTime() - new Date(b.dataAgendamento).getTime());
      setAgendamentos(agds);
    }

    setIsLoading(false);
  }, [servicoId]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-10 w-32 rounded bg-muted animate-pulse" />
        <div className="h-40 rounded bg-muted animate-pulse" />
        <div className="h-80 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (!servico) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Serviço não encontrado
            </CardTitle>
            <CardDescription>O serviço solicitado não existe ou foi removido.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/servicos/lista">Regressar à lista de serviços</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const diasDisponiveis = servico.diasDisponibilidade.map((dia) => diaSemanaLabels[dia] || dia);

  return (
    <div className="space-y-6 p-6">
      <Button variant="ghost" onClick={() => router.back()} className="w-fit">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar
      </Button>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-3xl">{servico.nome}</CardTitle>
                <Badge variant="outline">{servico.categoria}</Badge>
                <Badge variant="outline" className={servico.ativo ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}>
                  {servico.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <CardDescription className="mt-2 text-base">Código: {servico.codigo}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/servicos/lista">Lista de Serviços</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/servicos/agendamentos">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Agendamentos
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/servicos/lista/${servico.id}/editar`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar Serviço
                </Link>
              </Button>
            </div>
          </div>
          {servico.descricao && <p className="text-muted-foreground">{servico.descricao}</p>}
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Preço base</p>
                <p className="text-2xl font-bold">{formatCurrency(servico.preco)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Min: {formatCurrency(servico.precoMinimo || servico.preco)} · Máx: {formatCurrency(servico.precoMaximo || servico.preco)}
                </p>
              </div>
              <DollarSign className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Duração estimada</p>
                <p className="text-2xl font-bold">{formatarDuracao(servico.duracaoEstimada)}</p>
              </div>
              <Clock className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa IVA</p>
                <p className="text-2xl font-bold">{servico.taxaIva}%</p>
                <p className="text-xs text-muted-foreground mt-1">{servico.unidadeMedida}</p>
              </div>
              <Tag className="h-10 w-10 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Desempenho</p>
                <p className="text-2xl font-bold">{servico.totalVendas} vendas</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(servico.faturamentoTotal)} faturados
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhes operacionais</CardTitle>
            <CardDescription>Informações sobre execução, materiais e requisitos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Tipo de serviço</p>
                <p className="font-medium">{tipoServicoLabels[servico.tipoServico]}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Requer técnico</p>
                <div className="flex items-center gap-2">
                  {servico.requerTecnico ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="font-medium">
                        Sim {servico.nivelTecnicoRequerido && `· ${nivelTecnicoLabels[servico.nivelTecnicoRequerido]}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Não</span>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Inclui material</p>
                <div className="flex items-center gap-2">
                  {servico.incluiMaterial ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Sim</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Não</span>
                    </>
                  )}
                </div>
                {servico.incluiMaterial && servico.materialIncluido && (
                  <p className="text-sm text-muted-foreground">{servico.materialIncluido}</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Requer agendamento</p>
                <div className="flex items-center gap-2">
                  {servico.requerAgendamento ? (
                    <>
                      <CalendarClock className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Sim</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Não</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {servico.observacoes && (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                {servico.observacoes}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feedback & disponibilidade</CardTitle>
            <CardDescription>Métricas de qualidade e agenda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avaliação média</p>
                <p className="text-2xl font-bold flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  {servico.avaliacaoMedia?.toFixed(1) ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">{servico.numeroAvaliacoes || 0} avaliações</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Última venda</p>
                <p className="text-xl font-semibold">
                  {servico.ultimaVenda ? new Date(servico.ultimaVenda).toLocaleDateString('pt-PT') : '—'}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Dias disponíveis</p>
              <div className="flex flex-wrap gap-2">
                {diasDisponiveis.map((dia) => (
                  <Badge key={dia} variant="secondary">
                    {dia}
                  </Badge>
                ))}
              </div>
            </div>

            {(servico.horaInicio || servico.horaFim) && (
              <div className="text-sm text-muted-foreground">
                Horário: {servico.horaInicio ?? '--:--'} - {servico.horaFim ?? '--:--'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agendamentos deste serviço</CardTitle>
          <CardDescription>Visão dos próximos atendimentos ligados a este serviço.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agendamentos.map((agendamento) => (
                  <TableRow key={agendamento.id}>
                    <TableCell>
                      <div className="font-medium">
                        {new Date(agendamento.dataAgendamento).toLocaleDateString('pt-PT')}
                      </div>
                      <div className="text-xs text-muted-foreground">{agendamento.codigo}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{agendamento.clienteNome}</div>
                      <div className="text-xs text-muted-foreground">{agendamento.clienteTelefone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusAgendamentoStyles[agendamento.status]}>
                        {statusAgendamentoLabels[agendamento.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {agendamento.horaInicio} - {agendamento.horaFim}
                    </TableCell>
                    <TableCell>{agendamento.tecnicoNome || '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(agendamento.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {agendamentos.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarClock className="mx-auto h-12 w-12 mb-3 opacity-60" />
              <p>Não existem agendamentos registados para este serviço.</p>
              <Button variant="outline" asChild className="mt-4">
                <Link href="/servicos/agendamentos">Gerir Agendamentos</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


