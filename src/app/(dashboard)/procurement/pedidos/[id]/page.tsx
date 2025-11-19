'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BadgeCheck,
  Building,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  Mail,
  Package,
  Printer,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ItemPedido {
  id: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  subtotal: number;
  status: 'pendente' | 'recebido';
}

interface PedidoCompra {
  id: string;
  numero: string;
  data: string;
  fornecedor: {
    nome: string;
    nif: string;
    contato: string;
    telefone: string;
    email: string;
    endereco: string;
  };
  requisicaoId: string | null;
  cotacaoId: string | null;
  status:
    | 'rascunho'
    | 'enviado'
    | 'confirmado'
    | 'em_transito'
    | 'recebido_parcial'
    | 'recebido_total'
    | 'cancelado';
  responsavel: string;
  condicaoPagamento: string;
  dataPrevistaEntrega: string;
  localEntrega: string;
  observacoes: string;
  itens: ItemPedido[];
  subtotal: number;
  impostos: number;
  total: number;
  percentualRecebido: number;
  etapas: {
    titulo: string;
    data: string;
    descricao: string;
    status: 'concluido' | 'pendente' | 'atrasado';
  }[];
}

const PEDIDOS: Record<string, PedidoCompra> = {
  'PC-001': {
    id: 'PC-001',
    numero: 'PC-2024-001',
    data: '2024-01-16',
    fornecedor: {
      nome: 'Distribuidora ABC Lda',
      nif: '400123456',
      contato: 'Ana Paulo',
      telefone: '+258 84 456 1234',
      email: 'compras@distribuidoraabc.co.mz',
      endereco: 'Av. Eduardo Mondlane, 345 - Maputo',
    },
    requisicaoId: 'REQ-2024-002',
    cotacaoId: 'COT-2024-002',
    status: 'confirmado',
    responsavel: 'Carlos Mendes',
    condicaoPagamento: '30 dias após entrega',
    dataPrevistaEntrega: '2024-01-25',
    localEntrega: 'Armazém Central - Matola',
    observacoes: 'Priorizar itens perecíveis. Entrega parcial aceita.',
    subtotal: 11500,
    impostos: 1000,
    total: 12500,
    percentualRecebido: 0,
    itens: [
      {
        id: '1',
        descricao: 'Arroz Branco 25kg',
        quantidade: 120,
        unidade: 'saco',
        precoUnitario: 32,
        subtotal: 3840,
        status: 'pendente',
      },
      {
        id: '2',
        descricao: 'Óleo Vegetal 5L',
        quantidade: 250,
        unidade: 'bidão',
        precoUnitario: 18,
        subtotal: 4500,
        status: 'pendente',
      },
      {
        id: '3',
        descricao: 'Farinha de Trigo 50kg',
        quantidade: 60,
        unidade: 'saco',
        precoUnitario: 27,
        subtotal: 2160,
        status: 'pendente',
      },
      {
        id: '4',
        descricao: 'Feijão Nhemba 25kg',
        quantidade: 40,
        unidade: 'saco',
        precoUnitario: 25,
        subtotal: 1000,
        status: 'pendente',
      },
    ],
    etapas: [
      {
        titulo: 'Requisição Aprovada',
        data: '2024-01-12',
        descricao: 'REQ-2024-002 aprovada pelo gestor da unidade',
        status: 'concluido',
      },
      {
        titulo: 'Cotação Recebida',
        data: '2024-01-14',
        descricao: 'Comparação de 3 fornecedores, ABC selecionado',
        status: 'concluido',
      },
      {
        titulo: 'Pedido Confirmado',
        data: '2024-01-16',
        descricao: 'Pedido enviado para fornecedor',
        status: 'concluido',
      },
      {
        titulo: 'Em Produção',
        data: '2024-01-20',
        descricao: 'Fornecedor preparando o despacho',
        status: 'pendente',
      },
      {
        titulo: 'Entrega Prevista',
        data: '2024-01-25',
        descricao: 'Entrega total prevista em Armazém Central',
        status: 'pendente',
      },
    ],
  },
  'PC-002': {
    id: 'PC-002',
    numero: 'PC-2024-002',
    data: '2024-01-15',
    fornecedor: {
      nome: 'Bebidas Moçambique SA',
      nif: '401998877',
      contato: 'Paulo Ernesto',
      telefone: '+258 84 555 9087',
      email: 'pedidos@bebidasmz.co.mz',
      endereco: 'Zona Industrial - Matola',
    },
    requisicaoId: 'REQ-2024-001',
    cotacaoId: 'COT-2024-001',
    status: 'em_transito',
    responsavel: 'Luciana Jorge',
    condicaoPagamento: '50% antecipado / 50% na entrega',
    dataPrevistaEntrega: '2024-02-01',
    localEntrega: 'Centro Distribuição Sul',
    observacoes: 'Motorista deve recolher documentação no setor fiscal.',
    subtotal: 39000,
    impostos: 3000,
    total: 42000,
    percentualRecebido: 0,
    itens: [
      {
        id: '1',
        descricao: 'Refrigerante Cola 2L',
        quantidade: 500,
        unidade: 'caixa',
        precoUnitario: 30,
        subtotal: 15000,
        status: 'pendente',
      },
      {
        id: '2',
        descricao: 'Água Mineral 1.5L',
        quantidade: 600,
        unidade: 'caixa',
        precoUnitario: 18,
        subtotal: 10800,
        status: 'pendente',
      },
      {
        id: '3',
        descricao: 'Sumo Tropical 500ml',
        quantidade: 700,
        unidade: 'caixa',
        precoUnitario: 19,
        subtotal: 13300,
        status: 'pendente',
      },
    ],
    etapas: [
      {
        titulo: 'Pedido Emitido',
        data: '2024-01-15',
        descricao: 'Ordem enviada ao fornecedor',
        status: 'concluido',
      },
      {
        titulo: 'Produção/Separação',
        data: '2024-01-18',
        descricao: 'Fornecedor confirmou separação do stock',
        status: 'concluido',
      },
      {
        titulo: 'Expedição',
        data: '2024-01-22',
        descricao: 'Carga a caminho do centro de distribuição',
        status: 'pendente',
      },
      {
        titulo: 'Entrega',
        data: '2024-02-01',
        descricao: 'Entrega e conferência planejadas',
        status: 'pendente',
      },
    ],
  },
};

