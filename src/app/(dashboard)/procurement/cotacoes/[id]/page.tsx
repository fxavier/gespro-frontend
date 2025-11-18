import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { cotacoesMock } from '@/data/cotacoes';
import type { Cotacao, RespostaFornecedor } from '@/types/procurement';
import {
  ArrowLeft,
  Calendar,
  ClipboardList,
  CheckCircle,
  Building2,
  DollarSign,
  Award,
  PackageSearch
} from 'lucide-react';

interface PageProps {
  params: { id: string };
}

const statusConfig = {
  rascunho: { label: 'Rascunho', variant: 'secondary' },
  enviada: { label: 'Enviada', variant: 'default' },
  respondida: { label: 'Respondida', variant: 'default' },
  vencida: { label: 'Vencida', variant: 'destructive' },
  cancelada: { label: 'Cancelada', variant: 'secondary' }
} as const;

const formatCurrency = (valor?: number | null) => {
  if (valor === undefined || valor === null) return '-';
  return `MT ${valor.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`;
};

const formatDate = (date?: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-MZ');
};

const formatDateTime = (date?: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('pt-MZ');
};

const getMelhorOferta = (cotacao: Cotacao) => {
  const valores = cotacao.fornecedores
    .map((fornecedor) => fornecedor.valorTotal)
    .filter((valor): valor is number => typeof valor === 'number');
  if (!valores.length) return null;
  return Math.min(...valores);
};

const getRespostaVencedora = (cotacao: Cotacao, resposta: RespostaFornecedor) => {
  if (!cotacao.vencedorId) return false;
  return resposta.fornecedorId === cotacao.vencedorId;
};

