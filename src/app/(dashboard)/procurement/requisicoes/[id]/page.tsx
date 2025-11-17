
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  ArrowLeft,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  TrendingUp,
  User,
  Calendar,
  Package,
  DollarSign,
  Building2,
  MessageSquare,
  History
} from 'lucide-react';
import type { RequisicaoCompra } from '@/types/procurement';

export default function DetalhesRequisicaoPage() {
  const router = useRouter();
  const params = useParams();
  const [requisicao, setRequisicao] = useState<RequisicaoCompra | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarRequisicao();
  }, [params.id]);

  const carregarRequisicao = () => {
    try {
      const requisicoes = JSON.parse(localStorage.getItem('requisicoes') || '[]');
      const req = requisicoes.find((r: RequisicaoCompra) => r.id === params.id);
      
      if (req) {
        setRequisicao(req);
      } else {
        toast.error('Requisição não encontrada');
        router.push('/procurement/requisicoes');
      }
    } catch (error) {
      toast.error('Erro ao carregar requisição');
      console.error(error);
    } finally {
      setCarregando(false);
    }
  };

  const excluirRequisicao = () => {
    if (!confirm('Tem certeza que deseja excluir esta requisição?')) return;

    try {
      const requisicoes = JSON.parse(localStorage.getItem('requisicoes') || '[]');
      const novasRequisicoes = requisicoes.filter((r: RequisicaoCompra) => r.id !== params.id);
      localStorage.setItem('requisicoes', JSON.stringify(novasRequisicoes));
      
      toast.success('Requisição excluída com sucesso');
      router.push('/procurement/requisicoes');
    } catch (error) {
      toast.error('Erro ao excluir requisição');
      console.error(error);
    }
  };

  const obterCorStatus = (status: string) => {
    const cores = {
      'rascunho': 'secondary',
      'pendente': 'outline',
      'em_aprovacao': 'default',
      'aprovada': 'default',
      'rejeitada': 'destructive',
      'cancelada': 'secondary',
      'convertida': 'default'
    };
    return cores[status as keyof typeof cores] || 'outline';
  };

  const obterIconeStatus = (status: string) => {
    const icones = {
      'rascunho': FileText,
      'pendente': Clock,
      'em_aprovacao': AlertCircle,
      'aprovada': CheckCircle,
      'rejeitada': XCircle,
      'cancelada': XCircle,
      'convertida': TrendingUp
    };
    const Icone = icones[status as keyof typeof icones] || Clock;
    return <Icone className="h-4 w-4 mr-1" />;
  };

  const obterCorPrioridade = (prioridade: string) => {
    const cores = {
      'baixa': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'media': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'alta': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'urgente': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return cores[prioridade as keyof typeof cores] || 'bg-gray-100 text-gray-800';
  };

  if (carregando) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-500">Carregando requisição...</p>
        </div>
      </div>
    );
  }

  if (!requisicao) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold">{requisicao.numero}</h1>
            <Badge variant={obterCorStatus(requisicao.status) as any} className="flex items-center">
              {obterIconeStatus(requisicao.status)}
              {requisicao.status.replace('_', ' ').charAt(0).toUpperCase() + requisicao.status.replace('_', ' ').slice(1)}
            </Badge>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mt-1 ml-10">
            Detalhes da requisição de compra
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {(requisicao.status === 'rascunho' || requisicao.status === 'pendente') && (
            <>
              <Button variant="outline" onClick={() => router.push(`/procurement/requisicoes/${requisicao.id}/editar`)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
              <Button variant="destructive" onClick={excluirRequisicao}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Informações Gerais */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Informações do Solicitante</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Solicitante</p>
              <p className="font-medium">{requisicao.solicitanteNome}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Departamento</p>
              <p className="font-medium">{requisicao.departamento}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Data da Requisição</p>
              <p className="font-medium">{new Date(requisicao.data).toLocaleDateString('pt-MZ')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5" />
              <span>Detalhes da Requisição</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Prioridade</p>
              <Badge className={obterCorPrioridade(requisicao.prioridade)}>
                {requisicao.prioridade.charAt(0).toUpperCase() + requisicao.prioridade.slice(1)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Data de Entrega Desejada</p>
              <p className="font-medium">
                {requisicao.dataEntregaDesejada 
                  ? new Date(requisicao.dataEntregaDesejada).toLocaleDateString('pt-MZ')
                  : 'Não especificada'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Valor Total</p>
              <p className="text-xl font-bold text-green-600">
                MT {requisicao.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Justificativa e Observações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="h-5 w-5" />
            <span>Justificativa e Observações</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Justificativa</p>
            <p className="text-gray-900 dark:text-gray-100">{requisicao.justificativa}</p>
          </div>
          {requisicao.observacoes && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Observações</p>
                <p className="text-gray-900 dark:text-gray-100">{requisicao.observacoes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Itens da Requisição */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Itens da Requisição ({requisicao.itens.length})</span>
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
                {requisicao.itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.descricao}</TableCell>
                    <TableCell>{item.quantidade}</TableCell>
                    <TableCell>{item.unidadeMedida}</TableCell>
                    <TableCell>MT {item.precoEstimado.toFixed(2)}</TableCell>
                    <TableCell className="font-medium">
                      MT {item.subtotal.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {item.observacoes || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Valor Total</div>
              <div className="text-2xl font-bold">
                MT {requisicao.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Aprovações */}
      {requisicao.aprovacoes && requisicao.aprovacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <History className="h-5 w-5" />
              <span>Histórico de Aprovações</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {requisicao.aprovacoes.map((aprovacao) => (
                <div key={aprovacao.id} className="flex items-start space-x-4 p-4 border rounded-lg">
                  <div className="flex-shrink-0">
                    {aprovacao.status === 'aprovado' && (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    )}
                    {aprovacao.status === 'rejeitado' && (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                    {aprovacao.status === 'pendente' && (
                      <Clock className="h-6 w-6 text-yellow-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{aprovacao.aprovadorNome}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Nível {aprovacao.nivel}
                        </p>
                      </div>
                      <Badge variant={
                        aprovacao.status === 'aprovado' ? 'default' :
                        aprovacao.status === 'rejeitado' ? 'destructive' : 'outline'
                      }>
                        {aprovacao.status.charAt(0).toUpperCase() + aprovacao.status.slice(1)}
                      </Badge>
                    </div>
                    {aprovacao.data && (
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(aprovacao.data).toLocaleString('pt-MZ')}
                      </p>
                    )}
                    {aprovacao.observacoes && (
                      <p className="text-sm mt-2 text-gray-700 dark:text-gray-300">
                        {aprovacao.observacoes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
