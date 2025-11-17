
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Package,
  Filter,
  Download,
  BarChart3
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';
import type { Produto } from '@/types/produto';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const produtosMock: Produto[] = [
  {
    id: '1',
    tenantId: '1',
    codigo: 'PROD001',
    codigoBarras: '7891234567890',
    nome: 'Coca-Cola 500ml',
    descricao: 'Refrigerante Coca-Cola 500ml',
    categoria: 'Bebidas',
    marca: 'Coca-Cola',
    unidadeMedida: 'UN',
    precoVenda: 50,
    precoCompra: 35,
    margemLucro: 42.86,
    taxaIva: 16,
    stockMinimo: 20,
    stockMaximo: 200,
    stockAtual: 100,
    localizacao: 'Prateleira A1',
    ativo: true,
    dataCriacao: '2024-01-01',
    dataAtualizacao: '2024-01-15'
  },
  {
    id: '2',
    tenantId: '1',
    codigo: 'PROD002',
    nome: 'Arroz Tipo 1 - 1kg',
    descricao: 'Arroz branco tipo 1',
    categoria: 'Grãos',
    marca: 'Tio João',
    unidadeMedida: 'KG',
    precoVenda: 120,
    precoCompra: 85,
    margemLucro: 41.18,
    taxaIva: 16,
    stockMinimo: 50,
    stockMaximo: 500,
    stockAtual: 250,
    localizacao: 'Armazém B',
    ativo: true,
    dataCriacao: '2024-01-01',
    dataAtualizacao: '2024-01-15'
  },
  {
    id: '3',
    tenantId: '1',
    codigo: 'PROD003',
    nome: 'Óleo de Cozinha 900ml',
    descricao: 'Óleo de soja refinado',
    categoria: 'Mercearia',
    marca: 'Liza',
    unidadeMedida: 'UN',
    precoVenda: 150,
    precoCompra: 110,
    margemLucro: 36.36,
    taxaIva: 16,
    stockMinimo: 15,
    stockMaximo: 100,
    stockAtual: 40,
    localizacao: 'Prateleira C2',
    ativo: true,
    dataCriacao: '2024-01-01',
    dataAtualizacao: '2024-01-15'
  }
];

