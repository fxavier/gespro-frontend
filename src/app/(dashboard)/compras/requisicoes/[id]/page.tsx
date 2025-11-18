import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  History,
  MessageSquare,
  Package,
  TrendingUp,
  User,
  XCircle
} from 'lucide-react';
import { requisicoesComprasMock } from '@/data/requisicoes-compras';

const obterCorStatus = (status: string) => {
  const cores = {
    rascunho: 'secondary',
    pendente: 'outline',
    em_aprovacao: 'default',
    aprovada: 'default',
    rejeitada: 'destructive',
    cancelada: 'secondary',
    convertida: 'default'
  } as const;

  return cores[status as keyof typeof cores] || 'outline';
};

const obterIconeStatus = (status: string) => {
  const icones = {
    rascunho: FileText,
    pendente: Clock,
    em_aprovacao: AlertCircle,
    aprovada: CheckCircle,
    rejeitada: XCircle,
    cancelada: XCircle,
    convertida: TrendingUp
  } as const;

  const Icone = icones[status as keyof typeof icones] || Clock;
  return <Icone className="h-4 w-4 mr-1" />;
};

const obterCorPrioridade = (prioridade: string) => {
  const cores = {
    baixa: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    media: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    alta: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    urgente: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  } as const;

  return cores[prioridade as keyof typeof cores] || 'bg-gray-100 text-gray-800';
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ComprasRequisicaoDetalhePage({ params }: PageProps) {
  const { id } = await params;
  const requisicao = requisicoesComprasMock.find((req) => req.id === id);

  if (!requisicao) {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Button asChild variant="ghost" size="sm" className="px-2">
              <Link href="/compras/requisicoes" className="flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <span>•</span>
            <span>Registada em {new Date(requisicao.data).toLocaleDateString('pt-MZ')}</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            Requisição {requisicao.numero}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Detalhes completos da solicitação de compra
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant={obterCorStatus(requisicao.status) as any} className="flex items-center">
            {obterIconeStatus(requisicao.status)}
            {requisicao.status.replace('_', ' ').charAt(0).toUpperCase() + requisicao.status.replace('_', ' ').slice(1)}
          </Badge>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Valor Total</p>
            <p className="text-2xl font-bold text-green-600">
              MT {requisicao.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <User className="h-10 w-10 rounded-full bg-blue-100 p-2 text-blue-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Solicitante</p>
              <p className="font-semibold">{requisicao.solicitante}</p>
              <p className="text-sm text-gray-500">{requisicao.departamento}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Building2 className="h-10 w-10 rounded-full bg-purple-100 p-2 text-purple-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Centro de Custo</p>
              <p className="font-semibold">{requisicao.centroCusto || '—'}</p>
              <p className="text-sm text-gray-500">Departamento {requisicao.departamento}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Calendar className="h-10 w-10 rounded-full bg-emerald-100 p-2 text-emerald-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Entrega Desejada</p>
              <p className="font-semibold">
                {new Date(requisicao.dataEntregaDesejada).toLocaleDateString('pt-MZ')}
              </p>
              <p className="text-sm text-gray-500">{requisicao.itens} itens</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <DollarSign className="h-10 w-10 rounded-full bg-orange-100 p-2 text-orange-600" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Etapa de Aprovação</p>
              <p className="font-semibold">
                {requisicao.nivelAprovacao}/{requisicao.totalNiveis} níveis
              </p>
              <Badge className={obterCorPrioridade(requisicao.prioridade)}>
                {requisicao.prioridade.charAt(0).toUpperCase() + requisicao.prioridade.slice(1)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informações Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Número</p>
                <p className="font-semibold">{requisicao.numero}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Data da Solicitação</p>
                <p className="font-semibold">
                  {new Date(requisicao.data).toLocaleDateString('pt-MZ')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Departamento</p>
                <p className="font-semibold">{requisicao.departamento}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Situação</p>
                <Badge variant={obterCorStatus(requisicao.status) as any} className="mt-1">
                  {requisicao.status.replace('_', ' ').charAt(0).toUpperCase() +
                    requisicao.status.replace('_', ' ').slice(1)}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Justificativa e Observações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Justificativa</p>
              <p className="text-gray-900 dark:text-gray-100">{requisicao.justificativa}</p>
            </div>
            {requisicao.observacoes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Observações</p>
                  <p className="text-gray-900 dark:text-gray-100">{requisicao.observacoes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Itens da Requisição ({requisicao.itensDetalhados.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Quantidade</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Preço Estimado</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisicao.itensDetalhados.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.descricao}</TableCell>
                    <TableCell>{item.quantidade}</TableCell>
                    <TableCell>{item.unidade}</TableCell>
                    <TableCell>MT {item.precoEstimado.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="font-semibold">
                      MT {item.subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {item.observacoes || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="rounded-lg bg-gray-50 p-4 text-right dark:bg-gray-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Valor Total</p>
              <p className="text-2xl font-bold">
                MT {requisicao.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {requisicao.aprovacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Aprovações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requisicao.aprovacoes.map((aprovacao) => (
              <div key={aprovacao.id} className="flex items-start gap-4 rounded-lg border p-4">
                <div className="flex-shrink-0">
                  {aprovacao.status === 'aprovado' && <CheckCircle className="h-6 w-6 text-green-600" />}
                  {aprovacao.status === 'rejeitado' && <XCircle className="h-6 w-6 text-red-600" />}
                  {aprovacao.status === 'pendente' && <Clock className="h-6 w-6 text-yellow-600" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">Nível {aprovacao.nivel}</p>
                    <span className="text-sm text-gray-500">{aprovacao.aprovador} · {aprovacao.cargo}</span>
                    <Badge variant="outline" className="ml-auto">
                      {aprovacao.status === 'pendente' && 'Pendente'}
                      {aprovacao.status === 'aprovado' && 'Aprovado'}
                      {aprovacao.status === 'rejeitado' && 'Rejeitado'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {aprovacao.data
                      ? new Date(aprovacao.data).toLocaleDateString('pt-MZ', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      : 'Sem data registrada'}
                  </div>
                  {aprovacao.observacoes && (
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{aprovacao.observacoes}</p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
