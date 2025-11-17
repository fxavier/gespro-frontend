
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Search, 
  Plus, 
  Trash2, 
  FileText,
  Save,
  X,
  User,
  Package,
  Calculator
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { ItemFatura } from '@/types/fatura';

interface Cliente {
  id: string;
  nome: string;
  nuit: string;
  email: string;
  telefone: string;
}

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  precoVenda: number;
  taxaIva: number;
  stockAtual: number;
}

const clientesMock: Cliente[] = [
  { id: '1', nome: 'João Silva', nuit: '123456789', email: 'joao@email.com', telefone: '+258 84 123 4567' },
  { id: '2', nome: 'Empresa ABC Lda', nuit: '987654321', email: 'contato@abc.co.mz', telefone: '+258 21 123 456' },
  { id: '3', nome: 'Maria Santos', nuit: '456789123', email: 'maria@email.com', telefone: '+258 86 987 6543' }
];

const produtosMock: Produto[] = [
  { id: '1', codigo: 'PROD001', nome: 'Coca-Cola 500ml', precoVenda: 50, taxaIva: 16, stockAtual: 100 },
  { id: '2', codigo: 'PROD002', nome: 'Arroz Tipo 1 - 1kg', precoVenda: 120, taxaIva: 16, stockAtual: 250 },
  { id: '3', codigo: 'PROD003', nome: 'Óleo de Cozinha 900ml', precoVenda: 150, taxaIva: 16, stockAtual: 40 }
];

