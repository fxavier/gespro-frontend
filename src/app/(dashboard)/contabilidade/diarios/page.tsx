
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
import { Plus, BookOpen, Search, Calendar, Filter, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { LancamentoContabil, PartidaContabil, PlanoContas } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TipoDiario = 'todos' | 'vendas' | 'compras' | 'caixa' | 'banco' | 'manual';

interface DiarioResumo {
  tipo: string;
  quantidade: number;
  totalDebitos: number;
  totalCreditos: number;
  ultimoLancamento?: string;
}

export default function DiariosPage() {
  const [lancamentos, setLancamentos] = useState<LancamentoContabil[]>([]);
  const [filteredLancamentos, setFilteredLancamentos] = useState<LancamentoContabil[]>([]);
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [tipoDiarioAtivo, setTipoDiarioAtivo] = useState<TipoDiario>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [partidas, setPartidas] = useState<PartidaContabil[]>([]);
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    historico: '',
    origem: 'manual' as LancamentoContabil['origem'],
    observacoes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterLancamentos();
  }, [searchTerm, tipoDiarioAtivo, dataInicio, dataFim, lancamentos]);

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
    let filtered = [...lancamentos];

    if (tipoDiarioAtivo !== 'todos') {
      filtered = filtered.filter(l => l.origem === tipoDiarioAtivo);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(l =>
        l.numero.toLowerCase().includes(term) ||
        l.historico.toLowerCase().includes(term)
      );
    }

    if (dataInicio) {
      filtered = filtered.filter(l => l.data >= dataInicio);
    }

    if (dataFim) {
      filtered = filtered.filter(l => l.data <= dataFim);
    }

    filtered.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    setFilteredLancamentos(filtered);
  };

  const calcularResumosDiarios = (): DiarioResumo[] => {
    const tipos: TipoDiario[] = ['vendas', 'compras', 'caixa', 'banco', 'manual'];
    
    return tipos.map(tipo => {
      const lancamentosTipo = lancamentos.filter(l => l.origem === tipo);
      
      const totalDebitos = lancamentosTipo.reduce((sum, l) => {
        return sum + l.partidas
          .filter(p => p.tipo === 'debito')
          .reduce((s, p) => s + p.valor, 0);
      }, 0);

      const totalCreditos = lancamentosTipo.reduce((sum, l) => {
        return sum + l.partidas
          .filter(p => p.tipo === 'credito')
          .reduce((s, p) => s + p.valor, 0);
      }, 0);

      const ultimoLancamento = lancamentosTipo.length > 0
        ? lancamentosTipo.sort((a, b) => 
            new Date(b.data).getTime() - new Date(a.data).getTime()
          )[0].data
        : undefined;

      return {
        tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1),
        quantidade: lancamentosTipo.length,
        totalDebitos,
        totalCreditos,
        ultimoLancamento
      };
    });
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
    
    const novoLancamento: LancamentoContabil = {
      id: Date.now().toString(),
      tenantId: 'default',
      numero: `LC${Date.now()}`,
      ...formData,
      tipo: 'manual',
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

  const resetForm = () => {
    setFormData({
      data: new Date().toISOString().split('T')[0],
      historico: '',
      origem: 'manual',
      observacoes: ''
    });
    setPartidas([]);
  };

  const resumosDiarios = calcularResumosDiarios();
  const { totalDebito, totalCredito } = calcularTotais();
  const diferenca = totalDebito - totalCredito;

  const getTipoDiarioLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      vendas: 'Vendas',
      compras: 'Compras',
      caixa: 'Caixa',
      banco: 'Banco',
      manual: 'Manual',
      pagamento: 'Pagamento',
      recebimento: 'Recebimento',
      ajuste: 'Ajuste'
    };
    return labels[tipo] || tipo;
  };

  const getTipoDiarioColor = (tipo: string) => {
    const colors: Record<string, string> = {
      vendas: 'bg-green-500',
      compras: 'bg-blue-500',
      caixa: 'bg-yellow-500',
      banco: 'bg-purple-500',
      manual: 'bg-gray-500'
    };
    return colors[tipo] || 'bg-gray-500';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Diários Contabilísticos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestão de lançamentos por tipo de diário
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
              <DialogTitle>Novo Lançamento no Diário</DialogTitle>
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

                <div className="space-y-2">
                  <Label htmlFor="origem">Tipo de Diário *</Label>
                  <Select
                    value={formData.origem}
                    onValueChange={(value: LancamentoContabil['origem']) => 
                      setFormData({ ...formData, origem: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="venda">Vendas</SelectItem>
                      <SelectItem value="compra">Compras</SelectItem>
                      <SelectItem value="caixa">Caixa</SelectItem>
                      <SelectItem value="pagamento">Pagamento</SelectItem>
                      <SelectItem value="recebimento">Recebimento</SelectItem>
                    </SelectContent>
                  </Select>
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
                              <span className="text-destructive">×</span>
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
                        {new Intl.NumberFormat('pt-PT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }).format(totalDebito)} MT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Créditos:</span>
                      <span className="font-mono">
                        {new Intl.NumberFormat('pt-PT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }).format(totalCredito)} MT
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-bold">Diferença:</span>
                      <span className={`font-mono font-bold ${Math.abs(diferenca) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                        {new Intl.NumberFormat('pt-PT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }).format(diferenca)} MT
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
                Lançar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {resumosDiarios.map((resumo) => (
          <Card key={resumo.tipo} className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  Diário de {resumo.tipo}
                </CardTitle>
                <div className={`h-3 w-3 rounded-full ${getTipoDiarioColor(resumo.tipo.toLowerCase())}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lançamentos:</span>
                  <span className="font-semibold">{resumo.quantidade}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Débitos:
                  </span>
                  <span className="font-mono text-sm">
                    {new Intl.NumberFormat('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(resumo.totalDebitos)} MT
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Créditos:
                  </span>
                  <span className="font-mono text-sm">
                    {new Intl.NumberFormat('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(resumo.totalCreditos)} MT
                  </span>
                </div>
                {resumo.ultimoLancamento && (
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    Último: {new Date(resumo.ultimoLancamento).toLocaleDateString('pt-PT')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos por Diário</CardTitle>
          <CardDescription>
            Visualize e filtre lançamentos por tipo de diário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tipoDiarioAtivo} onValueChange={(value) => setTipoDiarioAtivo(value as TipoDiario)}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="vendas">Vendas</TabsTrigger>
              <TabsTrigger value="compras">Compras</TabsTrigger>
              <TabsTrigger value="caixa">Caixa</TabsTrigger>
              <TabsTrigger value="banco">Banco</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por número ou histórico..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    placeholder="Data início"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    placeholder="Data fim"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <TabsContent value={tipoDiarioAtivo} className="mt-6">
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
                              <Badge 
                                variant="outline"
                                className={getTipoDiarioColor(lancamento.origem)}
                              >
                                {getTipoDiarioLabel(lancamento.origem)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {new Date(lancamento.data).toLocaleDateString('pt-PT')}
                            </p>
                            <p className="mt-2">{lancamento.historico}</p>
                          </div>

                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Valor Total</div>
                            <div className="text-lg font-bold">
                              {new Intl.NumberFormat('pt-PT', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              }).format(lancamento.valorTotal)} MT
                            </div>
                          </div>
                        </div>

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Conta</TableHead>
                              <TableHead className="text-right">Débito</TableHead>
                              <TableHead className="text-right">Crédito</TableHead>
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
                                <TableCell className="text-right">
                                  {partida.tipo === 'debito' && (
                                    <span className="font-mono">
                                      {new Intl.NumberFormat('pt-PT', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      }).format(partida.valor)} MT
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {partida.tipo === 'credito' && (
                                    <span className="font-mono">
                                      {new Intl.NumberFormat('pt-PT', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      }).format(partida.valor)} MT
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="font-bold bg-muted/50">
                              <TableCell>Total</TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat('pt-PT', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                }).format(
                                  lancamento.partidas
                                    .filter(p => p.tipo === 'debito')
                                    .reduce((sum, p) => sum + p.valor, 0)
                                )} MT
                              </TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat('pt-PT', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                }).format(
                                  lancamento.partidas
                                    .filter(p => p.tipo === 'credito')
                                    .reduce((sum, p) => sum + p.valor, 0)
                                )} MT
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
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum lançamento encontrado neste diário</p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
