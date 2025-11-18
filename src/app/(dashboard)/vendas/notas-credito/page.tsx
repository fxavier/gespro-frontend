'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  FileText,
  Save,
  X,
  AlertCircle,
  Calculator,
  CheckCircle
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
import type { Fatura, ItemFatura } from '@/types/fatura';

const faturasMock: Fatura[] = [
  {
    id: '1',
    tenantId: '1',
    numeroFatura: 'FT2024/001',
    serie: 'A',
    clienteId: '1',
    itens: [
      {
        id: '1',
        produtoId: '1',
        descricao: 'Coca-Cola 500ml',
        quantidade: 10,
        precoUnitario: 50,
        desconto: 0,
        taxaIva: 16,
        subtotal: 500,
        ivaItem: 80,
        total: 580
      },
      {
        id: '2',
        produtoId: '2',
        descricao: 'Arroz Tipo 1 - 1kg',
        quantidade: 5,
        precoUnitario: 120,
        desconto: 0,
        taxaIva: 16,
        subtotal: 600,
        ivaItem: 96,
        total: 696
      }
    ],
    subtotal: 1100,
    descontoTotal: 0,
    ivaTotal: 176,
    total: 1276,
    statusFatura: 'paga',
    dataEmissao: '2024-01-15',
    dataVencimento: '2024-02-15',
    dataPagamento: '2024-01-20',
    qrCode: '',
    hashValidacao: ''
  },
  {
    id: '2',
    tenantId: '1',
    numeroFatura: 'FT2024/002',
    serie: 'A',
    clienteId: '2',
    itens: [
      {
        id: '3',
        produtoId: '3',
        descricao: 'Óleo de Cozinha 900ml',
        quantidade: 20,
        precoUnitario: 150,
        desconto: 0,
        taxaIva: 16,
        subtotal: 3000,
        ivaItem: 480,
        total: 3480
      }
    ],
    subtotal: 3000,
    descontoTotal: 0,
    ivaTotal: 480,
    total: 3480,
    statusFatura: 'paga',
    dataEmissao: '2024-01-18',
    dataVencimento: '2024-02-18',
    dataPagamento: '2024-01-25',
    qrCode: '',
    hashValidacao: ''
  }
];

const motivosCredito = [
  'Devolução de mercadoria',
  'Produto com defeito',
  'Erro no valor cobrado',
  'Cancelamento de venda',
  'Desconto posterior',
  'Outro motivo'
];

interface ItemSelecionado extends ItemFatura {
  selecionado: boolean;
  quantidadeCredito: number;
}

