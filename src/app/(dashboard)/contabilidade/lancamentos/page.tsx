
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, FileText, Calendar } from 'lucide-react';
import { LancamentoContabil, PartidaContabil, PlanoContas } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<LancamentoContabil[]>([]);
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [filteredLancamentos, setFilteredLancamentos] = useState<LancamentoContabil[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLancamento, setEditingLancamento] = useState<LancamentoContabil | null>(null);
  const [partidas, setPartidas] = useState<PartidaContabil[]>([]);
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    historico: '',
    observacoes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterLancamentos();
  }, [searchTerm, lancamentos]);

  const loadData = () => {
    const storedLancamentos = localStorage.getItem('lancamentos_contabeis');
    if (storedLancamentos) {
      setLancamentos(JSON.parse(storedLancamentos));
    }

    const storedContas = localStorage.getItem('plano_contas');
    if (storedContas) {
      const parsed = JSON.parse(storedContas);
      setContas(parsed.filter((c: PlanoContas) => c.aceitaLancamento));
    }
  };

  const filterLancamentos = () => {
    if (!searchTerm) {
      setFilteredLancamentos(lancamentos);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = lancamentos.filter(lanc =>
      lanc.numero.toLowerCase().includes(term) ||
      lanc.historico.toLowerCase().includes(term)
    );
    setFilteredLancamentos(filtered);
  };

  const addPartida = () => {
    const novaPartida: PartidaContabil = {
      id: Date.now().toString(),
      contaId: '',
      contaCodigo: '',
      contaNome: '',
      tipo: 'debito',
      valor: 0
    };
    setPartidas([...partidas, novaPartida]);
  };

  const updatePartida = (index: number, field: keyof PartidaContabil, value: any) => {
    const updated = [...partidas];
    
    if (field === 'contaId') {
      const conta = contas.find(c => c.id === value);
      if (conta) {
        updated[index].contaId = conta.id;
        updated[index].contaCodigo = conta.codigo;
        updated[index].contaNome = conta.nome;
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    
    setPartidas(updated);
  };

  const removePartida = (index: number) => {
    setPartidas(partidas.filter((_, i) => i !== index));
  };

  const calcularTotais = () => {
    const totalDebito = partidas
      .filter(p => p.tipo === 'debito')
      .reduce((sum, p) => sum + Number(p.valor), 0);
    
    const totalCredito = partidas
      .filter(p => p.tipo === 'credito')
      .reduce((sum, p) => sum + Number(p.valor), 0);

    return { totalDebito, totalCredito };
  };

  const handleSubmit = () => {
    if (!formData.historico || partidas.length < 2) {
      toast.error('Preencha o histórico e adicione pelo menos 2 partidas');
      return;
    }

    const { totalDebito, totalCredito } = calcularTotais();
    
    if (Math.abs(totalDebito - totalCredito) > 0.01) {
      toast.error('O total de débitos deve ser igual ao total de créditos');
      return;
    }

    const now = new Date().toISOString();
    
    if (editingLancamento) {
      const updated = lancamentos.map(l =>
        l.id === editingLancamento.id
          ? {
              ...l,
              ...formData,
              partidas,
              valorTotal: totalDebito,
              dataAtualizacao: now
            }
          : l
      );
      setLancamentos(updated);
      localStorage.setItem('lancamentos_contabeis', JSON.stringify(updated));
      toast.success('Lançamento atualizado com sucesso');
    } else {
      const novoLancamento: LancamentoContabil = {
        id: Date.now().toString(),
        tenantId: 'default',
        numero: `LC${Date.now()}`,
        ...formData,
        tipo: 'manual',
        origem: 'manual',
        partidas,
        valorTotal: totalDebito,
        status: 'lancado',
        usuarioId: 'user1',
        usuarioNome: 'Usuário Sistema',
        dataCriacao: now,
        dataAtualizacao: now
      };

      const updated = [...lancamentos, novoLancamento];
      setLancamentos(updated);
      localStorage.setItem('lancamentos_contabeis', JSON.stringify(updated));
      
      atualizarSaldosContas(partidas);
      toast.success('Lançamento criado com sucesso');
    }

    resetForm();
    setIsDialogOpen(false);
  };

  const atualizarSaldosContas = (partidas: PartidaContabil[]) => {
    const storedContas = localStorage.getItem('plano_contas');
    if (!storedContas) return;

    const todasContas: PlanoContas[] = JSON.parse(storedContas);
    
    partidas.forEach(partida => {
      const contaIndex = todasContas.findIndex(c => c.id === partida.contaId);
      if (contaIndex !== -1) {
        const conta = todasContas[contaIndex];
        const valor = Number(partida.valor);
        
        if (conta.natureza === 'devedora') {
          todasContas[contaIndex].saldo += partida.tipo === 'debito' ? valor : -valor;
        } else {
          todasContas[contaIndex].saldo += partida.tipo === 'credito' ? valor : -valor;
        }
      }
    });

    localStorage.setItem('plano_contas', JSON.stringify(todasContas));
  };

  const handleDelete = (id: string) => {
    const updated = lancamentos.filter(l => l.id !== id);
    setLancamentos(updated);
    localStorage.setItem('lancamentos_contabeis', JSON.stringify(updated));
    toast.success('Lançamento excluído com sucesso');
  };

  const resetForm = () => {
    setFormData({
      data: new Date().toISOString().split('T')[0],
      historico: '',
      observacoes: ''
    });
    setPartidas([]);
    setEditingLancamento(null);
  };

  const { totalDebito, totalCredito } = calcularTotais();
  const diferenca = totalDebito - totalCredito;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Lançamentos Contábeis
          </h1>
          <p className="text-muted-foreground mt-1">
            Sistema de partidas dobradas
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingLancamento ? 'Editar Lançamento' : 'Novo Lançamento'}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data">Data *</Label>
                  <Input
                    id="data"
                    type="date"
                    value={formData.data}
                    onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="historico">Histórico *</Label>
                <Input
                  id="historico"
                  value={formData.historico}
                  onChange={(e) => setFormData({ ...formData, historico: e.target.value })}
                  placeholder="Descrição do lançamento"
                />
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Partidas *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addPartida}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Partida
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Conta</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partidas.map((partida, index) => (
                        <TableRow key={partida.id}>
                          <TableCell>
                            <Select
                              value={partida.contaId}
                              onValueChange={(value) => updatePartida(index, 'contaId', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a conta" />
                              </SelectTrigger>
                              <SelectContent>
                                {contas.map(conta => (
                                  <SelectItem key={conta.id} value={conta.id}>
                                    {conta.codigo} - {conta.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={partida.tipo}
                              onValueChange={(value) => updatePartida(index, 'tipo', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="debito">Débito</SelectItem>
                                <SelectItem value="credito">Crédito</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={partida.valor}
                              onChange={(e) => updatePartida(index, 'valor', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removePartida(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {partidas.length > 0 && (
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Total Débitos:</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(totalDebito)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Créditos:</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-MZ', {
                          style: 'currency',
                          currency: 'MZN'
                        }).format(totalCredito)}
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={Math.abs(diferenca) > 0.01}>
                {editingLancamento ? 'Atualizar' : 'Lançar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos Registrados</CardTitle>
          <CardDescription>
            Histórico de lançamentos contábeis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número ou histórico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-4">
            {filteredLancamentos.map(lancamento => (
              <Card key={lancamento.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono font-semibold">{lancamento.numero}</span>
                        <Badge variant={lancamento.status === 'lancado' ? 'default' : 'secondary'}>
                          {lancamento.status}
                        </Badge>
                        <Badge variant="outline">
                          {lancamento.tipo}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {new Date(lancamento.data).toLocaleDateString('pt-PT')}
                      </p>
                      <p className="mt-2">{lancamento.historico}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(lancamento.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Conta</TableHead>
                        <TableHead>Débito</TableHead>
                        <TableHead>Crédito</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lancamento.partidas.map(partida => (
                        <TableRow key={partida.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{partida.contaNome}</div>
                              <div className="text-sm text-muted-foreground">{partida.contaCodigo}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {partida.tipo === 'debito' && (
                              <span className="font-mono">
                                {new Intl.NumberFormat('pt-MZ', {
                                  style: 'currency',
                                  currency: 'MZN'
                                }).format(partida.valor)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {partida.tipo === 'credito' && (
                              <span className="font-mono">
                                {new Intl.NumberFormat('pt-MZ', {
                                  style: 'currency',
                                  currency: 'MZN'
                                }).format(partida.valor)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('pt-MZ', {
                            style: 'currency',
                            currency: 'MZN'
                          }).format(
                            lancamento.partidas
                              .filter(p => p.tipo === 'debito')
                              .reduce((sum, p) => sum + p.valor, 0)
                          )}
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('pt-MZ', {
                            style: 'currency',
                            currency: 'MZN'
                          }).format(
                            lancamento.partidas
                              .filter(p => p.tipo === 'credito')
                              .reduce((sum, p) => sum + p.valor, 0)
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredLancamentos.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum lançamento encontrado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
