
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote,
  Receipt,
  User,
  ShoppingCart
} from 'lucide-react';

interface ProdutoPOS {
  id: string;
  nome: string;
  preco: number;
  stock: number;
  categoria: string;
  imagem?: string;
}

interface ItemCarrinho {
  produto: ProdutoPOS;
  quantidade: number;
}

const produtosMock: ProdutoPOS[] = [
  { id: '1', nome: 'Coca-Cola 500ml', preco: 50, stock: 100, categoria: 'Bebidas' },
  { id: '2', nome: 'Pão Francês', preco: 5, stock: 200, categoria: 'Padaria' },
  { id: '3', nome: 'Leite UHT 1L', preco: 80, stock: 50, categoria: 'Laticínios' },
  { id: '4', nome: 'Arroz 1kg', preco: 120, stock: 75, categoria: 'Grãos' },
  { id: '5', nome: 'Óleo de Cozinha 900ml', preco: 150, stock: 40, categoria: 'Mercearia' },
  { id: '6', nome: 'Sabão em Pó 1kg', preco: 180, stock: 30, categoria: 'Limpeza' },
];

export default function POSPage() {
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [busca, setBusca] = useState('');
  const [cliente, setCliente] = useState('');

  const produtosFiltrados = produtosMock.filter(p => 
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    p.categoria.toLowerCase().includes(busca.toLowerCase())
  );

  const adicionarAoCarrinho = (produto: ProdutoPOS) => {
    const itemExistente = carrinho.find(item => item.produto.id === produto.id);
    
    if (itemExistente) {
      if (itemExistente.quantidade < produto.stock) {
        setCarrinho(carrinho.map(item =>
          item.produto.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        ));
      }
    } else {
      setCarrinho([...carrinho, { produto, quantidade: 1 }]);
    }
  };

  const removerDoCarrinho = (produtoId: string) => {
    setCarrinho(carrinho.filter(item => item.produto.id !== produtoId));
  };

  const alterarQuantidade = (produtoId: string, delta: number) => {
    setCarrinho(carrinho.map(item => {
      if (item.produto.id === produtoId) {
        const novaQuantidade = item.quantidade + delta;
        if (novaQuantidade <= 0) return item;
        if (novaQuantidade > item.produto.stock) return item;
        return { ...item, quantidade: novaQuantidade };
      }
      return item;
    }));
  };

  const calcularTotal = () => {
    return carrinho.reduce((total, item) => total + (item.produto.preco * item.quantidade), 0);
  };

  const finalizarVenda = () => {
    if (carrinho.length === 0) return;
    alert('Venda finalizada com sucesso!');
    setCarrinho([]);
    setCliente('');
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 p-4">
      <div className="flex-1 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Produtos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produtos..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-[calc(100vh-300px)] overflow-y-auto">
              {produtosFiltrados.map((produto) => (
                <Card 
                  key={produto.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => adicionarAoCarrinho(produto)}
                >
                  <CardContent className="p-4">
                    <div className="aspect-square bg-muted rounded-md mb-2 flex items-center justify-center">
                      <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-medium text-sm mb-1">{produto.nome}</h3>
                    <Badge variant="secondary" className="text-xs mb-2">
                      {produto.categoria}
                    </Badge>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">
                        {produto.preco.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Stock: {produto.stock}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="w-full md:w-96 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Carrinho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome do cliente (opcional)"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="pl-10"
              />
            </div>

            <Separator />

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {carrinho.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Carrinho vazio</p>
                </div>
              ) : (
                carrinho.map((item) => (
                  <div key={item.produto.id} className="flex items-center gap-2 p-2 border rounded">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{item.produto.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.produto.preco.toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' })} x {item.quantidade}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => alterarQuantidade(item.produto.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm">{item.quantidade}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => alterarQuantidade(item.produto.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removerDoCarrinho(item.produto.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="font-bold text-sm">
                      {(item.produto.preco * item.quantidade).toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span>{calcularTotal().toLocaleString('pt-MZ', { style: 'currency', currency: 'MZN' })}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-2"
                disabled={carrinho.length === 0}
                onClick={finalizarVenda}
              >
                <Banknote className="h-4 w-4" />
                Dinheiro
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={carrinho.length === 0}
                onClick={finalizarVenda}
              >
                <CreditCard className="h-4 w-4" />
                Cartão
              </Button>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={carrinho.length === 0}
              onClick={finalizarVenda}
            >
              Finalizar Venda
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
