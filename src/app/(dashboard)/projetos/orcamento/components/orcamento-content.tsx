
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { OrcamentoStorage } from '@/lib/storage/projeto-storage';
import { ProjetoStorage } from '@/lib/storage/projeto-storage';
import { OrcamentoProjeto, ItemOrcamento } from '@/types/projeto';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function OrcamentoContent() {
  const searchParams = useSearchParams();
  const projetoId = searchParams.get('projetoId');

  const [orcamentos, setOrcamentos] = useState<OrcamentoProjeto[]>([]);
  const [projeto, setProjeto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    categoria: 'mao_obra' as const,
    descricao: '',
    quantidade: '1',
    valorUnitario: '0',
    fornecedor: '',
  });

  useEffect(() => {
    const data = OrcamentoStorage.getOrcamentos();
    if (projetoId) {
      const filtered = data.filter(o => o.projetoId === projetoId);
      setOrcamentos(filtered);
      const proj = ProjetoStorage.getProjetoById(projetoId);
      setProjeto(proj);
    } else {
      setOrcamentos(data);
    }
    setLoading(false);
  }, [projetoId]);

  const handleAddItem = () => {
    if (!formData.descricao || !formData.valorUnitario) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const novoItem: ItemOrcamento = {
      id: `item_${Date.now()}`,
      descricao: formData.descricao,
      quantidade: parseFloat(formData.quantidade) || 1,
      valorUnitario: parseFloat(formData.valorUnitario) || 0,
      valorTotal: (parseFloat(formData.quantidade) || 1) * (parseFloat(formData.valorUnitario) || 0),
      fornecedor: formData.fornecedor,
      dataCompra: new Date().toISOString().split('T')[0],
    };

    if (orcamentos.length === 0 && projetoId) {
      const novoOrcamento: OrcamentoProjeto = {
        id: `orcamento_${Date.now()}`,
        tenantId: 'default',
        projetoId: projetoId,
        projetoNome: projeto?.nome || '',
        versao: 1,
        status: 'rascunho',
        categorias: [
          {
            id: `cat_${Date.now()}`,
            nome: formData.categoria,
            tipo: formData.categoria,
            valorPlanejado: novoItem.valorTotal,
            valorUtilizado: 0,
            valorRestante: novoItem.valorTotal,
            itens: [novoItem],
          },
        ],
        totalPlanejado: novoItem.valorTotal,
        totalUtilizado: 0,
        totalRestante: novoItem.valorTotal,
        dataCriacao: new Date().toISOString(),
        dataAtualizacao: new Date().toISOString(),
      };
      OrcamentoStorage.addOrcamento(novoOrcamento);
      setOrcamentos([novoOrcamento]);
    } else if (orcamentos.length > 0) {
      const orcamentoAtualizado = { ...orcamentos[0] };
      const categoriaExistente = orcamentoAtualizado.categorias.find(c => c.tipo === formData.categoria);

      if (categoriaExistente) {
        categoriaExistente.itens.push(novoItem);
        categoriaExistente.valorPlanejado += novoItem.valorTotal;
        categoriaExistente.valorRestante = categoriaExistente.valorPlanejado - categoriaExistente.valorUtilizado;
      } else {
        orcamentoAtualizado.categorias.push({
          id: `cat_${Date.now()}`,
          nome: formData.categoria,
          tipo: formData.categoria,
          valorPlanejado: novoItem.valorTotal,
          valorUtilizado: 0,
          valorRestante: novoItem.valorTotal,
          itens: [novoItem],
        });
      }

      orcamentoAtualizado.totalPlanejado = orcamentoAtualizado.categorias.reduce((acc, c) => acc + c.valorPlanejado, 0);
      orcamentoAtualizado.totalRestante = orcamentoAtualizado.totalPlanejado - orcamentoAtualizado.totalUtilizado;

      OrcamentoStorage.updateOrcamento(orcamentos[0].id, orcamentoAtualizado);
      setOrcamentos([orcamentoAtualizado]);
    }

    setOpenDialog(false);
    setFormData({
      categoria: 'mao_obra',
      descricao: '',
      quantidade: '1',
      valorUnitario: '0',
      fornecedor: '',
    });
    toast.success('Item adicionado ao orçamento');
  };

  if (loading) {
    return <div className="container mx-auto p-6">Carregando...</div>;
  }

  const orcamentoAtual = orcamentos[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gestão de Orçamento</h1>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Item ao Orçamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <Select value={formData.categoria} onValueChange={(value) => setFormData(prev => ({ ...prev, categoria: value as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mao_obra">Mão de Obra</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="equipamento">Equipamento</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição *</Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                  placeholder="Descrição do item"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantidade">Quantidade</Label>
                  <Input
                    id="quantidade"
                    type="number"
                    value={formData.quantidade}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantidade: e.target.value }))}
                    placeholder="1"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valorUnitario">Valor Unitário (MT) *</Label>
                  <Input
                    id="valorUnitario"
                    type="number"
                    value={formData.valorUnitario}
                    onChange={(e) => setFormData(prev => ({ ...prev, valorUnitario: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <Input
                  id="fornecedor"
                  value={formData.fornecedor}
                  onChange={(e) => setFormData(prev => ({ ...prev, fornecedor: e.target.value }))}
                  placeholder="Nome do fornecedor"
                />
              </div>

              <Button onClick={handleAddItem} className="w-full">
                Adicionar Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {orcamentoAtual && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Orçamento Planejado</p>
                <p className="text-2xl font-bold">MT {orcamentoAtual.totalPlanejado.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Utilizado</p>
                <p className="text-2xl font-bold">MT {orcamentoAtual.totalUtilizado.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Restante</p>
                <p className="text-2xl font-bold">MT {orcamentoAtual.totalRestante.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">% Utilizado</p>
                <p className="text-2xl font-bold">
                  {((orcamentoAtual.totalUtilizado / orcamentoAtual.totalPlanejado) * 100).toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Categorias de Orçamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {orcamentoAtual?.categorias.map((categoria) => (
            <div key={categoria.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg capitalize">{categoria.nome}</h3>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Planejado</p>
                  <p className="font-bold">MT {categoria.valorPlanejado.toFixed(2)}</p>
                </div>
              </div>

              <div className="overflow-x-auto mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Quantidade</TableHead>
                      <TableHead>Valor Unitário (MT)</TableHead>
                      <TableHead>Valor Total (MT)</TableHead>
                      <TableHead>Fornecedor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoria.itens.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.descricao}</TableCell>
                        <TableCell>{item.quantidade}</TableCell>
                        <TableCell>MT {item.valorUnitario.toFixed(2)}</TableCell>
                        <TableCell>MT {item.valorTotal.toFixed(2)}</TableCell>
                        <TableCell>{item.fornecedor || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Planejado</p>
                  <p className="font-bold">MT {categoria.valorPlanejado.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Utilizado</p>
                  <p className="font-bold">MT {categoria.valorUtilizado.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Restante</p>
                  <p className="font-bold">MT {categoria.valorRestante.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
