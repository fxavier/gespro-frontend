'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
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
import { 
  Plus, 
  Trash2, 
  Save,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Package
} from 'lucide-react';
import { ItemPedido, ValidacaoStock } from '@/types/pedido';

interface Produto {
  id: string;
  nome: string;
  preco: number;
  stock: number;
  iva: number;
}

interface Cliente {
  id: string;
  nome: string;
  nif: string;
  telefone: string;
  email: string;
}

interface Vendedor {
  id: string;
  nome: string;
  comissaoPercentual: number;
}

export default function NovoPedidoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [validandoStock, setValidandoStock] = useState(false);
  const [showStockAlert, setShowStockAlert] = useState(false);
  
  // Formulário principal
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [observacoes, setObservacoes] = useState('');
  
  // Itens do pedido
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  
  // Validações de stock
  const [validacoesStock, setValidacoesStock] = useState<ValidacaoStock[]>([]);

  // Dados de exemplo
  const produtos: Produto[] = [
    { id: '1', nome: 'Arroz 25kg', preco: 1225, stock: 50, iva: 17 },
    { id: '2', nome: 'Óleo 1L', preco: 150, stock: 100, iva: 17 },
    { id: '3', nome: 'Açúcar 1kg', preco: 90, stock: 200, iva: 17 },
    { id: '4', nome: 'Farinha de Milho 1kg', preco: 65, stock: 5, iva: 17 },
    { id: '5', nome: 'Sal 1kg', preco: 25, stock: 0, iva: 0 }
  ];

  const clientes: Cliente[] = [
    { id: '1', nome: 'João Silva', nif: '123456789', telefone: '849000001', email: 'joao@email.com' },
    { id: '2', nome: 'Ana Costa', nif: '987654321', telefone: '849000002', email: 'ana@email.com' },
    { id: '3', nome: 'Pedro Machado', nif: '456789123', telefone: '849000003', email: 'pedro@email.com' }
  ];

  const vendedores: Vendedor[] = [
    { id: '1', nome: 'Maria Santos', comissaoPercentual: 5 },
    { id: '2', nome: 'Carlos Fernandes', comissaoPercentual: 3 },
    { id: '3', nome: 'Sofia Nunes', comissaoPercentual: 4 }
  ];

  const lojas = [
    { id: '1', nome: 'Loja Centro' },
    { id: '2', nome: 'Loja Norte' },
    { id: '3', nome: 'Loja Sul' }
  ];

  const adicionarItem = () => {
    const produto = produtos.find(p => p.id === produtoSelecionado);
    if (!produto) {
      toast({
        title: "Erro",
        description: "Selecione um produto",
        variant: "destructive"
      });
      return;
    }

    const qty = parseInt(quantidade);
    if (isNaN(qty) || qty <= 0) {
      toast({
        title: "Erro",
        description: "Quantidade inválida",
        variant: "destructive"
      });
      return;
    }

    // Verificar se o produto já está na lista
    const itemExistente = itens.find(item => item.produtoId === produto.id);
    if (itemExistente) {
      toast({
        title: "Aviso",
        description: "Este produto já foi adicionado ao pedido",
        variant: "destructive"
      });
      return;
    }

    const novoItem: ItemPedido = {
      id: `item-${Date.now()}`,
      produtoId: produto.id,
      produtoNome: produto.nome,
      quantidade: qty,
      precoUnitario: produto.preco,
      desconto: 0,
      total: produto.preco * qty,
      stockAtual: produto.stock,
      disponibilidadeStock: produto.stock >= qty
    };

    setItens([...itens, novoItem]);
    setProdutoSelecionado('');
    setQuantidade('1');

    // Verificar disponibilidade de stock
    if (!novoItem.disponibilidadeStock) {
      const validacao: ValidacaoStock = {
        produtoId: produto.id,
        quantidadeSolicitada: qty,
        quantidadeDisponivel: produto.stock,
        disponivel: false,
        mensagem: `Stock insuficiente para ${produto.nome}. Disponível: ${produto.stock}`
      };
      setValidacoesStock([...validacoesStock, validacao]);
    }
  };

  const removerItem = (itemId: string) => {
    setItens(itens.filter(item => item.id !== itemId));
    // Remover validação de stock correspondente
    const item = itens.find(i => i.id === itemId);
    if (item) {
      setValidacoesStock(validacoesStock.filter(v => v.produtoId !== item.produtoId));
    }
  };

  const atualizarQuantidade = (itemId: string, novaQuantidade: string) => {
    const qty = parseInt(novaQuantidade);
    if (isNaN(qty) || qty <= 0) return;

    setItens(itens.map(item => {
      if (item.id === itemId) {
        const produto = produtos.find(p => p.id === item.produtoId);
        const novoTotal = item.precoUnitario * qty;
        const disponivel = produto ? produto.stock >= qty : false;

        // Atualizar validação de stock
        if (!disponivel && produto) {
          const validacao: ValidacaoStock = {
            produtoId: produto.id,
            quantidadeSolicitada: qty,
            quantidadeDisponivel: produto.stock,
            disponivel: false,
            mensagem: `Stock insuficiente para ${produto.nome}. Disponível: ${produto.stock}`
          };
          setValidacoesStock(prev => {
            const filtered = prev.filter(v => v.produtoId !== produto.id);
            return [...filtered, validacao];
          });
        } else {
          setValidacoesStock(prev => prev.filter(v => v.produtoId !== item.produtoId));
        }

        return {
          ...item,
          quantidade: qty,
          total: novoTotal,
          disponibilidadeStock: disponivel
        };
      }
      return item;
    }));
  };

  const calcularTotais = () => {
    const subtotal = itens.reduce((acc, item) => acc + item.total, 0);
    const desconto = 0; // Pode ser implementado depois
    const iva = itens.reduce((acc, item) => {
      const produto = produtos.find(p => p.id === item.produtoId);
      const taxaIva = produto ? produto.iva / 100 : 0;
      return acc + (item.total * taxaIva);
    }, 0);
    const total = subtotal - desconto + iva;

    return { subtotal, desconto, iva, total };
  };

  const validarPedido = async () => {
    setValidandoStock(true);
    
    // Simular validação de stock
    setTimeout(() => {
      setValidandoStock(false);
      if (validacoesStock.length > 0) {
        setShowStockAlert(true);
      } else {
        salvarPedido();
      }
    }, 1000);
  };

  const salvarPedido = async () => {
    if (!clienteId) {
      toast({
        title: "Erro",
        description: "Selecione um cliente",
        variant: "destructive"
      });
      return;
    }

    if (!lojaId) {
      toast({
        title: "Erro",
        description: "Selecione uma loja",
        variant: "destructive"
      });
      return;
    }

    if (itens.length === 0) {
      toast({
        title: "Erro",
        description: "Adicione pelo menos um item ao pedido",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    // Calcular comissão se houver vendedor
    let comissaoPercentual = 0;
    let comissaoValor = 0;
    if (vendedorId) {
      const vendedor = vendedores.find(v => v.id === vendedorId);
      if (vendedor) {
        comissaoPercentual = vendedor.comissaoPercentual;
        comissaoValor = (calcularTotais().subtotal * comissaoPercentual) / 100;
      }
    }

    // Simular salvamento
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Sucesso",
        description: "Pedido criado com sucesso!",
      });
      router.push('/vendas/pedidos');
    }, 1500);
  };

  const totais = calcularTotais();

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Novo Pedido Manual</h1>
          <p className="text-muted-foreground">Crie um novo pedido de venda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cliente">Cliente *</Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map(cliente => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nome} - NIF: {cliente.nif}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="loja">Loja *</Label>
                  <Select value={lojaId} onValueChange={setLojaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma loja" />
                    </SelectTrigger>
                    <SelectContent>
                      {lojas.map(loja => (
                        <SelectItem key={loja.id} value={loja.id}>
                          {loja.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="vendedor">Vendedor (Comissão)</Label>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um vendedor (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem vendedor</SelectItem>
                    {vendedores.map(vendedor => (
                      <SelectItem key={vendedor.id} value={vendedor.id}>
                        {vendedor.nome} - Comissão: {vendedor.comissaoPercentual}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Observações adicionais sobre o pedido..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Itens do Pedido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={produtoSelecionado} onValueChange={setProdutoSelecionado}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map(produto => (
                          <SelectItem key={produto.id} value={produto.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{produto.nome} - MT {produto.preco.toFixed(2)}</span>
                              <Badge 
                                variant={produto.stock > 0 ? "default" : "destructive"}
                                className="ml-2"
                              >
                                Stock: {produto.stock}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    placeholder="Qtd"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                    className="w-20"
                    min="1"
                  />
                  <Button onClick={adicionarItem} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {validacoesStock.length > 0 && (
                  <div className="bg-destructive/10 p-3 rounded-md">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Avisos de Stock</span>
                    </div>
                    {validacoesStock.map(validacao => (
                      <p key={validacao.produtoId} className="text-sm text-destructive mt-1">
                        {validacao.mensagem}
                      </p>
                    ))}
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Preço Unit.</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{item.produtoNome}</TableCell>
                        <TableCell>MT {item.precoUnitario.toFixed(2)}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.quantidade}
                            onChange={(e) => atualizarQuantidade(item.id, e.target.value)}
                            className="w-20"
                            min="1"
                          />
                        </TableCell>
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
                              Insuficiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removerItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {itens.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhum item adicionado ao pedido</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Resumo do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>MT {totais.subtotal.toFixed(2)}</span>
                </div>
                {totais.desconto > 0 && (
                  <div className="flex justify-between">
                    <span>Desconto</span>
                    <span>- MT {totais.desconto.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>IVA (17%)</span>
                  <span>MT {totais.iva.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>MT {totais.total.toFixed(2)}</span>
                </div>
              </div>

              {vendedorId && (
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm text-muted-foreground">Comissão do Vendedor</p>
                  <p className="font-medium">
                    {vendedores.find(v => v.id === vendedorId)?.comissaoPercentual}% = 
                    MT {((totais.subtotal * (vendedores.find(v => v.id === vendedorId)?.comissaoPercentual || 0)) / 100).toFixed(2)}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={validarPedido} 
                  disabled={loading || validandoStock || itens.length === 0}
                  className="flex-1"
                >
                  {validandoStock ? (
                    <>Validando Stock...</>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Criar Pedido
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => router.push('/vendas/pedidos')}>
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showStockAlert} onOpenChange={setShowStockAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aviso de Stock</AlertDialogTitle>
            <AlertDialogDescription>
              Alguns produtos não têm stock suficiente. Deseja continuar mesmo assim?
              O pedido será criado mas precisará aguardar reposição de stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvarPedido}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}