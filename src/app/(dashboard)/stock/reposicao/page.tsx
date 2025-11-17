
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  ShoppingCart,
  TrendingDown,
  Package,
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle
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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';
import { toast } from 'sonner';

interface ProdutoReposicao {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  stockAtual: number;
  stockMinimo: number;
  stockMaximo: number;
  unidadeMedida: string;
  precoCompra: number;
  fornecedorPreferencial?: string;
  quantidadeSugerida: number;
  diasParaRuptura: number;
  vendaMediaDiaria: number;
}

const produtosReposicaoMock: ProdutoReposicao[] = [
  {
    id: '1',
    codigo: 'PROD001',
    nome: 'Coca-Cola 500ml',
    categoria: 'Bebidas',
    stockAtual: 15,
    stockMinimo: 20,
    stockMaximo: 200,
    unidadeMedida: 'UN',
    precoCompra: 35,
    fornecedorPreferencial: 'Distribuidora ABC',
    quantidadeSugerida: 185,
    diasParaRuptura: 3,
    vendaMediaDiaria: 5
  },
  {
    id: '2',
    codigo: 'PROD002',
    nome: 'Arroz Tipo 1 - 1kg',
    categoria: 'Grãos',
    stockAtual: 45,
    stockMinimo: 50,
    stockMaximo: 500,
    unidadeMedida: 'KG',
    precoCompra: 85,
    fornecedorPreferencial: 'Armazém Central',
    quantidadeSugerida: 455,
    diasParaRuptura: 5,
    vendaMediaDiaria: 9
  },
  {
    id: '3',
    codigo: 'PROD003',
    nome: 'Óleo de Cozinha 900ml',
    categoria: 'Mercearia',
    stockAtual: 8,
    stockMinimo: 15,
    stockMaximo: 100,
    unidadeMedida: 'UN',
    precoCompra: 110,
    fornecedorPreferencial: 'Distribuidora XYZ',
    quantidadeSugerida: 92,
    diasParaRuptura: 2,
    vendaMediaDiaria: 4
  },
  {
    id: '4',
    codigo: 'PROD004',
    nome: 'Açúcar Refinado 1kg',
    categoria: 'Mercearia',
    stockAtual: 0,
    stockMinimo: 30,
    stockMaximo: 300,
    unidadeMedida: 'KG',
    precoCompra: 65,
    fornecedorPreferencial: 'Armazém Central',
    quantidadeSugerida: 300,
    diasParaRuptura: 0,
    vendaMediaDiaria: 10
  }
];

const fornecedoresMock = [
  { id: '1', nome: 'Distribuidora ABC' },
  { id: '2', nome: 'Armazém Central' },
  { id: '3', nome: 'Distribuidora XYZ' }
];

