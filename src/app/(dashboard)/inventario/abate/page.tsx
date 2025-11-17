
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Minus,
  Search,
  AlertTriangle,
  Package,
  Calendar,
  FileText
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
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { usePagination } from '@/hooks/usePagination';

interface AbateStock {
  id: string;
  produtoId: string;
  nomeProduto: string;
  quantidade: number;
  motivo: string;
  observacoes?: string;
  responsavel: string;
  dataAbate: string;
  valorUnitario: number;
  valorTotal: number;
}

const motivosAbate = [
  'Produto Vencido',
  'Produto Danificado',
  'Produto Quebrado',
  'Perda por Roubo',
  'Deterioração',
  'Recall do Fabricante',
  'Erro de Inventário',
  'Outros'
];

const produtosMock = [
  { id: '1', nome: 'Coca-Cola 500ml', stock: 100, precoCompra: 35 },
  { id: '2', nome: 'Arroz Tipo 1 - 1kg', stock: 250, precoCompra: 85 },
  { id: '3', nome: 'Óleo de Cozinha 900ml', stock: 40, precoCompra: 110 }
];

export default function AbateStockPage() {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [formData, setFormData] = useState({
    produtoId: '',
    quantidade: '',
    motivo: '',
    observacoes: '',
    responsavel: ''
  });

  const [abates, setAbates] = useState<AbateStock[]>([
    {
      id: '1',
      produtoId: '1',
      nomeProduto: 'Coca-Cola 500ml',
      quantidade: 5,
      motivo: 'Produto Vencido',
      observacoes: 'Lote vencido em 15/01/2024',
      responsavel: 'João Silva',
      dataAbate: '2024-01-20',
      valorUnitario: 35,
      valorTotal: 175
    }
  ]);

  const dadosFiltrados = useMemo(() => {
    return abates.filter(abate =>
      abate.nomeProduto.toLowerCase().includes(busca.toLowerCase()) ||
      abate.motivo.toLowerCase().includes(busca.toLowerCase())
    );
  }, [abates, busca]);

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: dadosFiltrados, initialItemsPerPage: 10 });

  const handleNovoAbate = () => {
    setFormData({
      produtoId: '',
      quantidade: '',
      motivo: '',
      observacoes: '',
      responsavel: ''
    });
    setDialogAberto(true);
  };

  const handleSalvar = () => {
    if (!formData.produtoId || !formData.quantidade || !formData.motivo || !formData.responsavel) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const produto = produtosMock.find(p => p.id === formData.produtoId);
    if (!produto) return;

    const quantidade = parseInt(formData.quantidade);
    if (quantidade > produto.stock) {
      toast.error('Quantidade superior ao stock disponível');
      return;
    }

    const novoAbate: AbateStock = {
      id: Date.now().toString(),
      produtoId: formData.produtoId,
      nomeProduto: produto.nome,
      quantidade: quantidade,
      motivo: formData.motivo,
      observacoes: formData.observacoes,
      responsavel: formData.responsavel,
      dataAbate: new Date().toISOString().split('T')[0],
      valorUnitario: produto.precoCompra,
      valorTotal: quantidade * produto.precoCompra
    };

    setAbates([novoAbate, ...abates]);
    setDialogAberto(false);
    toast.success('Abate registado com sucesso!');
  };

  const calcularTotalAbates = () => {
    return abates.reduce((total, abate) => total + abate.valorTotal, 0);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Minus className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Abate de Stock</h1>
            <p className="text-muted-foreground">Registar produtos danificados, vencidos ou perdidos</p>
          </div>
        </div>
        <Button className="gap-2" onClick={handleNovoAbate}>
          <Minus className="h-4 w-4" />
          Novo Abate
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Abates</p>
                <p className="text-2xl font-bold">{abates.length}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Itens Abatidos</p>
                <p className="text-2xl font-bold">
                  {abates.reduce((total, abate) => total + abate.quantidade, 0)}
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
                <p className="text-sm text-muted-foreground">Valor Total Perdido</p>
                <p className="text-2xl font-bold text-red-600">
                  MT {calcularTotalAbates().toFixed(2)}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por produto ou motivo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Abates ({dadosFiltrados.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium">Data</th>
                  <th className="text-left p-4 font-medium">Produto</th>
                  <th className="text-left p-4 font-medium">Quantidade</th>
                  <th className="text-left p-4 font-medium">Motivo</th>
                  <th className="text-left p-4 font-medium">Responsável</th>
                  <th className="text-left p-4 font-medium">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((abate) => (
                  <tr key={abate.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {new Date(abate.dataAbate).toLocaleDateString('pt-PT')}
                      </div>
                    </td>
                    <td className="p-4">
                      <div>
                        <div className="font-medium">{abate.nomeProduto}</div>
                        {abate.observacoes && (
                          <div className="text-sm text-muted-foreground">{abate.observacoes}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant="destructive">{abate.quantidade} UN</Badge>
                    </td>
                    <td className="p-4">
                      <Badge variant="secondary">{abate.motivo}</Badge>
                    </td>
                    <td className="p-4">{abate.responsavel}</td>
                    <td className="p-4 font-medium text-red-600">
                      MT {abate.valorTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dadosFiltrados.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhum abate registado</p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar Abate de Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="produto">Produto *</Label>
              <Select value={formData.produtoId} onValueChange={(value) => setFormData({ ...formData, produtoId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar produto" />
                </SelectTrigger>
                <SelectContent>
                  {produtosMock.map(produto => (
                    <SelectItem key={produto.id} value={produto.id}>
                      {produto.nome} (Stock: {produto.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input
                id="quantidade"
                type="number"
                min="1"
                placeholder="0"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo *</Label>
              <Select value={formData.motivo} onValueChange={(value) => setFormData({ ...formData, motivo: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivosAbate.map(motivo => (
                    <SelectItem key={motivo} value={motivo}>
                      {motivo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável *</Label>
              <Input
                id="responsavel"
                placeholder="Nome do responsável"
                value={formData.responsavel}
                onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Detalhes adicionais sobre o abate..."
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar}>Registar Abate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