const statusConfig: Record<
  PedidoCompra['status'],
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: ReactNode }
> = {
  rascunho: { label: 'Rascunho', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  enviado: { label: 'Enviado', variant: 'outline', icon: <Mail className="h-3 w-3" /> },
  confirmado: { label: 'Confirmado', variant: 'default', icon: <BadgeCheck className="h-3 w-3" /> },
  em_transito: { label: 'Em Trânsito', variant: 'default', icon: <Truck className="h-3 w-3" /> },
  recebido_parcial: { label: 'Recebido Parcial', variant: 'outline', icon: <Package className="h-3 w-3" /> },
  recebido_total: { label: 'Recebido Total', variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
  cancelado: { label: 'Cancelado', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

export default function DetalhePedidoCompraPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const pedido = PEDIDOS[id];

  if (!pedido) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => router.push('/procurement/pedidos')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <p className="text-lg font-semibold">Pedido não encontrado</p>
            <p className="text-sm text-gray-500">
              Verifique o identificador informado ou retorne à lista de pedidos.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = statusConfig[pedido.status];
  const recebidos = pedido.itens.filter((item) => item.status === 'recebido').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Pedido de Compras</p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{pedido.numero}</h1>
          <div className="flex flex-wrap gap-2 items-center text-sm text-gray-500 mt-2">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(pedido.data).toLocaleDateString('pt-MZ')}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <span className="flex items-center gap-1">
              <Building className="h-4 w-4" />
              {pedido.fornecedor.nome}
            </span>
            {pedido.requisicaoId && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <Link href={`/procurement/requisicoes/${pedido.requisicaoId}`} className="text-blue-600 hover:underline">
                  Requisição {pedido.requisicaoId}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/procurement/pedidos')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button variant="outline" className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Resumo do Pedido</CardTitle>
            <Badge variant={status.variant} className="gap-1">
              {status.icon}
              {status.label}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Responsável</p>
                <p className="font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {pedido.responsavel}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Entrega Prevista</p>
                <p className="font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  {new Date(pedido.dataPrevistaEntrega).toLocaleDateString('pt-MZ')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Condição de Pagamento</p>
                <p className="font-medium">{pedido.condicaoPagamento}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Local de Entrega</p>
                <p className="font-medium">{pedido.localEntrega}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Observações</p>
              <p className="text-gray-800 dark:text-gray-200">{pedido.observacoes}</p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Itens</p>
                <p className="text-2xl font-bold">{pedido.itens.length}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Itens Recebidos</p>
                <p className="text-2xl font-bold">{recebidos}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Subtotal</p>
                <p className="text-2xl font-bold">MT {pedido.subtotal.toLocaleString('pt-MZ')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold text-green-600">MT {pedido.total.toLocaleString('pt-MZ')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fornecedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Nome</p>
              <p className="font-semibold">{pedido.fornecedor.nome}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Contacto</p>
              <p>{pedido.fornecedor.contato}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Telefone</p>
              <p>{pedido.fornecedor.telefone}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-blue-600">{pedido.fornecedor.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">NIF</p>
              <p>{pedido.fornecedor.nif}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Endereço</p>
              <p>{pedido.fornecedor.endereco}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Itens do Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead>Unid.</TableHead>
                    <TableHead className="text-right">Preço Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedido.itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.descricao}</TableCell>
                      <TableCell className="text-right">{item.quantidade.toLocaleString('pt-MZ')}</TableCell>
                      <TableCell>{item.unidade}</TableCell>
                      <TableCell className="text-right">MT {item.precoUnitario.toLocaleString('pt-MZ')}</TableCell>
                      <TableCell className="text-right">MT {item.subtotal.toLocaleString('pt-MZ')}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'recebido' ? 'default' : 'secondary'}>
                          {item.status === 'recebido' ? 'Recebido' : 'Pendente'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-6 max-w-md ml-auto space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>MT {pedido.subtotal.toLocaleString('pt-MZ')}</span>
              </div>
              <div className="flex justify-between">
                <span>Impostos</span>
                <span>MT {pedido.impostos.toLocaleString('pt-MZ')}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>MT {pedido.total.toLocaleString('pt-MZ')}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Etapas e Entregas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {pedido.etapas.map((etapa, index) => (
              <div key={etapa.titulo} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center border-2 ${
                      etapa.status === 'concluido'
                        ? 'border-green-500 text-green-500'
                        : etapa.status === 'pendente'
                        ? 'border-gray-300 text-gray-400'
                        : 'border-orange-500 text-orange-500'
                    }`}
                  >
                    {etapa.status === 'concluido' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : etapa.status === 'pendente' ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                  </div>
                  {index !== pedido.etapas.length - 1 && <div className="h-full w-px bg-gray-200" />}
                </div>
                <div>
                  <p className="font-semibold">{etapa.titulo}</p>
                  <p className="text-xs text-gray-500">{new Date(etapa.data).toLocaleDateString('pt-MZ')}</p>
                  <p className="text-sm text-gray-600">{etapa.descricao}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