export default function NovaFaturaPage() {
  const router = useRouter();
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [dialogClienteAberto, setDialogClienteAberto] = useState(false);
  const [dialogProdutoAberto, setDialogProdutoAberto] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [buscaProduto, setBuscaProduto] = useState('');
  const [itens, setItens] = useState<ItemFatura[]>([]);
  const [observacoes, setObservacoes] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [tipoDesconto, setTipoDesconto] = useState<'percentual' | 'valor'>('percentual');
  const [descontoGeral, setDescontoGeral] = useState(0);

  const clientesFiltrados = useMemo(() => {
    return clientesMock.filter(c => 
      c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) ||
      c.nuit.includes(buscaCliente)
    );
  }, [buscaCliente]);

  const produtosFiltrados = useMemo(() => {
    return produtosMock.filter(p => 
      p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
      p.codigo.toLowerCase().includes(buscaProduto.toLowerCase())
    );
  }, [buscaProduto]);

  const handleSelecionarCliente = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setDialogClienteAberto(false);
    setBuscaCliente('');
  };

  const handleAdicionarProduto = (produto: Produto) => {
    const itemExistente = itens.find(i => i.produtoId === produto.id);
    
    if (itemExistente) {
      setItens(itens.map(i => 
        i.produtoId === produto.id 
          ? { ...i, quantidade: i.quantidade + 1 }
          : i
      ));
    } else {
      const novoItem: ItemFatura = {
        id: Date.now().toString(),
        produtoId: produto.id,
        descricao: produto.nome,
        quantidade: 1,
        precoUnitario: produto.precoVenda,
        desconto: 0,
        taxaIva: produto.taxaIva,
        subtotal: produto.precoVenda,
        ivaItem: produto.precoVenda * (produto.taxaIva / 100),
        total: produto.precoVenda + (produto.precoVenda * (produto.taxaIva / 100))
      };
      setItens([...itens, novoItem]);
    }
    
    setDialogProdutoAberto(false);
    setBuscaProduto('');
  };

  const handleAtualizarItem = (id: string, campo: keyof ItemFatura, valor: any) => {
    setItens(itens.map(item => {
      if (item.id !== id) return item;

      const itemAtualizado = { ...item, [campo]: valor };
      
      const subtotal = itemAtualizado.quantidade * itemAtualizado.precoUnitario - itemAtualizado.desconto;
      const ivaItem = subtotal * (itemAtualizado.taxaIva / 100);
      const total = subtotal + ivaItem;

      return {
        ...itemAtualizado,
        subtotal,
        ivaItem,
        total
      };
    }));
  };

  const handleRemoverItem = (id: string) => {
    setItens(itens.filter(i => i.id !== id));
  };

  const calcularTotais = () => {
    const subtotal = itens.reduce((acc, item) => acc + item.subtotal, 0);
    
    let descontoTotal = 0;
    if (tipoDesconto === 'percentual') {
      descontoTotal = subtotal * (descontoGeral / 100);
    } else {
      descontoTotal = descontoGeral;
    }

    const subtotalComDesconto = subtotal - descontoTotal;
    const ivaTotal = itens.reduce((acc, item) => acc + item.ivaItem, 0);
    const total = subtotalComDesconto + ivaTotal;

    return { subtotal, descontoTotal, ivaTotal, total };
  };

  const totais = calcularTotais();

  const handleGerarFatura = () => {
    if (!clienteSelecionado) {
      toast.error('Selecione um cliente');
      return;
    }

    if (itens.length === 0) {
      toast.error('Adicione pelo menos um produto');
      return;
    }

    if (!dataVencimento) {
      toast.error('Defina a data de vencimento');
      return;
    }

    const fatura = {
      clienteId: clienteSelecionado.id,
      cliente: clienteSelecionado,
      itens,
      subtotal: totais.subtotal,
      descontoTotal: totais.descontoTotal,
      ivaTotal: totais.ivaTotal,
      total: totais.total,
      dataEmissao: new Date().toISOString(),
      dataVencimento,
      observacoes
    };

    console.log('Fatura gerada:', fatura);
    toast.success('Fatura criada com sucesso!');
    
    setTimeout(() => {
      router.push('/faturacao');
    }, 1500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Nova Fatura</h1>
          <p className="text-muted-foreground">Criar nova fatura para cliente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/faturacao')}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleGerarFatura}>
            <Save className="h-4 w-4 mr-2" />
            Gerar Fatura
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clienteSelecionado ? (
                <div className="flex justify-between items-start p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold text-lg">{clienteSelecionado.nome}</h3>
                    <p className="text-sm text-muted-foreground">NUIT: {clienteSelecionado.nuit}</p>
                    <p className="text-sm text-muted-foreground">{clienteSelecionado.email}</p>
                    <p className="text-sm text-muted-foreground">{clienteSelecionado.telefone}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setClienteSelecionado(null)}
                  >
                    Alterar
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setDialogClienteAberto(true)}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Selecionar Cliente
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Produtos/Serviços
                </CardTitle>
                <Button 
                  size="sm"
                  onClick={() => setDialogProdutoAberto(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {itens.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum produto adicionado</p>
                  <p className="text-sm">Clique em "Adicionar" para incluir produtos</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {itens.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium">{item.descricao}</h4>
                          <p className="text-sm text-muted-foreground">IVA: {item.taxaIva}%</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoverItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Quantidade</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => handleAtualizarItem(item.id, 'quantidade', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Preço Unit. (MT)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.precoUnitario}
                            onChange={(e) => handleAtualizarItem(item.id, 'precoUnitario', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Desconto (MT)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.desconto}
                            onChange={(e) => handleAtualizarItem(item.id, 'desconto', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Total (MT)</Label>
                          <Input
                            type="text"
                            value={item.total.toFixed(2)}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Adicionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea
                  placeholder="Observações adicionais sobre a fatura..."
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Resumo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{totais.subtotal.toFixed(2)} MT</span>
                </div>

                <div className="border-t pt-3">
                  <Label className="text-xs mb-2 block">Desconto Geral</Label>
                  <div className="flex gap-2 mb-2">
                    <Select value={tipoDesconto} onValueChange={(v: any) => setTipoDesconto(v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentual">%</SelectItem>
                        <SelectItem value="valor">MT</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={descontoGeral}
                      onChange={(e) => setDescontoGeral(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto:</span>
                    <span className="font-medium text-red-600">-{totais.descontoTotal.toFixed(2)} MT</span>
                  </div>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA Total:</span>
                  <span className="font-medium">{totais.ivaTotal.toFixed(2)} MT</span>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="font-semibold text-lg">Total:</span>
                    <span className="font-bold text-2xl text-primary">{totais.total.toFixed(2)} MT</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Itens:</span>
                  <span className="font-medium">{itens.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantidade Total:</span>
                  <span className="font-medium">
                    {itens.reduce((acc, item) => acc + item.quantidade, 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                className="w-full" 
                onClick={handleGerarFatura}
                disabled={!clienteSelecionado || itens.length === 0}
              >
                <FileText className="h-4 w-4 mr-2" />
                Gerar Fatura
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleGerarFatura}
                disabled={!clienteSelecionado || itens.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                Guardar Rascunho
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogClienteAberto} onOpenChange={setDialogClienteAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecionar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou NUIT..."
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {clientesFiltrados.map((cliente) => (
                <div
                  key={cliente.id}
                  className="p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleSelecionarCliente(cliente)}
                >
                  <h4 className="font-semibold">{cliente.nome}</h4>
                  <p className="text-sm text-muted-foreground">NUIT: {cliente.nuit}</p>
                  <p className="text-sm text-muted-foreground">{cliente.email}</p>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogProdutoAberto} onOpenChange={setDialogProdutoAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Produto/Serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou código..."
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {produtosFiltrados.map((produto) => (
                <div
                  key={produto.id}
                  className="p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleAdicionarProduto(produto)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{produto.nome}</h4>
                      <p className="text-sm text-muted-foreground">Código: {produto.codigo}</p>
                      <p className="text-sm text-muted-foreground">Stock: {produto.stockAtual} unidades</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{produto.precoVenda.toFixed(2)} MT</p>
                      <p className="text-xs text-muted-foreground">IVA: {produto.taxaIva}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