export default function NotaCreditoPage() {
  const router = useRouter();
  const [dialogFaturaAberto, setDialogFaturaAberto] = useState(false);
  const [buscaFatura, setBuscaFatura] = useState('');
  const [faturaSelecionada, setFaturaSelecionada] = useState<Fatura | null>(null);
  const [itens, setItens] = useState<ItemSelecionado[]>([]);
  const [motivo, setMotivo] = useState('');
  const [motivoOutro, setMotivoOutro] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const faturasFiltradas = useMemo(() => {
    return faturasMock.filter(
      (f) =>
        f.numeroFatura.toLowerCase().includes(buscaFatura.toLowerCase()) &&
        (f.statusFatura === 'paga' || f.statusFatura === 'emitida')
    );
  }, [buscaFatura]);

  const handleSelecionarFatura = (fatura: Fatura) => {
    setFaturaSelecionada(fatura);
    setItens(
      fatura.itens.map((item) => ({
        ...item,
        selecionado: false,
        quantidadeCredito: 0
      }))
    );
    setDialogFaturaAberto(false);
    setBuscaFatura('');
  };

  const handleToggleItem = (id: string, checked: boolean) => {
    setItens((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              selecionado: checked,
              quantidadeCredito: checked ? item.quantidade : 0
            }
          : item
      )
    );
  };

  const handleAtualizarQuantidade = (id: string, quantidade: number) => {
    setItens((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantidadeCredito: Math.max(0, Math.min(quantidade, item.quantidade)) }
          : item
      )
    );
  };

  const calcularTotais = () => {
    const selecionados = itens.filter((i) => i.selecionado && i.quantidadeCredito > 0);
    const subtotal = selecionados.reduce((acc, item) => {
      const proporcional = (item.subtotal / item.quantidade) * item.quantidadeCredito;
      return acc + proporcional;
    }, 0);
    const ivaTotal = selecionados.reduce((acc, item) => {
      const proporcional = (item.ivaItem / item.quantidade) * item.quantidadeCredito;
      return acc + proporcional;
    }, 0);
    const total = subtotal + ivaTotal;
    return { subtotal, ivaTotal, total, quantidadeItens: selecionados.length };
  };

  const totais = calcularTotais();

  const handleGerarNotaCredito = () => {
    if (!faturaSelecionada) {
      toast.error('Selecione uma fatura');
      return;
    }
    const selecionados = itens.filter((i) => i.selecionado && i.quantidadeCredito > 0);
    if (selecionados.length === 0) {
      toast.error('Selecione pelo menos um item para creditar');
      return;
    }
    if (!motivo) {
      toast.error('Selecione o motivo da nota de crédito');
      return;
    }
    if (motivo === 'Outro motivo' && !motivoOutro.trim()) {
      toast.error('Descreva o motivo da nota de crédito');
      return;
    }

    const notaCredito = {
      faturaOriginalId: faturaSelecionada.id,
      numeroFaturaOriginal: faturaSelecionada.numeroFatura,
      itens: selecionados.map((item) => ({ ...item, quantidade: item.quantidadeCredito })),
      motivo: motivo === 'Outro motivo' ? motivoOutro : motivo,
      subtotal: totais.subtotal,
      ivaTotal: totais.ivaTotal,
      total: totais.total,
      dataEmissao: new Date().toISOString(),
      observacoes
    };

    console.log('Nota de crédito gerada:', notaCredito);
    toast.success('Nota de crédito criada com sucesso!');
    setTimeout(() => router.push('/vendas/notas-credito'), 1500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Nova Nota de Crédito</h1>
          <p className="text-muted-foreground">Criar nota de crédito para devolução ou correção</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/vendas/notas-credito')}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleGerarNotaCredito} disabled={!faturaSelecionada || totais.quantidadeItens === 0 || !motivo}>
            <Save className="h-4 w-4 mr-2" />
            Gerar Nota de Crédito
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Fatura Original
              </CardTitle>
            </CardHeader>
            <CardContent>
              {faturaSelecionada ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-start p-4 border rounded-lg bg-muted/50">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{faturaSelecionada.numeroFatura}</h3>
                        <Badge variant="default">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {faturaSelecionada.statusFatura}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Data Emissão:</p>
                          <p className="font-medium">
                            {new Date(faturaSelecionada.dataEmissao).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Original:</p>
                          <p className="font-bold text-lg">{faturaSelecionada.total.toFixed(2)} MT</p>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setFaturaSelecionada(null); setItens([]); }}>
                      Alterar
                    </Button>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex gap-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">Informação Importante</p>
                        <p className="text-blue-700 dark:text-blue-300">
                          Selecione os itens que deseja creditar e ajuste as quantidades conforme necessário.
                          A nota de crédito será vinculada a esta fatura.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setDialogFaturaAberto(true)}>
                  <Search className="h-4 w-4 mr-2" />
                  Selecionar Fatura
                </Button>
              )}
            </CardContent>
          </Card>

          {faturaSelecionada && (
            <Card>
              <CardHeader>
                <CardTitle>Itens a Creditar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {itens.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={item.selecionado}
                          onCheckedChange={(checked) => handleToggleItem(item.id, checked as boolean)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium">{item.descricao}</h4>
                          <div className="grid grid-cols-3 gap-4 mt-2 text-sm text-muted-foreground">
                            <div>
                              <p>Qtd. Original: {item.quantidade}</p>
                            </div>
                            <div>
                              <p>Preço Unit.: {item.precoUnitario.toFixed(2)} MT</p>
                            </div>
                            <div>
                              <p>Total: {item.total.toFixed(2)} MT</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {item.selecionado && (
                        <div className="ml-8 pt-3 border-t">
                          <Label className="text-xs mb-2 block">Quantidade a Creditar</Label>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="number"
                              min="1"
                              max={item.quantidade}
                              value={item.quantidadeCredito}
                              onChange={(e) => handleAtualizarQuantidade(item.id, parseInt(e.target.value) || 0)}
                              className="w-32"
                            />
                            <span className="text-sm text-muted-foreground">de {item.quantidade} unidades</span>
                            <span className="ml-auto font-medium">
                              {((item.total / item.quantidade) * item.quantidadeCredito).toFixed(2)} MT
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {faturaSelecionada && (
            <Card>
              <CardHeader>
                <CardTitle>Motivo e Observações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Motivo da Nota de Crédito *</Label>
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {motivosCredito.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {motivo === 'Outro motivo' && (
                  <div>
                    <Label>Descreva o Motivo *</Label>
                    <Input value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} placeholder="Descreva o motivo" />
                  </div>
                )}
                <div>
                  <Label>Observações Adicionais</Label>
                  <Textarea
                    placeholder="Observações adicionais sobre a nota de crédito..."
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Resumo da Nota de Crédito
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
                    <span className="font-semibold text-lg">Total a Creditar:</span>
                    <span className="font-bold text-2xl text-red-600">{totais.total.toFixed(2)} MT</span>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Itens Selecionados:</span>
                  <span className="font-medium text-foreground">{totais.quantidadeItens}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Quantidade Total:</span>
                  <span className="font-medium text-foreground">
                    {itens.filter((i) => i.selecionado).reduce((acc, item) => acc + item.quantidadeCredito, 0)}
                  </span>
                </div>
              </div>
              {faturaSelecionada && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Fatura Original:</p>
                  <div className="bg-muted p-3 rounded-lg space-y-1">
                    <p className="font-medium">{faturaSelecionada.numeroFatura}</p>
                    <p className="text-sm text-muted-foreground">Total: {faturaSelecionada.total.toFixed(2)} MT</p>
                    <p className="text-sm text-muted-foreground">Data: {new Date(faturaSelecionada.dataEmissao).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" onClick={handleGerarNotaCredito} disabled={!faturaSelecionada || totais.quantidadeItens === 0 || !motivo}>
                <FileText className="h-4 w-4 mr-2" />
                Gerar Nota de Crédito
              </Button>
              <Button variant="outline" className="w-full" onClick={handleGerarNotaCredito} disabled={!faturaSelecionada || totais.quantidadeItens === 0 || !motivo}>
                <Save className="h-4 w-4 mr-2" />
                Guardar Rascunho
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogFaturaAberto} onOpenChange={setDialogFaturaAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Selecionar Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por número de fatura..."
                value={buscaFatura}
                onChange={(e) => setBuscaFatura(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {faturasFiltradas.map((fatura) => (
                <div
                  key={fatura.id}
                  className="p-4 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleSelecionarFatura(fatura)}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{fatura.numeroFatura}</h4>
                        <Badge variant={fatura.statusFatura === 'paga' ? 'default' : 'secondary'}>
                          {fatura.statusFatura}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                        <div>
                          <p>Data Emissão: {new Date(fatura.dataEmissao).toLocaleDateString('pt-PT')}</p>
                          <p>Itens: {fatura.itens.length}</p>
                        </div>
                        <div>
                          {fatura.dataPagamento && (
                            <p>Data Pagamento: {new Date(fatura.dataPagamento).toLocaleDateString('pt-PT')}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{fatura.total.toFixed(2)} MT</p>
                      <p className="text-xs text-muted-foreground">IVA: {fatura.ivaTotal.toFixed(2)} MT</p>
                    </div>
                  </div>
                </div>
              ))}
              {faturasFiltradas.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma fatura encontrada</p>
                  <p className="text-sm">Apenas faturas pagas ou emitidas podem gerar notas de crédito</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
