
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Landmark, CheckCircle2, XCircle } from 'lucide-react';
import { ReconciliacaoBancaria, ItemReconciliacao } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ReconciliacaoPage() {
  const [reconciliacoes, setReconciliacoes] = useState<ReconciliacaoBancaria[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    contaBancariaNome: '',
    dataInicio: new Date().toISOString().split('T')[0],
    dataFim: new Date().toISOString().split('T')[0],
    saldoInicialBanco: '',
    saldoFinalBanco: '',
    observacoes: ''
  });
  const [itens, setItens] = useState<ItemReconciliacao[]>([]);

  useEffect(() => {
    loadReconciliacoes();
  }, []);

  const loadReconciliacoes = () => {
    const stored = localStorage.getItem('reconciliacoes_bancarias');
    if (stored) {
      setReconciliacoes(JSON.parse(stored));
    }
  };

  const addItem = () => {
    const novoItem: ItemReconciliacao = {
      id: Date.now().toString(),
      tipo: 'extrato_bancario',
      data: new Date().toISOString().split('T')[0],
      descricao: '',
      valor: 0,
      tipoMovimento: 'credito',
      conciliado: false
    };
    setItens([...itens, novoItem]);
  };

  const updateItem = (index: number, field: keyof ItemReconciliacao, value: any) => {
    const updated = [...itens];
    updated[index] = { ...updated[index], [field]: value };
    setItens(updated);
  };

  const removeItem = (index: number) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  const calcularSaldos = () => {
    const saldoInicialContabil = itens
      .filter(i => i.conciliado)
      .reduce((sum, i) => {
        return sum + (i.tipoMovimento === 'credito' ? i.valor : -i.valor);
      }, 0);

    const saldoFinalContabil = parseFloat(formData.saldoInicialBanco) + saldoInicialContabil;
    const diferenca = parseFloat(formData.saldoFinalBanco) - saldoFinalContabil;

    return { saldoInicialContabil, saldoFinalContabil, diferenca };
  };

  const handleSubmit = () => {
    if (!formData.contaBancariaNome || !formData.saldoInicialBanco || !formData.saldoFinalBanco) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const { saldoInicialContabil, saldoFinalContabil, diferenca } = calcularSaldos();
    const now = new Date().toISOString();

    const novaReconciliacao: ReconciliacaoBancaria = {
      id: Date.now().toString(),
      tenantId: 'default',
      contaBancariaId: Date.now().toString(),
      contaBancariaNome: formData.contaBancariaNome,
      dataInicio: formData.dataInicio,
      dataFim: formData.dataFim,
      saldoInicialBanco: parseFloat(formData.saldoInicialBanco),
      saldoFinalBanco: parseFloat(formData.saldoFinalBanco),
      saldoInicialContabil,
      saldoFinalContabil,
      status: Math.abs(diferenca) < 0.01 ? 'concluida' : 'em_andamento',
      itens,
      diferencaNaoConciliada: diferenca,
      observacoes: formData.observacoes,
      usuarioId: 'user1',
      usuarioNome: 'Usuário Sistema',
      dataCriacao: now,
      dataAtualizacao: now
    };

    const updated = [...reconciliacoes, novaReconciliacao];
    setReconciliacoes(updated);
    localStorage.setItem('reconciliacoes_bancarias', JSON.stringify(updated));
    toast.success('Reconciliação criada com sucesso');

    resetForm();
    setIsDialogOpen(false);
  };

  const resetForm = () => {
    setFormData({
      contaBancariaNome: '',
      dataInicio: new Date().toISOString().split('T')[0],
      dataFim: new Date().toISOString().split('T')[0],
      saldoInicialBanco: '',
      saldoFinalBanco: '',
      observacoes: ''
    });
    setItens([]);
  };

  const { saldoInicialContabil, saldoFinalContabil, diferenca } = itens.length > 0 
    ? calcularSaldos() 
    : { saldoInicialContabil: 0, saldoFinalContabil: 0, diferenca: 0 };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Landmark className="h-8 w-8" />
            Reconciliação Bancária
          </h1>
          <p className="text-muted-foreground mt-1">
            Concilie extratos bancários com lançamentos contábeis
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Reconciliação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Reconciliação Bancária</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="conta">Conta Bancária *</Label>
                <Input
                  id="conta"
                  value={formData.contaBancariaNome}
                  onChange={(e) => setFormData({ ...formData, contaBancariaNome: e.target.value })}
                  placeholder="Nome da conta bancária"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataInicio">Data Início *</Label>
                  <Input
                    id="dataInicio"
                    type="date"
                    value={formData.dataInicio}
                    onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dataFim">Data Fim *</Label>
                  <Input
                    id="dataFim"
                    type="date"
                    value={formData.dataFim}
                    onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="saldoInicial">Saldo Inicial Banco *</Label>
                  <Input
                    id="saldoInicial"
                    type="number"
                    step="0.01"
                    value={formData.saldoInicialBanco}
                    onChange={(e) => setFormData({ ...formData, saldoInicialBanco: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="saldoFinal">Saldo Final Banco *</Label>
                  <Input
                    id="saldoFinal"
                    type="number"
                    step="0.01"
                    value={formData.saldoFinalBanco}
                    onChange={(e) => setFormData({ ...formData, saldoFinalBanco: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Itens do Extrato</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Item
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Conciliado</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={item.conciliado}
                              onCheckedChange={(checked) => updateItem(index, 'conciliado', checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={item.data}
                              onChange={(e) => updateItem(index, 'data', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.descricao}
                              onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                              placeholder="Descrição"
                            />
                          </TableCell>
                          <TableCell>
                            <select
                              className="w-full border rounded px-2 py-1"
                              value={item.tipoMovimento}
                              onChange={(e) => updateItem(index, 'tipoMovimento', e.target.value)}
                            >
                              <option value="credito">Crédito</option>
                              <option value="debito">Débito</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.valor}
                              onChange={(e) => updateItem(index, 'valor', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {itens.length > 0 && (
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Saldo Inicial Banco:</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(parseFloat(formData.saldoInicialBanco) || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Saldo Final Banco:</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(parseFloat(formData.saldoFinalBanco) || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Saldo Contábil:</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(saldoFinalContabil)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-bold">Diferença:</span>
                      <span className={`font-mono font-bold ${Math.abs(diferenca) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(diferenca)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Observações adicionais (opcional)"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>
                Criar Reconciliação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {reconciliacoes.map(reconciliacao => (
          <Card key={reconciliacao.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{reconciliacao.contaBancariaNome}</CardTitle>
                  <CardDescription>
                    {new Date(reconciliacao.dataInicio).toLocaleDateString('pt-PT')} até{' '}
                    {new Date(reconciliacao.dataFim).toLocaleDateString('pt-PT')}
                  </CardDescription>
                </div>
                <Badge variant={reconciliacao.status === 'concluida' ? 'default' : 'secondary'}>
                  {reconciliacao.status === 'concluida' ? (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1" />
                  )}
                  {reconciliacao.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-sm text-muted-foreground">Saldo Inicial Banco</div>
                  <div className="font-mono font-semibold">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: 'MZN'
                    }).format(reconciliacao.saldoInicialBanco)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Saldo Final Banco</div>
                  <div className="font-mono font-semibold">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: 'MZN'
                    }).format(reconciliacao.saldoFinalBanco)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Saldo Contábil</div>
                  <div className="font-mono font-semibold">
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: 'MZN'
                    }).format(reconciliacao.saldoFinalContabil)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Diferença</div>
                  <div className={`font-mono font-semibold ${Math.abs(reconciliacao.diferencaNaoConciliada) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                    {new Intl.NumberFormat('pt-MZ', {
                      style: 'currency',
                      currency: 'MZN'
                    }).format(reconciliacao.diferencaNaoConciliada)}
                  </div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliacao.itens.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{new Date(item.data).toLocaleDateString('pt-PT')}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.tipoMovimento}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(item.valor)}
                      </TableCell>
                      <TableCell>
                        {item.conciliado ? (
                          <Badge variant="default">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Conciliado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {reconciliacoes.length === 0 && (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              Nenhuma reconciliação encontrada
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