export default function ProdutosPage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>(produtosMock);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [dialogAberto, setDialogAberto] = useState(false);
  const [formData, setFormData] = useState<Partial<Produto>>({
    codigo: '',
    nome: '',
    categoria: '',
    precoVenda: 0,
    precoCompra: 0,
    stockMinimo: 0,
    stockMaximo: 0,
    stockAtual: 0,
    unidadeMedida: 'UN',
    taxaIva: 16,
    ativo: true
  });

  const categorias = useMemo(() => {
    const cats = new Set(produtos.map(p => p.categoria));
    return Array.from(cats);
  }, [produtos]);

  const dadosFiltrados = useMemo(() => {
    return produtos.filter(produto => {
      const matchBusca = busca === '' || 
        produto.nome.toLowerCase().includes(busca.toLowerCase()) ||
        produto.codigo.toLowerCase().includes(busca.toLowerCase()) ||
        (produto.codigoBarras && produto.codigoBarras.includes(busca));
      
      const matchCategoria = filtroCategoria === 'todos' || produto.categoria === filtroCategoria;
      const matchStatus = filtroStatus === 'todos' || 
        (filtroStatus === 'ativo' && produto.ativo) ||
        (filtroStatus === 'inativo' && !produto.ativo) ||
        (filtroStatus === 'stock_baixo' && produto.stockAtual <= produto.stockMinimo);
      
      return matchBusca && matchCategoria && matchStatus;
    });
  }, [produtos, busca, filtroCategoria, filtroStatus]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const handleNovoProduto = () => {
    setFormData({
      codigo: '',
      nome: '',
      categoria: '',
      precoVenda: 0,
      precoCompra: 0,
      stockMinimo: 0,
      stockMaximo: 0,
      stockAtual: 0,
      unidadeMedida: 'UN',
      taxaIva: 16,
      ativo: true
    });
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.codigo || !formData.nome || !formData.categoria) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const novoProduto: Produto = {
      id: Date.now().toString(),
      tenantId: '1',
      codigo: formData.codigo!,
      nome: formData.nome!,
      descricao: formData.descricao,
      categoria: formData.categoria!,
      marca: formData.marca,
      unidadeMedida: formData.unidadeMedida || 'UN',
      precoVenda: formData.precoVenda || 0,
      precoCompra: formData.precoCompra || 0,
      margemLucro: formData.precoCompra ? ((formData.precoVenda! - formData.precoCompra) / formData.precoCompra) * 100 : 0,
      taxaIva: formData.taxaIva || 16,
      stockMinimo: formData.stockMinimo || 0,
      stockMaximo: formData.stockMaximo || 0,
      stockAtual: formData.stockAtual || 0,
      localizacao: formData.localizacao,
      ativo: formData.ativo ?? true,
      dataCriacao: new Date().toISOString(),
      dataAtualizacao: new Date().toISOString()
    };

    setProdutos([...produtos, novoProduto]);
    setDialogAberto(false);
    toast.success('Produto criado com sucesso!');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestão de Produtos</h1>
          <p className="text-muted-foreground">Gerir produtos, stock e preços</p>
        </div>
        <Button className="gap-2" onClick={handleNovoProduto}>
          <Plus className="h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Produtos</p>
                <p className="text-2xl font-bold">{produtos.length}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Produtos Ativos</p>
                <p className="text-2xl font-bold">{produtos.filter(p => p.ativo).length}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Baixo</p>
                <p className="text-2xl font-bold text-orange-600">
                  {produtos.filter(p => p.stockAtual <= p.stockMinimo).length}
                </p>
              </div>
              <Package className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total Stock</p>
                <p className="text-2xl font-bold">
                  MT {produtos.reduce((acc, p) => acc + (p.precoCompra * p.stockAtual), 0).toFixed(2)}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-600" />
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
                  placeholder="Pesquisar por nome, código ou código de barras..."
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

            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
                <SelectItem value="stock_baixo">Stock Baixo</SelectItem>
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
          <CardTitle>Lista de Produtos ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Código</th>
                  <th className="text-left p-4 font-medium">Produto</th>
                  <th className="text-left p-4 font-medium">Categoria</th>
                  <th className="text-left p-4 font-medium">Preço Venda</th>
                  <th className="text-left p-4 font-medium">Stock</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-right p-4 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((produto) => (
                  <tr key={produto.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{produto.codigo}</div>
                        {produto.codigoBarras && (
                          <div className="text-xs text-muted-foreground">{produto.codigoBarras}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{produto.nome}</div>
                        {produto.descricao && (
                          <div className="text-sm text-muted-foreground">{produto.descricao}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="secondary">{produto.categoria}</Badge>
                    </td>
                    <td className="p-4 font-medium">
                      MT {produto.precoVenda.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <div>
                        <div className={produto.stockAtual <= produto.stockMinimo ? 'text-orange-600 font-medium' : ''}>
                          {produto.stockAtual} {produto.unidadeMedida}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Mín: {produto.stockMinimo} / Máx: {produto.stockMaximo}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={produto.ativo ? 'default' : 'secondary'}>
                        {produto.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria *</Label>
              <Select value={formData.categoria} onValueChange={(value) => setFormData({ ...formData, categoria: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bebidas">Bebidas</SelectItem>
                  <SelectItem value="Grãos">Grãos</SelectItem>
                  <SelectItem value="Mercearia">Mercearia</SelectItem>
                  <SelectItem value="Limpeza">Limpeza</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="precoVenda">Preço Venda (MT)</Label>
              <Input
                id="precoVenda"
                type="number"
                value={formData.precoVenda}
                onChange={(e) => setFormData({ ...formData, precoVenda: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precoCompra">Preço Compra (MT)</Label>
              <Input
                id="precoCompra"
                type="number"
                value={formData.precoCompra}
                onChange={(e) => setFormData({ ...formData, precoCompra: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stockAtual">Stock Atual</Label>
              <Input
                id="stockAtual"
                type="number"
                value={formData.stockAtual}
                onChange={(e) => setFormData({ ...formData, stockAtual: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
