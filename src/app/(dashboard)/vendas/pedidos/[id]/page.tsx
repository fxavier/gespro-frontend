'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import {
  ArrowLeft,
  Package,
  Check,
  X,
  FileText,
  Truck,
  Clock,
  User,
  Store,
  ShoppingBag,
  Monitor,
  Globe,
  DollarSign,
  CheckCircle,
  XCircle,
  Printer,
  Mail
} from 'lucide-react';
import { EstadoPedido, OrigemPedido, Pedido } from '@/types/pedido';

export default function DetalhesPedidoPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [proximoEstado, setProximoEstado] = useState<EstadoPedido | null>(null);
  const [loading, setLoading] = useState(false);

  // Dados de exemplo - em produção viriam de uma API
  const pedido: Pedido = {
    id: id,
    numero: 'PED-2024-001',
    data: new Date('2024-01-20'),
    origem: 'loja',
    estado: 'pendente',
    clienteId: '1',
    clienteNome: 'João Silva',
    vendedorId: '1',
    vendedorNome: 'Maria Santos',
    comissaoPercentual: 5,
    comissaoValor: 625,
    itens: [
      {
        id: '1',
        produtoId: '1',
        produtoNome: 'Arroz 25kg',
        quantidade: 5,
        precoUnitario: 1225,
        desconto: 0,
        total: 6125,
        disponibilidadeStock: true,
        stockAtual: 50
      },
      {
        id: '2',
        produtoId: '2',
        produtoNome: 'Óleo 1L',
        quantidade: 10,
        precoUnitario: 150,
        desconto: 0,
        total: 1500,
        disponibilidadeStock: true,
        stockAtual: 100
      },
      {
        id: '3',
        produtoId: '3',
        produtoNome: 'Açúcar 1kg',
        quantidade: 20,
        precoUnitario: 90,
        desconto: 0,
        total: 1800,
        disponibilidadeStock: false,
        stockAtual: 15
      },
      {
        id: '4',
        produtoId: '4',
        produtoNome: 'Farinha de Milho 1kg',
        quantidade: 15,
        precoUnitario: 65,
        desconto: 0,
        total: 975,
        disponibilidadeStock: true,
        stockAtual: 150
      },
      {
        id: '5',
        produtoId: '5',
        produtoNome: 'Sal 1kg',
        quantidade: 10,
        precoUnitario: 25,
        desconto: 0,
        total: 250,
        disponibilidadeStock: true,
        stockAtual: 200
      }
    ],
    subtotal: 10650,
    desconto: 0,
    iva: 1810.50,
    total: 12460.50,
    lojaId: '1',
    lojaNome: 'Loja Centro',
    observacoes: 'Cliente regular, dar prioridade na entrega',
    criadoPor: 'sistema',
    criadoEm: new Date('2024-01-20'),
    atualizadoPor: 'admin',
    atualizadoEm: new Date('2024-01-20')
  };

  const getEstadoBadge = (estado: EstadoPedido) => {
    const variants = {
      pendente: { variant: 'secondary' as const, icon: <Clock className="h-3 w-3" /> },
      confirmado: { variant: 'default' as const, icon: <Check className="h-3 w-3" /> },
      faturado: { variant: 'outline' as const, icon: <FileText className="h-3 w-3" /> },
      entregue: { variant: 'default' as const, icon: <Truck className="h-3 w-3" /> },
      cancelado: { variant: 'destructive' as const, icon: <X className="h-3 w-3" /> }
    };

    const { variant, icon } = variants[estado];
    
    return (
      <Badge variant={variant} className="gap-1">
        {icon}
        {estado.charAt(0).toUpperCase() + estado.slice(1)}
      </Badge>
    );
  };

  const getOrigemIcon = (origem: OrigemPedido) => {
    const icons = {
      loja: <ShoppingBag className="h-4 w-4" />,
      pos: <Monitor className="h-4 w-4" />,
      ecommerce: <Globe className="h-4 w-4" />,
      manual: <FileText className="h-4 w-4" />
    };
    return icons[origem];
  };

  const handleAlterarEstado = (novoEstado: EstadoPedido) => {
    setProximoEstado(novoEstado);
    setShowConfirmDialog(true);
  };

  const confirmarAlteracaoEstado = async () => {
    if (!proximoEstado) return;

    setLoading(true);
    // Simular chamada API
    setTimeout(() => {
      setLoading(false);
      setShowConfirmDialog(false);
      toast({
        title: "Sucesso",
        description: `Estado alterado para ${proximoEstado}`,
      });
      // Em produção, recarregar os dados do pedido
    }, 1500);
  };

  const handleImprimir = () => {
    toast({
      title: "Imprimindo",
      description: "Documento enviado para impressão",
    });
  };

  const handleEnviarEmail = () => {
    toast({
      title: "Email enviado",
      description: "Pedido enviado por email para o cliente",
    });
  };

  // Verificar disponibilidade total de stock
  const stockDisponivel = pedido.itens.every(item => item.disponibilidadeStock);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/vendas/pedidos')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Detalhes do Pedido</h1>
          <p className="text-muted-foreground">#{pedido.numero}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleImprimir}>
            <Printer className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleEnviarEmail}>
            <Mail className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Informações do Pedido</CardTitle>
                {getEstadoBadge(pedido.estado)}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Data do Pedido</p>
                  <p className="font-medium">{pedido.data.toLocaleDateString('pt-PT')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Origem</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getOrigemIcon(pedido.origem)}
                    <span className="capitalize">{pedido.origem}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">{pedido.clienteNome}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Loja</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Store className="h-4 w-4" />
                    <span>{pedido.lojaNome}</span>
                  </div>
                </div>
                {pedido.vendedorNome && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vendedor</p>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="h-4 w-4" />
                      <span>{pedido.vendedorNome}</span>
                    </div>
                  </div>
                )}
                {pedido.faturaId && (
                  <div>
                    <p className="text-sm text-muted-foreground">Fatura</p>
                    <p className="font-medium">{pedido.faturaId}</p>
                  </div>
                )}
              </div>

              {pedido.observacoes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm bg-muted p-3 rounded-md">{pedido.observacoes}</p>
                </div>
              )}

              <div className="flex gap-2">
                {pedido.estado === 'pendente' && (
                  <>
                    <Button onClick={() => handleAlterarEstado('confirmado')}>
                      <Check className="h-4 w-4 mr-2" />
                      Confirmar Pedido
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleAlterarEstado('cancelado')}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </>
                )}
                {pedido.estado === 'confirmado' && (
                  <>
                    <Button onClick={() => handleAlterarEstado('faturado')}>
                      <FileText className="h-4 w-4 mr-2" />
                      Faturar
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => handleAlterarEstado('cancelado')}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </>
                )}
                {pedido.estado === 'faturado' && (
                  <Button onClick={() => handleAlterarEstado('entregue')}>
                    <Truck className="h-4 w-4 mr-2" />
                    Marcar como Entregue
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Itens do Pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Preço Unit.</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedido.itens.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.produtoNome}</TableCell>
                      <TableCell>MT {item.precoUnitario.toFixed(2)}</TableCell>
                      <TableCell>{item.quantidade}</TableCell>
                      <TableCell>MT {item.total.toFixed(2)}</TableCell>
                      <TableCell>
                        {item.disponibilidadeStock ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Disponível
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Falta {item.quantidade - (item.stockAtual || 0)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>MT {pedido.subtotal.toFixed(2)}</span>
                </div>
                {pedido.desconto > 0 && (
                  <div className="flex justify-between">
                    <span>Desconto</span>
                    <span>- MT {pedido.desconto.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>IVA (17%)</span>
                  <span>MT {pedido.iva.toFixed(2)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>MT {pedido.total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {pedido.vendedorNome && pedido.comissaoPercentual && (
            <Card>
              <CardHeader>
                <CardTitle>Comissão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{pedido.vendedorNome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Percentual</span>
                  <span>{pedido.comissaoPercentual}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Valor</span>
                  <span className="font-medium">MT {pedido.comissaoValor?.toFixed(2)}</span>
                </div>
                <Badge variant="secondary" className="w-full justify-center mt-2">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Pendente
                </Badge>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Status de Stock</CardTitle>
            </CardHeader>
            <CardContent>
              {stockDisponivel ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Stock disponível para todos os itens</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-5 w-5" />
                    <span className="font-medium">Stock insuficiente</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Alguns itens não têm stock suficiente. Verifique a disponibilidade antes de confirmar o pedido.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-600 mt-1.5"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Pedido criado</p>
                    <p className="text-xs text-muted-foreground">
                      {pedido.criadoEm.toLocaleString('pt-PT')} por {pedido.criadoPor}
                    </p>
                  </div>
                </div>
                {pedido.atualizadoEm && (
                  <div className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-gray-400 mt-1.5"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Última atualização</p>
                      <p className="text-xs text-muted-foreground">
                        {pedido.atualizadoEm.toLocaleString('pt-PT')} por {pedido.atualizadoPor}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de estado</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar o estado do pedido para {proximoEstado}?
              Esta ação pode desencadear outros processos no sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAlteracaoEstado} disabled={loading}>
              {loading ? 'Processando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}