export default function CotacaoDetalhePage({ params }: PageProps) {
  const cotacao = cotacoesMock.find((cot) => cot.id === params.id);

  if (!cotacao) {
    notFound();
  }

  const status = statusConfig[cotacao.status as keyof typeof statusConfig];
  const totalFornecedores = cotacao.fornecedores.length;
  const respostasRecebidas = cotacao.fornecedores.filter((f) => f.status === 'respondida').length;
  const melhorOferta = getMelhorOferta(cotacao);

  const obterNomeFornecedor = (fornecedorId: string) =>
    cotacao.fornecedores.find((f) => f.fornecedorId === fornecedorId)?.fornecedorNome || fornecedorId;

  const obterMelhorRespostaItem = (respostas: RespostaFornecedor[]) => {
    if (!respostas.length) return null;
    return respostas.reduce((melhor, atual) =>
      atual.precoUnitario < melhor.precoUnitario ? atual : melhor
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/procurement/cotacoes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">{cotacao.numero}</h1>
            <Badge variant={(status?.variant ?? 'secondary') as any} className="uppercase">
              {status?.label ?? cotacao.status}
            </Badge>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1 ml-10">
            Detalhes completos da cotação
          </p>
        </div>
        {cotacao.vencedorId && (
          <Badge className="flex items-center space-x-2 bg-emerald-600">
            <Award className="h-4 w-4" />
            <span>Fornecedor vencedor: {obterNomeFornecedor(cotacao.vencedorId)}</span>
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <ClipboardList className="h-5 w-5" />
              <span>Informações Gerais</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Número</p>
                <p className="font-medium">{cotacao.numero}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Requisição Vinculada</p>
                {cotacao.requisicaoCompraId ? (
                  <Link
                    href={`/procurement/requisicoes/${cotacao.requisicaoCompraId}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {cotacao.requisicaoCompraId}
                  </Link>
                ) : (
                  <p className="text-gray-500">Não vinculada</p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">Data de Emissão</p>
                <p className="font-medium">{formatDate(cotacao.data)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Validade da Oferta</p>
                <p className="font-medium">{formatDate(cotacao.dataValidade)}</p>
              </div>
            </div>
            {cotacao.observacoes && (
              <div>
                <Separator className="my-2" />
                <p className="text-sm text-gray-500">Observações</p>
                <p className="text-gray-800 dark:text-gray-200">{cotacao.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <PackageSearch className="h-5 w-5" />
              <span>Resumo da Cotação</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-gray-500">Itens Cotados</p>
                <p className="text-2xl font-bold">{cotacao.itens.length}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-gray-500">Fornecedores Convidados</p>
                <p className="text-2xl font-bold">{totalFornecedores}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-gray-500">Respostas Recebidas</p>
                <p className="text-2xl font-bold">{respostasRecebidas}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-gray-500">Melhor Oferta</p>
                <p className="text-2xl font-bold">{formatCurrency(melhorOferta)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>Fornecedores</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead>Prazo (dias)</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Condições de Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotacao.fornecedores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500">
                    Nenhum fornecedor adicionado.
                  </TableCell>
                </TableRow>
              )}
              {cotacao.fornecedores.map((fornecedor) => (
                <TableRow key={fornecedor.fornecedorId}>
                  <TableCell className="font-medium">{fornecedor.fornecedorNome}</TableCell>
                  <TableCell>
                    <Badge variant={fornecedor.status === 'respondida' ? 'default' : 'secondary'}>
                      {fornecedor.status.charAt(0).toUpperCase() + fornecedor.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(fornecedor.dataEnvio)}</TableCell>
                  <TableCell>{formatDateTime(fornecedor.dataResposta)}</TableCell>
                  <TableCell>{fornecedor.prazoEntrega ? `${fornecedor.prazoEntrega}` : '-'}</TableCell>
                  <TableCell>{formatCurrency(fornecedor.valorTotal)}</TableCell>
                  <TableCell>{fornecedor.condicoesPagamento || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5" />
            <span>Itens Cotados</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cotacao.itens.map((item) => {
            const melhorResposta = obterMelhorRespostaItem(item.respostas);

            return (
              <div key={item.id} className="border rounded-lg">
                <div className="p-4 bg-muted/40 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Descrição</p>
                    <p className="font-semibold">{item.descricao}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Quantidade</p>
                    <p className="font-semibold">{item.quantidade} {item.unidadeMedida}</p>
                  </div>
                  {item.especificacoes && (
                    <div className="max-w-md">
                      <p className="text-sm text-gray-500">Especificações</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{item.especificacoes}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Melhor Preço</p>
                    <p className="font-semibold">
                      {melhorResposta ? formatCurrency(melhorResposta.precoUnitario) : '-'}
                    </p>
                    {melhorResposta && (
                      <p className="text-xs text-gray-500">
                        {obterNomeFornecedor(melhorResposta.fornecedorId)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Preço Unitário</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead>Prazo</TableHead>
                        <TableHead>Marca / Observações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.respostas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-gray-500">
                            Aguardando respostas para este item.
                          </TableCell>
                        </TableRow>
                      )}
                      {item.respostas.map((resposta) => (
                        <TableRow key={`${item.id}-${resposta.fornecedorId}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center space-x-2">
                              {getRespostaVencedora(cotacao, resposta) && (
                                <CheckCircle className="h-4 w-4 text-emerald-500" />
                              )}
                              <span>{obterNomeFornecedor(resposta.fornecedorId)}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatCurrency(resposta.precoUnitario)}</TableCell>
                          <TableCell>{formatCurrency(resposta.subtotal)}</TableCell>
                          <TableCell>{resposta.prazoEntrega ? `${resposta.prazoEntrega} dias` : '-'}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {resposta.marca && <p className="font-medium">{resposta.marca}</p>}
                              {resposta.observacoes && <p className="text-gray-500">{resposta.observacoes}</p>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Auditoria</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Criada em</p>
            <p className="font-medium">{formatDateTime(cotacao.dataCriacao)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Última atualização</p>
            <p className="font-medium">{formatDateTime(cotacao.dataAtualizacao)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
