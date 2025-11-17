
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
import { ArrowUpCircle, ArrowDownCircle, RefreshCw, Save, X } from 'lucide-react';
import { toast } from 'sonner';

export default function NovaMovimentacaoPage() {
  const router = useRouter();
  const [tipoMovimentacao, setTipoMovimentacao] = useState<'entrada' | 'saida' | 'ajuste'>('entrada');
  const [formData, setFormData] = useState({
    produto: '',
    quantidade: '',
    motivo: '',
    observacoes: '',
    referencia: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.produto || !formData.quantidade || !formData.motivo) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    toast.success('Movimentação registrada com sucesso');
    setTimeout(() => {
      router.push('/stock/movimentacao');
    }, 1500);
  };

  const getTipoIcon = () => {
    switch (tipoMovimentacao) {
      case 'entrada':
        return <ArrowUpCircle className="h-5 w-5 text-green-600" />;
      case 'saida':
        return <ArrowDownCircle className="h-5 w-5 text-red-600" />;
      case 'ajuste':
        return <RefreshCw className="h-5 w-5 text-orange-600" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Nova Movimentação de Stock</h1>
          <p className="text-muted-foreground mt-2">Registre uma nova movimentação de inventário</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de Movimentação */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getTipoIcon()}
              Tipo de Movimentação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => setTipoMovimentacao('entrada')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  tipoMovimentacao === 'entrada'
                    ? 'border-green-600 bg-green-50 dark:bg-green-950'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <ArrowUpCircle className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="font-medium">Entrada</p>
                <p className="text-sm text-muted-foreground">Recebimento de mercadorias</p>
              </button>

              <button
                type="button"
                onClick={() => setTipoMovimentacao('saida')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  tipoMovimentacao === 'saida'
                    ? 'border-red-600 bg-red-50 dark:bg-red-950'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <ArrowDownCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                <p className="font-medium">Saída</p>
                <p className="text-sm text-muted-foreground">Saída de mercadorias</p>
              </button>

              <button
                type="button"
                onClick={() => setTipoMovimentacao('ajuste')}
                className={`p-4 border-2 rounded-lg transition-all ${
                  tipoMovimentacao === 'ajuste'
                    ? 'border-orange-600 bg-orange-50 dark:bg-orange-950'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <RefreshCw className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                <p className="font-medium">Ajuste</p>
                <p className="text-sm text-muted-foreground">Ajuste de inventário</p>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Dados da Movimentação */}
        <Card>
          <CardHeader>
            <CardTitle>Dados da Movimentação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="produto">Produto *</Label>
                <Select value={formData.produto} onValueChange={(value) => setFormData(prev => ({ ...prev, produto: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coca-cola-500ml">Coca-Cola 500ml</SelectItem>
                    <SelectItem value="arroz-1kg">Arroz Tipo 1 - 1kg</SelectItem>
                    <SelectItem value="oleo-900ml">Óleo de Cozinha 900ml</SelectItem>
                    <SelectItem value="acucar-1kg">Açúcar - 1kg</SelectItem>
                    <SelectItem value="sal-1kg">Sal - 1kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantidade">Quantidade *</Label>
                <Input
                  id="quantidade"
                  type="number"
                  min="1"
                  value={formData.quantidade}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantidade: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="motivo">Motivo *</Label>
                <Select value={formData.motivo} onValueChange={(value) => setFormData(prev => ({ ...prev, motivo: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipoMovimentacao === 'entrada' && (
                      <>
                        <SelectItem value="compra">Compra de Fornecedor</SelectItem>
                        <SelectItem value="devolucao">Devolução de Cliente</SelectItem>
                        <SelectItem value="transferencia">Transferência de Armazém</SelectItem>
                        <SelectItem value="producao">Produção Interna</SelectItem>
                      </>
                    )}
                    {tipoMovimentacao === 'saida' && (
                      <>
                        <SelectItem value="venda">Venda</SelectItem>
                        <SelectItem value="devolucao">Devolução a Fornecedor</SelectItem>
                        <SelectItem value="transferencia">Transferência de Armazém</SelectItem>
                        <SelectItem value="consumo">Consumo Interno</SelectItem>
                      </>
                    )}
                    {tipoMovimentacao === 'ajuste' && (
                      <>
                        <SelectItem value="quebra">Quebra/Dano</SelectItem>
                        <SelectItem value="roubo">Roubo/Perda</SelectItem>
                        <SelectItem value="reconciliacao">Reconciliação de Inventário</SelectItem>
                        <SelectItem value="correcao">Correção de Erro</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="referencia">Referência (Opcional)</Label>
                <Input
                  id="referencia"
                  value={formData.referencia}
                  onChange={(e) => setFormData(prev => ({ ...prev, referencia: e.target.value }))}
                  placeholder="Nº Pedido, Nº Fatura, etc."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                placeholder="Adicione observações sobre esta movimentação..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <p className="text-lg font-bold capitalize">{tipoMovimentacao}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Produto</p>
                <p className="text-lg font-bold">{formData.produto || 'Não selecionado'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Quantidade</p>
                <p className="text-lg font-bold">{formData.quantidade || '0'}</p>
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
            Registrar Movimentação
          </Button>
        </div>
      </form>
    </div>
  );
}
