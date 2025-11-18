'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  User,
  Package,
  Plus,
  Trash2,
  FileText,
  Save,
  X,
  Calculator
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { ItemFatura } from '@/types/fatura';

interface Cliente {
  id: string;
  nome: string;
  nuit: string;
  email: string;
  telefone: string;
}

interface Ajuste {
  id: string;
  descricao: string;
  preco: number;
  taxaIva: number;
}

const clientesMock: Cliente[] = [
  { id: '1', nome: 'João Silva', nuit: '123456789', email: 'joao@email.com', telefone: '+258 84 123 4567' },
  { id: '2', nome: 'Empresa ABC Lda', nuit: '987654321', email: 'contato@abc.co.mz', telefone: '+258 21 123 456' },
  { id: '3', nome: 'Maria Santos', nuit: '456789123', email: 'maria@email.com', telefone: '+258 86 987 6543' }
];

const ajustesMock: Ajuste[] = [
  { id: '1', descricao: 'Serviços adicionais', preco: 3500, taxaIva: 16 },
  { id: '2', descricao: 'Custos logísticos', preco: 1500, taxaIva: 16 },
  { id: '3', descricao: 'Atualização de tabela', preco: 2500, taxaIva: 16 }
];

export default function NotaDebitoPage() {
  const router = useRouter();
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [dialogClienteAberto, setDialogClienteAberto] = useState(false);
  const [dialogAjusteAberto, setDialogAjusteAberto] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [buscaAjuste, setBuscaAjuste] = useState('');
  const [itens, setItens] = useState<ItemFatura[]>([]);
  const [motivo, setMotivo] = useState('Serviços adicionais não faturados');
  const [observacoes, setObservacoes] = useState('');

  const clientesFiltrados = useMemo(() => {
    return clientesMock.filter(
      (c) => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()) || c.nuit.includes(buscaCliente)
    );
  }, [buscaCliente]);

  const ajustesFiltrados = useMemo(() => {
    return ajustesMock.filter((a) => a.descricao.toLowerCase().includes(buscaAjuste.toLowerCase()));
  }, [buscaAjuste]);

  const handleSelecionarCliente = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setDialogClienteAberto(false);
    setBuscaCliente('');
  };

  const handleAdicionarAjuste = (ajuste: Ajuste) => {
    const novoItem: ItemFatura = {
      id: Date.now().toString(),
      produtoId: ajuste.id,
      descricao: ajuste.descricao,
      quantidade: 1,
      precoUnitario: ajuste.preco,
      desconto: 0,
      taxaIva: ajuste.taxaIva,
      subtotal: ajuste.preco,
      ivaItem: ajuste.preco * (ajuste.taxaIva / 100),
      total: ajuste.preco + ajuste.preco * (ajuste.taxaIva / 100)
    };
    setItens((prev) => [...prev, novoItem]);
    setDialogAjusteAberto(false);
    setBuscaAjuste('');
  };

  const handleAtualizarItem = (id: string, campo: keyof ItemFatura, valor: any) => {
    setItens((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const atualizado = { ...item, [campo]: valor };
        const subtotal = atualizado.quantidade * atualizado.precoUnitario - atualizado.desconto;
        const ivaItem = subtotal * (atualizado.taxaIva / 100);
        const total = subtotal + ivaItem;
        return { ...atualizado, subtotal, ivaItem, total };
      })
    );
  };

  const handleRemoverItem = (id: string) => {
    setItens((prev) => prev.filter((item) => item.id !== id));
  };

  const totais = useMemo(() => {
    const subtotal = itens.reduce((acc, item) => acc + item.subtotal, 0);
    const ivaTotal = itens.reduce((acc, item) => acc + item.ivaItem, 0);
    const total = subtotal + ivaTotal;
    return { subtotal, ivaTotal, total };
  }, [itens]);

  const handleGerarNota = () => {
    if (!clienteSelecionado) {
      toast.error('Selecione um cliente');
      return;
    }
    if (itens.length === 0) {
      toast.error('Adicione pelo menos um ajuste');
      return;
    }

    const notaDebito = {
      clienteId: clienteSelecionado.id,
      cliente: clienteSelecionado,
      itens,
      subtotal: totais.subtotal,
      ivaTotal: totais.ivaTotal,
      total: totais.total,
      motivo,
      observacoes,
      dataEmissao: new Date().toISOString()
    };

    console.log('Nota de débito gerada:', notaDebito);
    toast.success('Nota de débito criada com sucesso!');
    setTimeout(() => router.push('/vendas/notas-debito'), 1500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nova Nota de Débito</h1>
          <p className="text-muted-foreground">Registar valores adicionais a cobrar ao cliente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/vendas/notas-debito')}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleGerarNota} disabled={!clienteSelecionado || itens.length === 0}>
            <Save className="h-4 w-4 mr-2" />
            Gerar Nota de Débito
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
                  <Button variant="ghost" size="sm" onClick={() => setClienteSelecionado(null)}>
                    Alterar
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setDialogClienteAberto(true)}>
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
                  Ajustes/Serviços
                </CardTitle>
                <Button size="sm" onClick={() => setDialogAjusteAberto(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {itens.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum ajuste adicionado</p>
                  <p className="text-sm">Clique em "Adicionar" para incluir ajustes</p>
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
                        <Button variant="ghost" size="icon" onClick={() => handleRemoverItem(item.id)}>
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
                          <Input type="text" value={item.total.toFixed(2)} disabled className="bg-muted" />
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
              <CardTitle>Motivo e Observações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Motivo *</Label>
                <Select value={motivo} onValueChange={(value: any) => setMotivo(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Serviços adicionais não faturados">Serviços adicionais não faturados</SelectItem>
                    <SelectItem value="Atualização contratual">Atualização contratual</SelectItem>
                    <SelectItem value="Correção de preço">Correção de preço</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {motivo === 'Outro' && (
                <div>
                  <Label>Descreva o motivo *</Label>
                  <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Descreva o motivo" />
                </div>
              )}
              <div>
                <Label>Observações</Label>
                <Textarea
                  placeholder="Observações adicionais..."
                  value={motivo === 'Outro' ? '' : observacoes}
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
                Resumo da Nota de Débito
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{totais.subtotal.toFixed(2)} MT</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IVA Total:</span>
                  <span className="font-medium">{totais.ivaTotal.toFixed(2)} MT</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="font-semibold text-lg">Total a Debitar:</span>
                    <span className="font-bold text-2xl text-primary">{totais.total.toFixed(2)} MT</span>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Itens:</span>
                  <span className="font-medium text-foreground">{itens.length}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Quantidade Total:</span>
                  <span className="font-medium text-foreground">
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
              <Button className="w-full" onClick={handleGerarNota} disabled={!clienteSelecionado || itens.length === 0}>
                <FileText className="h-4 w-4 mr-2" />
                Gerar Nota de Débito
              </Button>
              <Button variant="outline" className="w-full" onClick={handleGerarNota} disabled={!clienteSelecionado || itens.length === 0}>
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
                  className="p-4 border rounded-lg hover:bg-muted cursor-pointer"
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

      <Dialog open={dialogAjusteAberto} onOpenChange={setDialogAjusteAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Ajuste</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar ajuste ou serviço..."
                value={buscaAjuste}
                onChange={(e) => setBuscaAjuste(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {ajustesFiltrados.map((ajuste) => (
                <div
                  key={ajuste.id}
                  className="p-4 border rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => handleAdicionarAjuste(ajuste)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold">{ajuste.descricao}</h4>
                      <p className="text-sm text-muted-foreground">IVA: {ajuste.taxaIva}%</p>
                    </div>
                    <p className="font-bold text-lg">{ajuste.preco.toFixed(2)} MT</p>
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
