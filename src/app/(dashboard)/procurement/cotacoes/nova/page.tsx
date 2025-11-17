
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

interface ItemCotacao {
  id: string;
  descricao: string;
  quantidade: number;
  unidade: string;
}

export default function NovaCotacaoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    requisicaoId: '',
    dataValidade: '',
    observacoes: '',
  });

  const [itens, setItens] = useState<ItemCotacao[]>([
    { id: '1', descricao: '', quantidade: 1, unidade: 'un' }
  ]);

  const [fornecedores, setFornecedores] = useState<string[]>(['']);

  const handleAddItem = () => {
    const novoItem: ItemCotacao = {
      id: `item_${Date.now()}`,
      descricao: '',
      quantidade: 1,
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

  const handleAddFornecedor = () => {
    setFornecedores([...fornecedores, '']);
  };

  const handleRemoveFornecedor = (index: number) => {
    if (fornecedores.length > 1) {
      setFornecedores(fornecedores.filter((_, i) => i !== index));
    } else {
      toast.error('Deve haver pelo menos um fornecedor');
    }
  };

  const handleUpdateFornecedor = (index: number, value: string) => {
    const novosFornecedores = [...fornecedores];
    novosFornecedores[index] = value;
    setFornecedores(novosFornecedores);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.dataValidade) {
      toast.error('Defina a data de validade');
      return;
    }

    if (itens.some(item => !item.descricao)) {
      toast.error('Preencha a descrição de todos os itens');
      return;
    }

    if (fornecedores.some(f => !f)) {
      toast.error('Selecione todos os fornecedores');
      return;
    }

    toast.success('Cotação criada com sucesso');
    setTimeout(() => {
      router.push('/procurement/cotacoes');
    }, 1500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Nova Cotação de Compra</h1>
          <p className="text-muted-foreground mt-2">Crie uma nova cotação para solicitar ofertas de fornecedores</p>
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
                <Label htmlFor="requisicaoId">Requisição (Opcional)</Label>
                <Select value={formData.requisicaoId} onValueChange={(value) => setFormData(prev => ({ ...prev, requisicaoId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma requisição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sem Requisição</SelectItem>
                    <SelectItem value="REQ-2024-001">REQ-2024-001</SelectItem>
                    <SelectItem value="REQ-2024-002">REQ-2024-002</SelectItem>
                    <SelectItem value="REQ-2024-003">REQ-2024-003</SelectItem>
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
                placeholder="Adicione observações sobre a cotação..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Itens da Cotação */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Itens da Cotação</CardTitle>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <Label>Descrição *</Label>
                    <Input
                      value={item.descricao}
                      onChange={(e) => handleUpdateItem(item.id, 'descricao', e.target.value)}
                      placeholder="Descrição do item"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) => handleUpdateItem(item.id, 'quantidade', parseInt(e.target.value))}
                    />
                  </div>
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
                      <SelectItem value="pct">Pacote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Fornecedores */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Fornecedores</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFornecedor}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Fornecedor
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {fornecedores.map((fornecedor, index) => (
              <div key={index} className="flex gap-2">
                <Select value={fornecedor} onValueChange={(value) => handleUpdateFornecedor(index, value)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fornecedor-a">Fornecedor A</SelectItem>
                    <SelectItem value="fornecedor-b">Fornecedor B</SelectItem>
                    <SelectItem value="fornecedor-c">Fornecedor C</SelectItem>
                    <SelectItem value="fornecedor-d">Fornecedor D</SelectItem>
                  </SelectContent>
                </Select>
                {fornecedores.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveFornecedor(index)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                )}
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
            Criar Cotação
          </Button>
        </div>
      </form>
    </div>
  );
}
