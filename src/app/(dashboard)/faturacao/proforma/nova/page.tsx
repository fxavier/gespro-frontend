
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

interface ItemProforma {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  unidade: string;
}

export default function NovaProformaPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    cliente: '',
    dataValidade: '',
    observacoes: '',
  });

  const [itens, setItens] = useState<ItemProforma[]>([
    { id: '1', descricao: '', quantidade: 1, valorUnitario: 0, unidade: 'un' }
  ]);

  const handleAddItem = () => {
    const novoItem: ItemProforma = {
      id: `item_${Date.now()}`,
      descricao: '',
      quantidade: 1,
      valorUnitario: 0,
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

  const calcularTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valorUnitario), 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.cliente || !formData.dataValidade) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (itens.some(item => !item.descricao || item.valorUnitario === 0)) {
      toast.error('Preencha todos os itens com descrição e valor');
      return;
    }

    toast.success('Proforma criada com sucesso');
    setTimeout(() => {
      router.push('/faturacao/proforma');
    }, 1500);
  };

  const total = calcularTotal();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Nova Fatura Proforma</h1>
          <p className="text-muted-foreground mt-2">Crie uma nova fatura proforma para o cliente</p>
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
                <Label htmlFor="cliente">Cliente *</Label>
                <Select value={formData.cliente} onValueChange={(value) => setFormData(prev => ({ ...prev, cliente: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="joao-silva">João Silva</SelectItem>
                    <SelectItem value="empresa-abc">Empresa ABC Lda</SelectItem>
                    <SelectItem value="maria-santos">Maria Santos</SelectItem>
                    <SelectItem value="comercio-xyz">Comércio XYZ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataValidade">Data de Validade *</Label>
                <Input
                  id="dataValidade"
                  type="date"
                  value={formData.dataValidade}
                  onChange={(e) => setFormData(prev => ({ ...prev, dataValidade: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                placeholder="Adicione observações sobre a proforma..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Itens da Proforma */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Itens da Proforma</CardTitle>
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

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) => handleUpdateItem(item.id, 'quantidade', parseInt(e.target.value))}
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
                        <SelectItem value="m2">Metro Quadrado</SelectItem>
                        <SelectItem value="caixa">Caixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Valor Unitário (MT) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.valorUnitario}
                      onChange={(e) => handleUpdateItem(item.id, 'valorUnitario', parseFloat(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Subtotal</Label>
                    <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                      <span className="font-bold">MT {(item.quantidade * item.valorUnitario).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Resumo */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">MT {total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Impostos (0%):</span>
                <span className="font-medium">MT 0.00</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-bold">Total:</span>
                <span className="text-2xl font-bold text-blue-600">MT {total.toFixed(2)}</span>
              </div>
            </div>
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
            Criar Proforma
          </Button>
        </div>
      </form>
    </div>
  );
}