export default function ReposicaoStockPage() {
  const [produtos, setProdutos] = useState<ProdutoReposicao[]>(produtosReposicaoMock);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todos');
  const [dialogPedido, setDialogPedido] = useState(false);
  const [produtosSelecionados, setProdutosSelecionados] = useState<Set<string>>(new Set());

  const categorias = useMemo(() => {
    const cats = new Set(produtos.map(p => p.categoria));
    return Array.from(cats);
  }, [produtos]);

  const dadosFiltrados = useMemo(() => {
    return produtos.filter(produto => {
      const matchBusca = busca === '' || 
        produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
        produto.codigo.toLowerCase().includes(busca.toLowerCase());
      
      const matchCategoria = filtroCategoria === 'todos' || produto.categoria === filtroCategoria;
      
      const matchPrioridade = filtroPrioridade === 'todos' ||
        (filtroPrioridade === 'critico' && produto.diasParaRuptura === 0) ||
        (filtroPrioridade === 'urgente' && produto.diasParaRuptura > 0 && produto.diasParaRuptura <= 3) ||
        (filtroPrioridade === 'normal' && produto.diasParaRuptura > 3);
      
      return matchBusca && matchCategoria && matchPrioridade;
    });
  }, [produtos, busca, filtroCategoria, filtroPrioridade]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const estatisticas = useMemo(() => {
    return {
      totalProdutos: produtos.length,
      rupturaStock: produtos.filter(p => p.stockAtual === 0).length,
      stockCritico: produtos.filter(p => p.stockAtual > 0 && p.diasParaRuptura <= 3).length,
      valorReposicao: produtos.reduce((acc, p) => acc + (p.quantidadeSugerida * p.precoCompra), 0)
    };
  }, [produtos]);

  const getPrioridadeBadge = (diasParaRuptura: number) => {
    if (diasParaRuptura === 0) {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Crítico</Badge>;
    } else if (diasParaRuptura <= 3) {
      return <Badge className="bg-orange-600 gap-1"><AlertTriangle className="h-3 w-3" />Urgente</Badge>;
    } else {
      return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Normal</Badge>;
    }
  };

  const toggleProdutoSelecionado = (id: string) => {
    const novaSeleção = new Set(produtosSelecionados);
    if (novaSeleção.has(id)) {
      novaSeleção.delete(id);
    } else {
      novaSeleção.add(id);
    }
    setProdutosSelecionados(novaSeleção);
  };

  const handleCriarPedido = () => {
    if (produtosSelecionados.size === 0) {
      toast.error('Selecione pelo menos um produto');
      return;
    }
    setDialogPedido(true);
  };

  const handleConfirmarPedido = () => {
    const produtosPedido = produtos.filter(p => produtosSelecionados.has(p.id));
    const totalPedido = produtosPedido.reduce((acc, p) => acc + (p.quantidadeSugerida * p.precoCompra), 0);
    
    toast.success(`Pedido de compra criado com sucesso! Total: MT ${totalPedido.toFixed(2)}`);
    setProdutosSelecionados(new Set());
    setDialogPedido(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reposição de Stock</h1>
          <p className="text-muted-foreground">Gerir produtos com stock baixo e criar pedidos de reposição</p>
        </div>
        <Button 
          className="gap-2" 
          onClick={handleCriarPedido}
          disabled={produtosSelecionados.size === 0}
        >
          <ShoppingCart className="h-4 w-4" />
          Criar Pedido ({produtosSelecionados.size})
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Produtos Baixo Stock</p>
                <p className="text-2xl font-bold">{estatisticas.totalProdutos}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ruptura de Stock</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.rupturaStock}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Crítico</p>
                <p className="text-2xl font-bold text-orange-600">{estatisticas.stockCritico}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Reposição</p>
                <p className="text-2xl font-bold">MT {estatisticas.valorReposicao.toFixed(2)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Pesquisa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por nome ou código..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Categorias</SelectItem>
                {categorias.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
              <SelectTrigger>
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Prioridades</SelectItem>
                <SelectItem value="critico">Crítico (Ruptura)</SelectItem>
                <SelectItem value="urgente">Urgente (≤3 dias)</SelectItem>
                <SelectItem value="normal">Normal ({'>'}3 dias)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros Avançados
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produtos para Reposição ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium w-12">
                    <Checkbox
                      checked={produtosSelecionados.size === paginatedData.length && paginatedData.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setProdutosSelecionados(new Set(paginatedData.map(p => p.id)));
                        } else {
                          setProdutosSelecionados(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="text-left p-4 font-medium">Produto</th>
                  <th className="text-left p-4 font-medium">Stock Atual</th>
                  <th className="text-left p-4 font-medium">Qtd. Sugerida</th>
                  <th className="text-left p-4 font-medium">Dias p/ Ruptura</th>
                  <th className="text-left p-4 font-medium">Prioridade</th>
                  <th className="text-left p-4 font-medium">Fornecedor</th>
                  <th className="text-left p-4 font-medium">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((produto) => (
                  <tr key={produto.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <Checkbox
                        checked={produtosSelecionados.has(produto.id)}
                        onCheckedChange={() => toggleProdutoSelecionado(produto.id)}
                      />
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{produto.nome}</div>
                        <div className="text-sm text-muted-foreground">{produto.codigo}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className={produto.stockAtual === 0 ? 'text-red-600 font-bold' : 'font-medium'}>
                          {produto.stockAtual} {produto.unidadeMedida}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Mín: {produto.stockMinimo} / Máx: {produto.stockMaximo}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-blue-600">
                        {produto.quantidadeSugerida} {produto.unidadeMedida}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Média: {produto.vendaMediaDiaria}/dia
                      </div>
                    </td>
                    <td className="p-4">
                      <div className={produto.diasParaRuptura === 0 ? 'text-red-600 font-bold' : 'font-medium'}>
                        {produto.diasParaRuptura === 0 ? 'Esgotado' : `${produto.diasParaRuptura} dias`}
                      </div>
                    </td>
                    <td className="p-4">
                      {getPrioridadeBadge(produto.diasParaRuptura)}
                    </td>
                    <td className="p-4">
                      <div className="text-sm">
                        {produto.fornecedorPreferencial || 'Não definido'}
                      </div>
                    </td>
                    <td className="p-4 font-medium">
                      MT {(produto.quantidadeSugerida * produto.precoCompra).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum produto encontrado</p>
            </div>
          )}

          {dadosFiltrados.length > 0 && (
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              totalItems={totalItems}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogPedido} onOpenChange={setDialogPedido}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirmar Pedido de Compra</DialogTitle>
            <DialogDescription>
              Reveja os produtos selecionados antes de criar o pedido
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              {produtos.filter(p => produtosSelecionados.has(p.id)).map(produto => (
                <div key={produto.id} className="flex justify-between items-center p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{produto.nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {produto.codigo} • {produto.fornecedorPreferencial}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {produto.quantidadeSugerida} {produto.unidadeMedida}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      MT {(produto.quantidadeSugerida * produto.precoCompra).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <div className="font-semibold">Total do Pedido:</div>
                <div className="text-2xl font-bold">
                  MT {produtos
                    .filter(p => produtosSelecionados.has(p.id))
                    .reduce((acc, p) => acc + (p.quantidadeSugerida * p.precoCompra), 0)
                    .toFixed(2)}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPedido(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarPedido}>
              Confirmar Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
