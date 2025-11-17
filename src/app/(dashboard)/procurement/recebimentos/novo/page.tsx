
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface ItemRecebimento {
  id: string;
  descricao: string;
  quantidadePedida: number;
  quantidadeRecebida: number;
  unidade: string;
}

export default function NovoRecebimentoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    numeroPedido: '',
    fornecedor: '',
    dataRecebimento: new Date().toISOString().split('T')[0],
    responsavel: '',
    observacoes: '',
  });

  const [itens, setItens] = useState<ItemRecebimento[]>([
    { id: '1', descricao: '', quantidadePedida: 0, quantidadeRecebida: 0, unidade: 'un' }
  ]);

  const handleAddItem = () => {
    const novoItem: ItemRecebimento = {
      id: `item_${Date.now()}`,
      descricao: '',
      quantidadePedida: 0,
      quantidadeRecebida: 0,
      unidade: 'un'
    };
    setItens([...itens, novoItem]);
  };

  const handleRemoveItem = (id: string) => {
    if (itens.length > 1) {
      setItens(itens.filter(item => item.id !== id));
    } else {
      toast.error('Deve haver pelo menos um item');
    }
  };

  const handleUpdateItem = (id: string, field: string, value: any) => {
    setItens(itens.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.numeroPedido || !formData.fornecedor || !formData.responsavel) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (itens.some(item => !item.descricao || item.quantidadeRecebida === 0)) {
      toast.error('Preencha todos os itens');
      return;
    }

    toast.success('Recebimento registrado com sucesso');
    setTimeout(() => {
      router.push('/procurement/recebimentos');
    }, 1500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Novo Recebimento</h1>
          <p className="text-muted-foreground mt-2">Registre um novo recebimento de encomenda</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Informações Gerais */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Gerais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numeroPedido">Número do Pedido *</Label>
                <Input
                  id="numeroPedido"
                  value={formData.numeroPedido}
                  onChange={(e) => setFormData(prev => ({ ...prev, numeroPedido: e.target.value }))}
                  placeholder="Ex: PC001"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fornecedor">Fornecedor *</Label>
                <Select value={formData.fornecedor} onValueChange={(value) => setFormData(prev => ({ ...prev, fornecedor: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fornecedor-a">Fornecedor A</SelectItem>
                    <SelectItem value="fornecedor-b">Fornecedor B</SelectItem>
                    <SelectItem value="fornecedor-c">Fornecedor C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dataRecebimento">Data de Recebimento *</Label>
                <Input
                  id="dataRecebimento"
                  type="date"
                  value={formData.dataRecebimento}
                  onChange={(e) => setFormData(prev => ({ ...prev, dataRecebimento: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsavel">Responsável *</Label>
                <Input
                  id="responsavel"
                  value={formData.responsavel}
                  onChange={(e) => setFormData(prev => ({ ...prev, responsavel: e.target.value }))}
                  placeholder="Nome do responsável"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                placeholder="Adicione observações sobre o recebimento..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Itens Recebidos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Itens Recebidos</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((item, index) => (
              <div key={item.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Item {index + 1}</p>
                  {itens.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Descrição *</Label>
                  <Input
                    value={item.descricao}
                    onChange={(e) => handleUpdateItem(item.id, 'descricao', e.target.value)}
                    placeholder="Descrição do item"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Quantidade Pedida</Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.quantidadePedida}
                      onChange={(e) => handleUpdateItem(item.id, 'quantidadePedida', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Quantidade Recebida *</Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.quantidadeRecebida}
                      onChange={(e) => handleUpdateItem(item.id, 'quantidadeRecebida', parseInt(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Select value={item.unidade} onValueChange={(value) => handleUpdateItem(item.id, 'unidade', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="un">Unidade</SelectItem>
                        <SelectItem value="kg">Quilograma</SelectItem>
                        <SelectItem value="l">Litro</SelectItem>
                        <SelectItem value="m">Metro</SelectItem>
                        <SelectItem value="caixa">Caixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Botões */}
        <div className="flex gap-4 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button type="submit" className="gap-2">
            <Save className="h-4 w-4" />
            Registrar Recebimento
          </Button>
        </div>
      </form>
    </div>
  );
}
